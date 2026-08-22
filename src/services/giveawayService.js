// giveawayService.js

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getColor, botConfig } from '../config/bot.js';
import { getEndedGiveaways, markGiveawayEnded, getTicketData, saveTicketData } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { createTicket } from './ticket.js';

const GIVEAWAY_CONFIG = botConfig.giveaways || {};
const GIVEAWAY_INTERACTION_COOLDOWN = 1000;
const WINNER_TICKET_AUTO_CLOSE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Opens one prize-claim ticket per winner and schedules it to auto-close in 24h.
 * Failures for individual winners are logged and skipped so one bad fetch
 * doesn't stop the rest of the winners from getting their ticket.
 */
export async function openWinnerTickets(client, guild, giveaway, winners) {
    if (!guild || !Array.isArray(winners) || winners.length === 0) {
        return [];
    }

    const opened = [];

    for (const winnerId of winners) {
        try {
            const member = await guild.members.fetch(winnerId).catch(() => null);
            if (!member) {
                logger.warn(`Could not fetch winner ${winnerId} in guild ${guild.id} to open a ticket`);
                continue;
            }

            const { channel, ticketData } = await createTicket(
                guild,
                member,
                null,
                `Prize claim: ${giveaway.prize || 'Giveaway prize'}`,
                'none',
            );

            const autoCloseAt = new Date(Date.now() + WINNER_TICKET_AUTO_CLOSE_MS).toISOString();
            const freshTicketData = (await getTicketData(guild.id, channel.id)) || ticketData;
            freshTicketData.autoCloseAt = autoCloseAt;
            freshTicketData.giveawayMessageId = giveaway.messageId;
            await saveTicketData(guild.id, channel.id, freshTicketData);

            await channel.send({
                content: `🎉 ${member} Congratulations on winning **${giveaway.prize || 'the giveaway'}**! A member of staff will be with you shortly to sort out your prize. This ticket will automatically close in 24 hours.`,
            }).catch((sendError) => {
                logger.warn(`Could not send winner message in ticket ${channel.id}: ${sendError.message}`);
            });

            opened.push({ winnerId, channelId: channel.id });
        } catch (error) {
            logger.error(`Failed to open winner ticket for ${winnerId} in guild ${guild.id}:`, error);
        }
    }

    return opened;
}

function getGiveawayInteractionKey(userId, giveawayId) {
    return `giveaway:${userId}:${giveawayId}`;
}

export function parseDuration(durationString) {
    if (!durationString || typeof durationString !== 'string') {
        throw new TitanBotError(
            'Invalid duration format provided',
            ErrorTypes.VALIDATION,
            'Please provide a valid duration (e.g., 1h, 30m, 5d, 10s).',
            { durationString }
        );
    }

    const regex = /^(\d+)([hmds])$/i;
    const match = durationString.trim().match(regex);

    if (!match) {
        throw new TitanBotError(
            `Invalid duration format: ${durationString}`,
            ErrorTypes.VALIDATION,
            'Invalid duration format. Use: 1h, 30m, 5d, 10s (min: 10s, max: 30d)',
            { input: durationString }
        );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (amount <= 0 || amount > 999) {
        throw new TitanBotError(
            `Duration amount out of range: ${amount}`,
            ErrorTypes.VALIDATION,
            'Duration amount must be between 1 and 999.',
            { amount, unit }
        );
    }

    let ms = 0;
    switch (unit) {
        case 's':
            ms = amount * 1000;
            break;
        case 'm':
            ms = amount * 60 * 1000;
            break;
        case 'h':
            ms = amount * 60 * 60 * 1000;
            break;
        case 'd':
            ms = amount * 24 * 60 * 60 * 1000;
            break;
        default:
            throw new TitanBotError(
                `Unknown duration unit: ${unit}`,
                ErrorTypes.VALIDATION,
                'Please use s (seconds), m (minutes), h (hours), or d (days).',
                { unit }
            );
    }

    const maxDuration = GIVEAWAY_CONFIG.maximumDuration ?? 30 * 24 * 60 * 60 * 1000;
    if (ms > maxDuration) {
        throw new TitanBotError(
            `Duration exceeds maximum: ${ms}ms > ${maxDuration}ms`,
            ErrorTypes.VALIDATION,
            `Maximum duration is ${Math.floor(maxDuration / (24 * 60 * 60 * 1000))} days.`,
            { requestedMs: ms, maxMs: maxDuration }
        );
    }

    const minDuration = GIVEAWAY_CONFIG.minimumDuration ?? 10 * 1000;
    if (ms < minDuration) {
        throw new TitanBotError(
            `Duration below minimum: ${ms}ms < ${minDuration}ms`,
            ErrorTypes.VALIDATION,
            `Minimum duration is ${Math.ceil(minDuration / 1000)} seconds.`,
            { requestedMs: ms, minMs: minDuration }
        );
    }

    return ms;
}

export function validatePrize(prize) {
    if (!prize || typeof prize !== 'string') {
        throw new TitanBotError(
            'Prize must be a non-empty string',
            ErrorTypes.VALIDATION,
            'Please provide a valid prize description.',
            { prize }
        );
    }

    const trimmed = prize.trim();
    if (trimmed.length === 0 || trimmed.length > 256) {
        throw new TitanBotError(
            `Prize length out of range: ${trimmed.length}`,
            ErrorTypes.VALIDATION,
            'Prize must be between 1 and 256 characters.',
            { length: trimmed.length }
        );
    }

    return trimmed;
}

export function validateWinnerCount(winnerCount) {
    const minimumWinners = GIVEAWAY_CONFIG.minimumWinners ?? 1;
    const maximumWinners = GIVEAWAY_CONFIG.maximumWinners ?? 10;

    if (!Number.isInteger(winnerCount) || winnerCount < minimumWinners || winnerCount > maximumWinners) {
        throw new TitanBotError(
            `Invalid winner count: ${winnerCount}`,
            ErrorTypes.VALIDATION,
            `Winner count must be between ${minimumWinners} and ${maximumWinners}.`,
            { winnerCount, minimumWinners, maximumWinners }
        );
    }
}

export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        const statusEmoji = status === 'ended' ? '🎉' : status === 'reroll' ? '🔄' : '🎉';
        const isEnded = status === 'ended' || status === 'reroll';
        const color = isEnded ? getColor('giveaway.ended') : getColor('giveaway.active');
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${giveaway.prize}`)
            .setDescription('React with the button below to enter!')
            .setColor(color)
            .addFields(
                { name: '👤 Hosted by', value: `<@${giveaway.hostId}>`, inline: true },
                { name: '🏆 Winners', value: giveaway.winnerCount.toString(), inline: true },
                { name: '👥 Entries', value: giveaway.participants?.length?.toString() || '0', inline: true }
            );

        if (isEnded) {
            const winnerDisplay = winners.length > 0 
                ? winners.map(id => `<@${id}>`).join(', ')
                : 'No valid entries';
            embed.addFields({ name: '🎯 Winners', value: winnerDisplay, inline: false });
        } else {
            const endTime = giveaway.endsAt || giveaway.endTime;
            embed.addFields({ name: '⏰ Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: false });
        }

        embed.setTimestamp();
        
        return embed;
    } catch (error) {
        logger.error('Error creating giveaway embed:', error);
        throw new TitanBotError(
            'Failed to create giveaway embed',
            ErrorTypes.UNKNOWN,
            'An internal error occurred while formatting the giveaway.',
            { error: error.message }
        );
    }
}

export function createGiveawayButtons(ended = false) {
    try {
        const row = new ActionRowBuilder();

        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Reroll')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ View Winners')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Join')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 End')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(false)
            );
        }

        return row;
    } catch (error) {
        logger.error('Error creating giveaway buttons:', error);
        throw new TitanBotError(
            'Failed to create giveaway buttons',
            ErrorTypes.UNKNOWN,
            'An internal error occurred while creating interactive buttons.',
            { error: error.message }
        );
    }
}

export function selectWinners(participants, winnerCount) {
    if (!Array.isArray(participants) || participants.length === 0) {
        return [];
    }

    const uniqueParticipants = [...new Set(participants)];

    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
        throw new TitanBotError(
            'Invalid winner count for selection',
            ErrorTypes.VALIDATION,
            'Winner count must be at least 1.',
            { winnerCount }
        );
    }

    const requested = Math.min(winnerCount, uniqueParticipants.length);
    
    try {
        
        const shuffled = [...uniqueParticipants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    } catch (error) {
        logger.error('Error selecting winners:', error);
        throw new TitanBotError(
            'Failed to select winners',
            ErrorTypes.UNKNOWN,
            'An error occurred while selecting winners.',
            { error: error.message, participantCount: participants.length }
        );
    }
}

export function isUserRateLimited(userId, giveawayId) {
    const status = getRateLimitStatus(
        getGiveawayInteractionKey(userId, giveawayId),
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
    return status.attempts >= 1 && status.remaining > 0;
}

export async function recordUserInteraction(userId, giveawayId) {
    await checkRateLimit(
        getGiveawayInteractionKey(userId, giveawayId),
        1,
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
}

export async function endGiveaway(client, giveaway, guildId, endedBy) {
    try {
        if (!giveaway) {
            throw new TitanBotError(
                'Giveaway object is null or undefined',
                ErrorTypes.VALIDATION,
                'Cannot end a non-existent giveaway.',
                { giveaway }
            );
        }

        if (giveaway.ended === true || giveaway.isEnded === true) {
            throw new TitanBotError(
                `Giveaway ${giveaway.messageId} is already ended`,
                ErrorTypes.VALIDATION,
                'This giveaway has already ended.',
                { giveawayId: giveaway.messageId, status: 'already_ended' }
            );
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const updatedGiveaway = {
            ...giveaway,
            ended: true,
            isEnded: true,
            winnerIds: winners,
            endedAt: new Date().toISOString(),
            endedBy: endedBy,
            participantCount: participants.length
        };

        logger.info(`Ending giveaway ${giveaway.messageId}: selected ${winners.length} winners from ${participants.length} entries`);

        return {
            giveaway: updatedGiveaway,
            winners: winners,
            participantCount: participants.length
        };
    } catch (error) {
        if (error instanceof TitanBotError) {
            logger.debug(`Giveaway end validation error: ${error.message}`, error.context || {});
            throw error;
        }
        logger.error('Error ending giveaway:', error);
        throw new TitanBotError(
            'Failed to end giveaway',
            ErrorTypes.UNKNOWN,
            'An error occurred while ending the giveaway.',
            { error: error.message, giveawayId: giveaway?.messageId }
        );
    }
}

/**
 * Checks every guild's dailyGiveaway config once a minute and starts a new
 * giveaway when the current UTC time matches the configured time and one
 * hasn't already been started today (UTC date).
 */
export async function checkDailyGiveaways(client) {
  try {
    const { getGuildConfig } = await import('./config/guildConfig.js');
    const { setConfigValue } = await import('./config/guildConfig.js');
    const { saveGiveaway } = await import('../utils/giveaways.js');

    const now = new Date();
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const currentDate = now.toISOString().slice(0, 10);

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const config = await getGuildConfig(client, guildId);
        const daily = config?.dailyGiveaway;

        if (!daily?.enabled || !daily.time || !daily.channelId) {
          continue;
        }

        if (daily.time !== currentTime || daily.lastTriggeredDate === currentDate) {
          continue;
        }

        const channel = await guild.channels.fetch(daily.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          logger.warn(`Daily giveaway channel ${daily.channelId} not found/text in guild ${guildId}, skipping`);
          await setConfigValue(client, guildId, 'dailyGiveaway', { ...daily, lastTriggeredDate: currentDate });
          continue;
        }

        const durationMs = parseDuration(daily.durationString);
        const prizeName = validatePrize(daily.prize);
        validateWinnerCount(daily.winnerCount || 1);

        const endTime = Date.now() + durationMs;
        const initialGiveawayData = {
          messageId: 'placeholder',
          channelId: channel.id,
          guildId,
          prize: prizeName,
          hostId: client.user.id,
          endTime,
          endsAt: endTime,
          winnerCount: daily.winnerCount || 1,
          participants: [],
          isEnded: false,
          ended: false,
          createdAt: new Date().toISOString(),
        };

        const embed = createGiveawayEmbed(initialGiveawayData, 'active');
        const row = createGiveawayButtons(false);

        const pingRoleId = config?.giveawayPingRoleId || null;
        const pingContent = pingRoleId ? `<@&${pingRoleId}> ` : '';

        const giveawayMessage = await channel.send({
          content: `${pingContent}🎉 **DAILY GIVEAWAY** 🎉`,
          embeds: [embed],
          components: [row],
          allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
        });

        initialGiveawayData.messageId = giveawayMessage.id;
        await saveGiveaway(client, guildId, initialGiveawayData);

        await setConfigValue(client, guildId, 'dailyGiveaway', { ...daily, lastTriggeredDate: currentDate });

        logger.info(`Started daily giveaway ${giveawayMessage.id} in guild ${guildId} (channel ${channel.id})`);
      } catch (error) {
        logger.error(`Error starting daily giveaway for guild ${guildId}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error checking daily giveaways:', error);
  }
}

export async function checkGiveaways(client) {
  try {
    if (!client.db) {
      logger.warn('Database not available for giveaway check');
      return;
    }

    const endedGiveaways = await getEndedGiveaways(client);
    
    if (endedGiveaways.length === 0) {
      return;
    }

    logger.info(`Processing ${endedGiveaways.length} ended giveaways`);

    for (const giveawayRecord of endedGiveaways) {
      try {
        const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = giveawayRecord;
        const giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          logger.debug(`Guild ${guildId} not found, skipping giveaway ${messageId}`);
          continue;
        }

        const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) {
          logger.debug(`Channel ${giveaway.channelId} not found for giveaway ${messageId}`);
          continue;
        }

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          logger.debug(`Message ${messageId} not found for giveaway in channel ${giveaway.channelId}`);
          continue;
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const winnerMentions = winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'No valid entries!';

        const endedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);

        await message.edit({
          embeds: [endedEmbed],
          components: [createGiveawayButtons(true)]
        });

        giveaway.ended = true;
        giveaway.isEnded = true;
        giveaway.winnerIds = winners;
        giveaway.endedAt = new Date().toISOString();

        const markedSuccess = await markGiveawayEnded(client, giveawayId, giveaway);
        if (!markedSuccess) {
          logger.warn(`Failed to mark giveaway ${messageId} as ended in database`);
        }

        if (winners.length > 0) {
          const winnerAnnouncement = `🎉 Congratulations ${winnerMentions}! You won the **${giveaway.prize || 'giveaway'}**! Please contact <@${giveaway.hostId}> to claim your prize.`;
          const winnerPingMsg = await channel.send({ content: winnerAnnouncement });
          giveaway.winnerPingMessageId = winnerPingMsg.id;
          await markGiveawayEnded(client, giveawayId, giveaway);

          try {
            await logEvent({
              client,
              guildId,
              eventType: EVENT_TYPES.GIVEAWAY_WINNER,
              data: {
                description: `Giveaway ended with ${winners.length} winner(s)`,
                channelId: channel.id,
                fields: [
                  {
                    name: '🎁 Prize',
                    value: giveaway.prize || 'Mystery Prize!',
                    inline: true
                  },
                  {
                    name: '🏆 Winners',
                    value: winners.map(id => `<@${id}>`).join(', '),
                    inline: false
                  },
                  {
                    name: '👥 Entries',
                    value: participants.length.toString(),
                    inline: true
                  }
                ]
              }
            });
          } catch (error) {
            logger.debug('Error logging giveaway winner:', error);
          }

          await openWinnerTickets(client, guild, giveaway, winners);
        } else {
          await channel.send({ content: `The giveaway for **${giveaway.prize}** has ended with no valid entries.` });
        }

        logger.info(`Ended giveaway ${messageId} in guild ${guildId}`);
      } catch (error) {
        logger.error(`Error processing giveaway:`, error);
      }
    }
  } catch (error) {
    logger.error('Error checking giveaways:', error);
  }
}

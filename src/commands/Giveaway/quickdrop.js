import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import {
    parseDuration,
    validatePrize,
    validateWinnerCount,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

import { botConfig } from '../../config/bot.js';

const QUICKDROP_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const QUICKDROP_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("quickdrop")
        .setDescription("Instantly starts a quick drop giveaway.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription("How long the quick drop should last (e.g., 5m, 1h).")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("The number of winners to pick.")
                .setMinValue(QUICKDROP_MIN_WINNERS)
                .setMaxValue(QUICKDROP_MAX_WINNERS)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("The prize being dropped.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("The channel to send the quick drop to (defaults to current channel).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        ),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Quickdrop command used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id }
            );
        }

        const guildConfigForAccess = await getGuildConfig(interaction.client, interaction.guildId).catch(() => null);
        const accessRoleId = guildConfigForAccess?.quickDropAccessRoleId || null;
        const hasManageGuild = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
        const hasAccessRole = accessRoleId ? interaction.member.roles.cache.has(accessRoleId) : false;

        if (!hasManageGuild && !hasAccessRole) {
            throw new TitanBotError(
                'User lacks permission to create a quick drop',
                ErrorTypes.PERMISSION,
                "You do not have permission to create a quick drop.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Quick drop creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

        const durationMs = parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prizeName = validatePrize(prize);

        if (!targetChannel.isTextBased()) {
            throw new TitanBotError(
                'Target channel is not text-based',
                ErrorTypes.VALIDATION,
                'The channel must be a text channel.',
                { channelId: targetChannel.id, channelType: targetChannel.type }
            );
        }

        const endTime = Date.now() + durationMs;

        const initialGiveawayData = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            createdAt: new Date().toISOString()
        };

        const embed = createGiveawayEmbed(initialGiveawayData, "active");
        const row = createGiveawayButtons(false);

        const pingRoleId = guildConfigForAccess?.quickDropPingRoleId || null;
        const pingContent = pingRoleId ? `<@&${pingRoleId}> ` : "";

        const dropMessage = await targetChannel.send({
            content: `${pingContent}⚡ **QUICK DROP** ⚡`,
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
        });

        initialGiveawayData.messageId = dropMessage.id;
        const saved = await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!saved) {
            logger.warn(`Failed to save quick drop to database: ${dropMessage.id}`);
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `Quick drop created: ${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        { name: 'Prize', value: prizeName, inline: true },
                        { name: 'Winners', value: winnerCount.toString(), inline: true },
                        { name: 'Duration', value: durationString, inline: true },
                        { name: 'Channel', value: targetChannel.toString(), inline: true }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging quick drop creation event:', logError);
        }

        logger.info(`Quick drop created successfully: ${dropMessage.id} in ${targetChannel.name}`);

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Quick Drop Started! ⚡`,
                    `A quick drop for **${prizeName}** has been started in ${targetChannel} and will end in **${durationString}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

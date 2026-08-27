import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
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

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Starts a new giveaway in a specified channel.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription("How long the giveaway should last (e.g., 1h, 30m, 5d).")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("The number of winners to pick.")
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("The prize being given away.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("The channel to send the giveaway to (defaults to current channel).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        ),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Giveaway command used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id }
            );
        }

        // Fetch dynamic guild config set via /configwizard or /setaccsgiveaway
        const guildConfig = await getGuildConfig(interaction.client, interaction.guildId).catch(() => null);

        // Permissions logic: Manage Guild OR botConfig allowed roles OR configured giveaway access role OR moderator role
        const allowedRoles = botConfig.giveaways?.allowedRoles || [];
        const hasManageGuild = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
        const hasAllowedRole = interaction.member.roles.cache.some((role) => allowedRoles.includes(role.id));
        
        // Checks specifically for giveawayAccessRoleId set by /setaccsgiveaway, falling back to moderatorRoleId
        const customAccessRoleId = guildConfig?.giveawayAccessRoleId || guildConfig?.moderatorRoleId;
        const hasCustomAccessRole = customAccessRoleId 
            ? interaction.member.roles.cache.has(customAccessRoleId) 
            : false;

        if (!hasManageGuild && !hasAllowedRole && !hasCustomAccessRole) {
            throw new TitanBotError(
                'User lacks permission to host giveaway',
                ErrorTypes.PERMISSION,
                "You do not have permission to start a giveaway.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

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

        const pingRoleId = guildConfig?.giveawayPingRoleId || null;
        const pingContent = pingRoleId ? `<@&${pingRoleId}> ` : "";

        const giveawayMessage = await targetChannel.send({
            content: `${pingContent}🎉 **NEW GIVEAWAY** 🎉`,
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
        });

        initialGiveawayData.messageId = giveawayMessage.id;
        const saved = await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!saved) {
            logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `Giveaway created: ${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Prize',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: 'Winners',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Duration',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: 'Channel',
                            value: targetChannel.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway creation event:', logError);
        }

        logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Giveaway Started! 🎉`,
                    `A new giveaway for **${prizeName}** has been started in ${targetChannel} and will end in **${durationString}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

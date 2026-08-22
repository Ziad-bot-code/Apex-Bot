import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { setConfigValue, getGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { parseDuration, validatePrize, validateWinnerCount } from '../../services/giveawayService.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default {
    data: new SlashCommandBuilder()
        .setName('setdailygiveaway')
        .setDescription('Configures an automatic daily giveaway that starts at a set UTC time each day.')
        .addStringOption((option) =>
            option
                .setName('time')
                .setDescription('24h UTC time to start the giveaway each day, e.g. 18:00')
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('The channel the daily giveaway should be posted in.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('prize')
                .setDescription('The prize for the daily giveaway.')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('duration')
                .setDescription('How long each daily giveaway should run for, e.g. 1h, 30m, 5h.')
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName('winners')
                .setDescription('Number of winners for each daily giveaway.')
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName('enabled')
                .setDescription('Whether the daily giveaway should be active. Defaults to true.')
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'setdailygiveaway used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id },
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "You need the 'Manage Server' permission to set up the daily giveaway.",
                { userId: interaction.user.id, guildId: interaction.guildId },
            );
        }

        const time = interaction.options.getString('time').trim();
        const channel = interaction.options.getChannel('channel');
        const prizeInput = interaction.options.getString('prize');
        const durationString = interaction.options.getString('duration').trim();
        const winnerCount = interaction.options.getInteger('winners');
        const enabledOption = interaction.options.getBoolean('enabled');
        const enabled = enabledOption === null ? true : enabledOption;

        if (!TIME_PATTERN.test(time)) {
            throw new TitanBotError(
                'Invalid daily giveaway time format',
                ErrorTypes.VALIDATION,
                'Time must be in 24h UTC format, e.g. 18:00 or 09:30.',
                { time },
            );
        }

        if (!channel.isTextBased()) {
            throw new TitanBotError(
                'Daily giveaway channel is not text-based',
                ErrorTypes.VALIDATION,
                'The channel must be a text channel.',
                { channelId: channel.id, channelType: channel.type },
            );
        }

        // Validate now so the admin gets immediate feedback instead of a silent failure at trigger time.
        parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prize = validatePrize(prizeInput);

        const existingConfig = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
        const existingDaily = existingConfig?.dailyGiveaway || {};

        const dailyGiveaway = {
            enabled,
            time,
            channelId: channel.id,
            prize,
            durationString,
            winnerCount,
            // Reset so a same-day config change doesn't block today's run if the new time is still ahead.
            lastTriggeredDate: existingDaily.time === time ? existingDaily.lastTriggeredDate || null : null,
        };

        await setConfigValue(interaction.client, interaction.guildId, 'dailyGiveaway', dailyGiveaway);

        logger.info(
            `Daily giveaway ${enabled ? 'configured' : 'disabled'} for guild ${interaction.guildId} by ${interaction.user.tag}: time=${time}, channel=${channel.id}, prize=${prize}, duration=${durationString}, winners=${winnerCount}`,
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    'Daily Giveaway Configured',
                    enabled
                        ? `A giveaway for **${prize}** will start automatically in ${channel} at **${time} UTC** every day, running for **${durationString}** with **${winnerCount}** winner(s).`
                        : `Daily giveaway settings saved for ${channel}, but it's currently **disabled**. Run this command again with \`enabled: true\` to turn it on.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

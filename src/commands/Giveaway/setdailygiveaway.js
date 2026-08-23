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
        .addBooleanOption((option) =>
            option
                .setName('enabled')
                .setDescription('Turn the daily giveaway on or off. Other options are only needed the first time.')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('time')
                .setDescription('24h UTC time to start the giveaway each day, e.g. 18:00')
                .setRequired(false),
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('The channel the daily giveaway should be posted in.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('prize')
                .setDescription('The prize for the daily giveaway.')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('duration')
                .setDescription('How long each daily giveaway should run for, e.g. 1h, 30m, 5h.')
                .setRequired(false),
        )
        .addIntegerOption((option) =>
            option
                .setName('winners')
                .setDescription('Number of winners for each daily giveaway.')
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false),
        )
        .addRoleOption((option) =>
            option
                .setName('ping')
                .setDescription('Role to ping when the daily giveaway starts. Leave empty to keep the current setting.')
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

        const existingConfig = await getGuildConfig(interaction.client, interaction.guildId).catch(() => ({}));
        const existingDaily = existingConfig?.dailyGiveaway || {};

        const timeOption = interaction.options.getString('time');
        const channelOption = interaction.options.getChannel('channel');
        const prizeOption = interaction.options.getString('prize');
        const durationOption = interaction.options.getString('duration');
        const winnerCountOption = interaction.options.getInteger('winners');
        const pingRoleOption = interaction.options.getRole('ping');
        const enabledOption = interaction.options.getBoolean('enabled');

        const time = timeOption ? timeOption.trim() : existingDaily.time || null;
        const channelId = channelOption ? channelOption.id : existingDaily.channelId || null;
        const durationString = durationOption ? durationOption.trim() : existingDaily.durationString || null;
        const winnerCount = winnerCountOption ?? existingDaily.winnerCount ?? null;
        const pingRoleId = pingRoleOption ? pingRoleOption.id : existingDaily.pingRoleId || null;
        // Toggling enabled on its own shouldn't require re-typing everything else, so only
        // default to true the very first time this is configured.
        const enabled = enabledOption === null
            ? (existingDaily.time ? existingDaily.enabled !== false : true)
            : enabledOption;

        if (!time || !channelId || !durationString || !winnerCount) {
            throw new TitanBotError(
                'Daily giveaway not fully configured',
                ErrorTypes.VALIDATION,
                'The daily giveaway has never been fully set up. Please provide time, channel, prize, duration, and winners at least once.',
                { guildId: interaction.guildId },
            );
        }

        if (!TIME_PATTERN.test(time)) {
            throw new TitanBotError(
                'Invalid daily giveaway time format',
                ErrorTypes.VALIDATION,
                'Time must be in 24h UTC format, e.g. 18:00 or 09:30.',
                { time },
            );
        }

        const channel = channelOption || await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            throw new TitanBotError(
                'Daily giveaway channel is not text-based or not found',
                ErrorTypes.VALIDATION,
                'The channel must be a valid text channel.',
                { channelId },
            );
        }

        // Validate now so the admin gets immediate feedback instead of a silent failure at trigger time.
        parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prize = validatePrize(prizeOption || existingDaily.prize);

        const dailyGiveaway = {
            enabled,
            time,
            channelId,
            prize,
            durationString,
            winnerCount,
            pingRoleId,
            // Reset so a same-day config change doesn't block today's run if the new time is still ahead.
            lastTriggeredDate: existingDaily.time === time ? existingDaily.lastTriggeredDate || null : null,
        };

        await setConfigValue(interaction.client, interaction.guildId, 'dailyGiveaway', dailyGiveaway);

        logger.info(
            `Daily giveaway ${enabled ? 'configured' : 'disabled'} for guild ${interaction.guildId} by ${interaction.user.tag}: time=${time}, channel=${channelId}, prize=${prize}, duration=${durationString}, winners=${winnerCount}, pingRole=${pingRoleId || 'none'}`,
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    enabled ? 'Daily Giveaway Enabled' : 'Daily Giveaway Disabled',
                    enabled
                        ? `A giveaway for **${prize}** will start automatically in ${channel} at **${time} UTC** every day, running for **${durationString}** with **${winnerCount}** winner(s).${pingRoleId ? ` <@&${pingRoleId}> will be pinged each time.` : ''}`
                        : `The daily giveaway is now **off**. Your settings are saved — run \`/setdailygiveaway enabled: True\` to turn it back on without re-entering anything.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

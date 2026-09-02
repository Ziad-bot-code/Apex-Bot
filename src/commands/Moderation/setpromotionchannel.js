import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { setConfigValue } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setpromotionchannel')
        .setDescription('Sets the channel where /promote and /demote announcements are posted.')
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('The channel for promotion/demotion announcements. Leave empty to post in the command channel instead.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'setpromotionchannel used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id },
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "You need the 'Manage Server' permission to set the promotion channel.",
                { userId: interaction.user.id, guildId: interaction.guildId },
            );
        }

        const channel = interaction.options.getChannel('channel');

        await setConfigValue(interaction.client, interaction.guildId, 'promotionLogChannelId', channel ? channel.id : null);

        logger.info(
            channel
                ? `Promotion log channel set to ${channel.id} in guild ${interaction.guildId} by ${interaction.user.tag}`
                : `Promotion log channel cleared in guild ${interaction.guildId} by ${interaction.user.tag}`,
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    'Promotion Channel Updated',
                    channel
                        ? `\`/promote\` and \`/demote\` announcements will now be posted in ${channel}.`
                        : 'Promotion channel cleared. Announcements will now be posted in whichever channel the command is run in.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

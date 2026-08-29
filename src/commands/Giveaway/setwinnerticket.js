import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { setConfigValue } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setwinnerticket')
        .setDescription('Turns automatic prize-claim tickets for giveaway winners on or off.')
        .addBooleanOption((option) =>
            option
                .setName('enabled')
                .setDescription('Whether winners should automatically get a private ticket.')
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'setwinnerticket used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id },
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "You need the 'Manage Server' permission to change this setting.",
                { userId: interaction.user.id, guildId: interaction.guildId },
            );
        }

        const enabled = interaction.options.getBoolean('enabled');

        await setConfigValue(interaction.client, interaction.guildId, 'winnerTicketEnabled', enabled);

        logger.info(
            `Winner auto-ticket ${enabled ? 'enabled' : 'disabled'} for guild ${interaction.guildId} by ${interaction.user.tag}`,
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    enabled ? 'Winner Tickets Enabled' : 'Winner Tickets Disabled',
                    enabled
                        ? 'Giveaway winners will now automatically get a private prize-claim ticket when a giveaway ends.'
                        : 'Giveaway winners will no longer automatically get a ticket when they win. Winner announcements still happen as normal.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

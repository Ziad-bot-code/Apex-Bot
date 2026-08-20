import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { setConfigValue } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setgiveawayrole')
        .setDescription('Sets the role that gets pinged whenever a new giveaway starts.')
        .addRoleOption((option) =>
            option
                .setName('role')
                .setDescription('The role to ping on new giveaways. Leave empty to clear it.')
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'setgiveawayrole used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id },
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "You need the 'Manage Server' permission to set the giveaway ping role.",
                { userId: interaction.user.id, guildId: interaction.guildId },
            );
        }

        const role = interaction.options.getRole('role');

        await setConfigValue(interaction.client, interaction.guildId, 'giveawayPingRoleId', role ? role.id : null);

        logger.info(
            role
                ? `Giveaway ping role set to ${role.name} (${role.id}) in guild ${interaction.guildId} by ${interaction.user.tag}`
                : `Giveaway ping role cleared in guild ${interaction.guildId} by ${interaction.user.tag}`,
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    'Giveaway Ping Role Updated',
                    role
                        ? `New giveaways will now ping ${role}.`
                        : 'Giveaway ping role has been cleared. New giveaways will no longer ping a role.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { setConfigValue } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setquickdrop')
        .setDescription('Configures who can create quick drops and which role gets pinged.')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('access')
                .setDescription('Sets the role allowed to create quick drops with /quickdrop.')
                .addRoleOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The role allowed to run /quickdrop. Leave empty to clear it.')
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('ping')
                .setDescription('Sets the role pinged whenever a quick drop is created.')
                .addRoleOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The role to ping on new quick drops. Leave empty to clear it.')
                        .setRequired(false),
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'setquickdrop used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id },
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "You need the 'Manage Server' permission to configure quick drops.",
                { userId: interaction.user.id, guildId: interaction.guildId },
            );
        }

        const subcommand = interaction.options.getSubcommand();
        const role = interaction.options.getRole('role');

        if (subcommand === 'access') {
            await setConfigValue(interaction.client, interaction.guildId, 'quickDropAccessRoleId', role ? role.id : null);

            logger.info(
                role
                    ? `Quick drop access role set to ${role.id} in guild ${interaction.guildId} by ${interaction.user.tag}`
                    : `Quick drop access role cleared in guild ${interaction.guildId} by ${interaction.user.tag}`,
            );

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        'Quick Drop Access Updated',
                        role
                            ? `Members with ${role} (in addition to Manage Server) can now create quick drops with \`/quickdrop\`.`
                            : 'Quick drop access role cleared. Only members with Manage Server can create quick drops now.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // ping
        await setConfigValue(interaction.client, interaction.guildId, 'quickDropPingRoleId', role ? role.id : null);

        logger.info(
            role
                ? `Quick drop ping role set to ${role.id} in guild ${interaction.guildId} by ${interaction.user.tag}`
                : `Quick drop ping role cleared in guild ${interaction.guildId} by ${interaction.user.tag}`,
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    'Quick Drop Ping Updated',
                    role
                        ? `New quick drops will now ping ${role}.`
                        : 'Quick drop ping role cleared. New quick drops will no longer ping a role.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

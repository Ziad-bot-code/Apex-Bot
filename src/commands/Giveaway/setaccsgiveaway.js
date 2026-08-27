import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { updateGuildConfig } from '../../services/config/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName("setaccsgiveaway")
        .setDescription("Set the role allowed to host giveaways.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption((option) =>
            option
                .setName("role")
                .setDescription("Select the role allowed to run giveaways.")
                .setRequired(true)
        ),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Command used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id }
            );
        }

        const role = interaction.options.getRole("role");

        await updateGuildConfig(interaction.client, interaction.guildId, {
            giveawayAccessRoleId: role.id
        });

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Giveaway Access Updated! 🎉`,
                    `Members with the ${role} role can now create giveaways using \`/gcreate\`.`
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

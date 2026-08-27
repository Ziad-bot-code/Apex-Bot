import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { updateGuildConfig } from '../../services/config/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Ticket system configuration commands.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Configure auto-ticket settings for giveaway winners.")
                .addBooleanOption((option) =>
                    option
                        .setName("enabled")
                        .setDescription("Turn auto-ticket creation ON or OFF when a giveaway ends.")
                        .setRequired(true)
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription("Role granted access permissions to winner tickets.")
                        .setRequired(true)
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Category where ticket channels will be created.")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )
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

        const enabled = interaction.options.getBoolean("enabled");
        const staffRole = interaction.options.getRole("staff_role");
        const category = interaction.options.getChannel("category");

        await updateGuildConfig(interaction.client, interaction.guildId, {
            autoTicketOnWin: enabled,
            ticketStaffRoleId: staffRole.id,
            ticketCategoryId: category ? category.id : null,
        });

        const statusLabel = enabled ? "🟢 **ENABLED (ON)**" : "🔴 **DISABLED (OFF)**";
        const categoryLabel = category ? `${category}` : "None (Default)";

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Ticket Settings Saved! 🎫`,
                    `**Auto-Ticket System:** ${statusLabel}\n` +
                    `**Staff Role Access:** ${staffRole}\n` +
                    `**Ticket Category:** ${categoryLabel}`
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

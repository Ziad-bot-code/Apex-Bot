import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
 
export default {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription("Promotes a member from one role to another and posts an announcement.")
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The member being promoted.')
                .setRequired(true),
        )
        .addRoleOption((option) =>
            option
                .setName('to')
                .setDescription('The new role to give them.')
                .setRequired(true),
        )
        .addRoleOption((option) =>
            option
                .setName('from')
                .setDescription('The old role to remove (optional).')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Optional reason for the promotion.')
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
 
    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
 
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'promote used outside guild',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.',
                { userId: interaction.user.id },
            );
        }
 
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw new TitanBotError(
                'User lacks ManageRoles permission',
                ErrorTypes.PERMISSION,
                "You need the 'Manage Roles' permission to promote members.",
                { userId: interaction.user.id, guildId: interaction.guildId },
            );
        }
 
        const targetUser = interaction.options.getUser('user');
        const toRole = interaction.options.getRole('to');
        const fromRole = interaction.options.getRole('from');
        const reason = interaction.options.getString('reason');
 
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            throw new TitanBotError(
                'Target member not found',
                ErrorTypes.VALIDATION,
                'That user is not a member of this server.',
                { targetUserId: targetUser.id },
            );
        }
 
        const botMember = interaction.guild.members.me;
        const botHighestPosition = botMember?.roles.highest.position ?? 0;
 
        if (toRole.position >= botHighestPosition) {
            throw new TitanBotError(
                'Target role too high for bot',
                ErrorTypes.VALIDATION,
                "I can't assign that role because it's higher than or equal to my highest role.",
                { roleId: toRole.id },
            );
        }
 
        if (fromRole && fromRole.position >= botHighestPosition) {
            throw new TitanBotError(
                'Role to remove too high for bot',
                ErrorTypes.VALIDATION,
                "I can't remove that role because it's higher than or equal to my highest role.",
                { roleId: fromRole.id },
            );
        }
 
        try {
            if (fromRole && member.roles.cache.has(fromRole.id)) {
                await member.roles.remove(fromRole);
            }
            if (!member.roles.cache.has(toRole.id)) {
                await member.roles.add(toRole);
            }
        } catch (error) {
            logger.error(`Failed to update roles for promotion in guild ${interaction.guildId}:`, error);
            throw new TitanBotError(
                'Failed to update member roles',
                ErrorTypes.UNKNOWN,
                "I couldn't update that member's roles. Check my role position and permissions.",
                { targetUserId: targetUser.id, error: error.message },
            );
        }
 
        const config = await getGuildConfig(interaction.client, interaction.guildId).catch(() => null);
        const logChannelId = config?.promotionLogChannelId || null;
        const targetChannel = logChannelId
            ? await interaction.guild.channels.fetch(logChannelId).catch(() => null)
            : interaction.channel;
        const destinationChannel = targetChannel && targetChannel.isTextBased() ? targetChannel : interaction.channel;
 
        const announceEmbed = createEmbed({
            title: '⬆️ Staff Promotion',
            description:
                `${member} Has Been **PROMOTED** to ${toRole}` +
                (fromRole ? ` from ${fromRole}` : ''),
            color: '#2ecc71',
            fields: [
                { name: 'Promoted By', value: `${interaction.user}`, inline: true },
                ...(reason ? [{ name: 'Reason', value: reason, inline: false }] : []),
            ],
            timestamp: true,
        });
 
        await destinationChannel.send({ embeds: [announceEmbed] }).catch((sendError) => {
            logger.warn(`Could not send promotion announcement in guild ${interaction.guildId}: ${sendError.message}`);
        });
 
        logger.info(
            `${interaction.user.tag} promoted ${targetUser.tag} to ${toRole.name}${fromRole ? ` from ${fromRole.name}` : ''} in guild ${interaction.guildId}`,
        );
 
        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    'Promotion Complete',
                    `${member} has been promoted to ${toRole}.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
 

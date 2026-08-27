import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from './config/configService.js';
import { saveTicketData, incrementTicketCounter } from '../utils/database/tickets.js';
import { logger } from '../utils/logger.js';

export async function createWinnerTickets(guild, winners, prizeName) {
    if (!winners || winners.length === 0) return;

    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);

    if (!config?.autoTicketOnWin) {
        logger.info(`Auto-ticket creation is OFF for guild ${guild.id}. Skipping.`);
        return;
    }

    const staffRoleId = config.ticketStaffRoleId;
    const categoryId = config.ticketCategoryId;

    for (const winnerId of winners) {
        try {
            const member = await guild.members.fetch(winnerId).catch(() => null);
            if (!member) continue;

            const ticketNumber = await incrementTicketCounter(guild.id);

            const permissionOverwrites = [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: member.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                },
                {
                    id: guild.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels
                    ],
                }
            ];

            if (staffRoleId) {
                permissionOverwrites.push({
                    id: staffRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory
                    ],
                });
            }

            const ticketChannel = await guild.channels.create({
                name: `ticket-${ticketNumber}`,
                type: ChannelType.GuildText,
                parent: categoryId || null,
                permissionOverwrites: permissionOverwrites,
            });

            await saveTicketData(guild.id, ticketChannel.id, {
                channelId: ticketChannel.id,
                guildId: guild.id,
                userId: member.id,
                status: 'open',
                ticketNumber: ticketNumber,
                type: 'giveaway_claim',
                createdAt: new Date().toISOString(),
            });

            const embed = new EmbedBuilder()
                .setTitle(`🎉 Winner Ticket #${ticketNumber} — ${prizeName}`)
                .setDescription(
                    `Congratulations ${member}! You won **${prizeName}**.\n\n` +
                    `Please wait here for ${staffRoleId ? `<@&${staffRoleId}>` : 'staff'} to assist you.`
                )
                .setColor('#57F287')
                .setTimestamp();

            await ticketChannel.send({
                content: `${member} ${staffRoleId ? `<@&${staffRoleId}>` : ''}`,
                embeds: [embed]
            });

            logger.info(`Created winner ticket ${ticketChannel.id} for user ${member.id}`);
        } catch (err) {
            logger.error(`Failed to create auto-ticket for winner ${winnerId}:`, err);
        }
    }
}

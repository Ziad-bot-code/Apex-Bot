import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Delete a specific amount of messages")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("Number of messages (1-100)")
                .setRequired(true)
        ),
    category: "moderation",
    abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });

        if (!deferSuccess) {
            logger.warn(`Purge interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'purge'
            });
            return;
        }

        const amount = interaction.options.getInteger("amount");

        try {
            const deleted = await interaction.channel.bulkDelete(amount, true);

            // ارسال اسم وصورة المستخدم الذي نفذ الأمر بدلاً من الروم
            try {
                await logEvent(interaction, 'MESSAGES_PURGED', {
                    channel: interaction.channel,
                    user: interaction.user,
                    target: interaction.user,
                    moderator: interaction.user,
                    messageCount: deleted.size,
                    requestedAmount: amount,
                    reason: `Deleted ${deleted.size} messages`
                });
            } catch (logErr) {
                logger.error('Purge log error:', logErr);
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        `Successfully deleted \`${deleted.size}\` messages!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error executing purge command:', error);
            await InteractionHelper.safeReply(interaction, {
                content: "Failed to delete messages. Make sure messages are under 14 days old.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
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

            // ارسال اللوج بنفس الهيكل الاصلي مع تحديد اليوزر المسئول
            try {
                await logEvent(interaction.guild, 'MESSAGES_PURGED', {
                    channel: interaction.channel,
                    channelId: interaction.channel.id,
                    user: interaction.user,
                    executor: interaction.user,
                    messageCount: deleted.size,
                    requestedAmount: amount,
                    reason: `Deleted ${deleted.size} messages`
                });
            } catch (logErr) {
                logger.error('Logging failed:', logErr);
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

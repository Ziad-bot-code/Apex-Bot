import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const SPAWNERS = {
    zombie: { label: 'Zombie Spawner', emoji: '🧟', perMinute: 7 },
    skeleton: { label: 'Skeleton Spawner', emoji: '💀', perMinute: 2 },
    blaze: { label: 'Blaze Spawner', emoji: '🔥', perMinute: 2 },
    enderman: { label: 'Enderman Spawner', emoji: '🟣', perMinute: 65 },
    creeper: { label: 'Creeper Spawner', emoji: '💥', perMinute: 510 },
};

function formatMoney(amount) {
    const sign = amount < 0 ? '-' : '';
    const value = Math.abs(amount);

    if (value >= 1_000_000_000) {
        return `${sign}$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
        return `${sign}$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1000) {
        return `${sign}$${Math.round(value).toLocaleString()}`;
    }
    return `${sign}$${value.toFixed(2)}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('spawner')
        .setDescription('Estimates how much money a set of spawners will earn over time.')
        .addStringOption((option) =>
            option
                .setName('spawner')
                .setDescription('Select your spawner type.')
                .setRequired(true)
                .addChoices(
                    { name: 'Zombie Spawner', value: 'zombie' },
                    { name: 'Skeleton Spawner', value: 'skeleton' },
                    { name: 'Blaze Spawner', value: 'blaze' },
                    { name: 'Enderman Spawner', value: 'enderman' },
                    { name: 'Creeper Spawner', value: 'creeper' },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('How many of this spawner you have.')
                .setMinValue(1)
                .setMaxValue(1_000_000)
                .setRequired(true),
        ),

    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction);

        const spawnerKey = interaction.options.getString('spawner');
        const amount = interaction.options.getInteger('amount');
        const spawner = SPAWNERS[spawnerKey];

        if (!spawner) {
            throw new TitanBotError(
                `Unknown spawner type: ${spawnerKey}`,
                ErrorTypes.VALIDATION,
                'That spawner type is not recognized.',
                { spawnerKey },
            );
        }

        const perMinute = spawner.perMinute * amount;
        const perSecond = perMinute / 60;
        const perTick = perSecond / 20; // Minecraft runs at 20 ticks per second
        const perHour = perMinute * 60;
        const per24Hours = perHour * 24;
        const per7Days = per24Hours * 7;
        const per30Days = per24Hours * 30;
        // Real yields fluctuate minute to minute; show a rough ±33% band around the average.
        const oneMinMin = perMinute * (2 / 3);
        const oneMinMax = perMinute * (4 / 3);

        const embed = new EmbedBuilder()
            .setTitle('💰 EuropeMC Spawner Calculator')
            .setDescription(
                `${spawner.emoji} **${spawner.label}**\n\n` +
                `📦 Spawner Amount: **${amount.toLocaleString()}**\n` +
                `📊 Estimated Average: **${formatMoney(spawner.perMinute)}**/min per spawner\n\n` +
                `⚠️ The 1-minute result may vary depending on when the measurement starts.`
            )
            .setColor('#F1C40F')
            .addFields(
                { name: '⚙️ Per Tick', value: formatMoney(perTick), inline: true },
                { name: '⏱️ Per Second', value: formatMoney(perSecond), inline: true },
                { name: '🕐 Estimated / Minute', value: formatMoney(perMinute), inline: true },
                { name: '📉 1m Minimum', value: formatMoney(oneMinMin), inline: true },
                { name: '📈 1m Maximum', value: formatMoney(oneMinMax), inline: true },
                { name: '🕒 Per Hour', value: formatMoney(perHour), inline: true },
                { name: '☀️ 24 Hours', value: formatMoney(per24Hours), inline: true },
                { name: '📅 7 Days', value: formatMoney(per7Days), inline: true },
                { name: '🗓️ 30 Days', value: formatMoney(per30Days), inline: true },
            )
            .setFooter({ text: 'EuropeMC • Estimated Spawner Earnings' })
            .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
        });
    },
};

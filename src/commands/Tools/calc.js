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
        .setName('calc')
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
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

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
        const

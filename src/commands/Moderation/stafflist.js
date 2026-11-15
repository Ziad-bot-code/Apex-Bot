import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';

export const STAFF_ROLES = [
    { name: '— CEO —', id: '1558870361011920928' },
    { name: '— OWNER —', id: '1507318444989616189' },
    { name: '— DIRECTOR —', id: '1557541299064807464' },
    { name: '— DEVELOPER —', id: '1567177628249628732' },
    { name: '— HEAD MANAGER —', id: '1557541253531439199' },
    { name: '— MANAGER —', id: '1507318450840670341' },
    { name: '— SR. ADMIN —', id: '1546181418156167259' },
    { name: '— ADMIN —', id: '1546181240976183327' },
    { name: '— SR MODERATOR —', id: '1559017971530072144' },
    { name: '— MODERATOR —', id: '1546181147526955079' },
    { name: '— JR. MODERATOR —', id: '1546180986709213274' },
    { name: '— SR HELPER —', id: '1559017878873702511' },
    { name: '— HELPER —', id: '1546180847562920017' },
    { name: '— JR.HELPER —', id: '1546180624698835079' }
];

export async function buildStaffEmbed(guild) {
    // Force fetch all members from Discord API to completely bypass stale cache
    await guild.members.fetch({ force: true });

    const embed = new EmbedBuilder()
        .setTitle('✦ EUROPEMC • STAFF TEAM')
        .setDescription('**OFFICIAL STAFF MEMBERS & ROLES**\n---------------------------------------')
        .setColor('#3498DB')
        .setFooter({ text: 'EuropeMC • Live staff roles • Auto-updated' })
        .setTimestamp();

    for (const roleGroup of STAFF_ROLES) {
        const role = guild.roles.cache.get(roleGroup.id);

        if (!role) {
            embed.addFields({ name: roleGroup.name, value: '*Role not found*', inline: false });
            continue;
        }

        const membersText = role.members.map(m => `${m}`).join('\n');

        embed.addFields({
            name: roleGroup.name,
            value: membersText.length > 0 ? membersText : '*None*',
            inline: false
        });
    }

    return embed;
}

export async function refreshStaffMessage(client, guildId) {
    const channelId = process.env.STAFF_CHANNEL_ID;
    const messageId = process.env.STAFF_MESSAGE_ID;
    
    if (!channelId || !messageId) {
        console.warn('⚠️ [STAFFLIST] STAFF_CHANNEL_ID or STAFF_MESSAGE_ID variables are missing in Railway!');
        return;
    }

    try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
        if (!guild) return;

        const channel = await guild.channels.fetch(channelId);
        if (!channel) return;

        const message = await channel.messages.fetch(messageId);
        if (!message) return;

        const updatedEmbed = await buildStaffEmbed(guild);
        await message.edit({ embeds: [updatedEmbed] });
        console.log('✅ [STAFFLIST] Live staff message successfully updated on Discord!');
    } catch (err) {
        console.error('❌ [STAFFLIST] Failed to edit live message:', err.message);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('stafflist')
        .setDescription('Posts the live staff list message that auto-edits on promotions, demotions, or kicks.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = await buildStaffEmbed(interaction.guild);
        const sentMessage = await interaction.channel.send({ embeds: [embed] });

        await interaction.editReply({
            content: `✅ Live staff list posted!\nAdd these variables in Railway:\n\`STAFF_CHANNEL_ID\` = \`${interaction.channel.id}\`\n\`STAFF_MESSAGE_ID\` = \`${sentMessage.id}\``
        });
    },
};

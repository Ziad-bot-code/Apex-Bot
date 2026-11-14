import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

// Ordered from highest rank (CEO) to lowest rank (Jr. Helper) matching your screenshots
const STAFF_ROLES = [
    { name: '— CEO —', id: '1558870361011920928' },
    { name: '— OWNER —', id: '1507318444989616189' },
    { name: '— DIRECTOR —', id: '1557541299064807464' },
    { name: '— DEVELOPER —', id: '1567177628249628732' },
    { name: '— HEAD MANAGER —', id: '1557541253531439199' },
    { name: '— MANAGER —', id: '1507318450840670341' },
    { name: '— SR. ADMIN —', id: '1546181418156167259' },
    { name: '— ADMIN —', id: '1546181240976183327' },
    { name: '— SR MODERATOR —', id: '1559017971530072144' }, // Matches "SR MODERATOR" style
    { name: '— MODERATOR —', id: '1546181147526955079' },
    { name: '— JR. MODERATOR —', id: '1546180986709213274' }, // Matches "JR. MODERATOR" style
    { name: '— SR HELPER —', id: '1559017878873702511' },
    { name: '— HELPER —', id: '1546180847562920017' },
    { name: '— JR.HELPER —', id: '1546180624698835079' }
];

export default {
    data: new SlashCommandBuilder()
        .setName('stafflist')
        .setDescription('Displays the official server staff team hierarchy and online members.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        await interaction.deferReply();

        const guild = interaction.guild;
        // Fetch all members to ensure cache is fully populated
        await guild.members.fetch();

        const embed = new EmbedBuilder()
            .setTitle('✦ EUROPEMC • STAFF TEAM')
            .setDescription('**OFFICIAL STAFF MEMBERS & ROLES**\n---------------------------------------')
            .setColor('#3498DB')
            .setFooter({ text: `EuropeMC • Live staff roles • Checked automatically` })
            .setTimestamp();

        for (const roleGroup of STAFF_ROLES) {
            const role = guild.roles.cache.get(roleGroup.id);
            
            if (!role) {
                embed.addFields({ name: roleGroup.name, value: '*Role not found*', inline: false });
                continue;
            }

            // Get all members who have this role
            const membersWithRole = role.members.map(member => `${member}`).join('\n');

            embed.addFields({
                name: roleGroup.name,
                value: membersWithRole.length > 0 ? membersWithRole : '*None*',
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

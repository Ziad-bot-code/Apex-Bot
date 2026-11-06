const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffnew')
    .setDescription('Welcomes a new staff member and provides onboarding links.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The new staff member to welcome')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async run({ interaction }) {
    const targetUser = interaction.options.getUser('user');

    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🛡️ WELCOME TO THE STAFF TEAM')
      .setDescription(`Congratulations on joining the team, ${targetUser}! Please complete your onboarding by carefully reviewing the essential channels listed below.`)
      .setColor('#3498DB')
      .addFields(
        { 
          name: '📜 Staff Guidelines', 
          value: '<#1546680575224447046>\nRules, expectations, and general staff protocols.', 
          inline: false 
        },
        { 
          name: '🎉 Giveaway Management', 
          value: '<#1546681025919455294>\nHow to create, host, and verify giveaways.', 
          inline: false 
        },
        { 
          name: '🎫 Ticket Operations', 
          value: '<#1559023511148822568>\nTicket renaming protocols and handling guidelines.', 
          inline: false 
        }
      )
      .setFooter({ text: 'Make sure to read all pinned messages inside each channel.' })
      .setTimestamp();

    await interaction.reply({
      content: `Welcome to the team, ${targetUser}!`,
      embeds: [welcomeEmbed]
    });
  },
};

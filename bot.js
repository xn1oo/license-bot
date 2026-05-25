const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const STAFF_ROLE_NAME = '𝐀𝐝𝐦𝐢𝐧𝐬𝐭𝐫𝐚𝐭𝐢𝐨𝐧 𝐓𝐞𝐚𝐦';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const registrations = {};
const plates = {};
const guildSettings = {};

const commands = [
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register your license plate')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the public registration channel (Staff only)')
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('The channel to post registrations in').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('setchannelmodviewer')
    .setDescription('Set the forum channel for mod viewer (Staff only)')
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('The forum channel for mod records').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up a license plate (Staff only)')
    .addStringOption(opt =>
      opt.setName('plate').setDescription('The plate to look up').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revoke a license plate (Staff only)')
    .addStringOption(opt =>
      opt.setName('plate').setDescription('The plate to revoke').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for revoking').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('addviolation')
    .setDescription('Add a violation to a plate (Staff only)')
    .addStringOption(opt =>
      opt.setName('plate').setDescription('The plate to add violation to').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('violation')
        .setDescription('Type of violation')
        .setRequired(true)
        .addChoices(
          { name: '🚨 Speeding Ticket', value: '🚨 Speeding Ticket' },
          { name: '🚔 Reckless Driving', value: '🚔 Reckless Driving' },
          { name: '🚓 Evading Police', value: '🚓 Evading Police' },
          { name: '🅿️ Illegal Parking', value: '🅿️ Illegal Parking' },
          { name: '✏️ Custom', value: 'custom' },
        )
    )
    .addStringOption(opt =>
      opt.setName('custom_violation').setDescription('Custom violation (only if Custom selected)').setRequired(false)
    )
    .toJSON(),
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

function isStaff(member) {
  return member.roles.cache.some(r => r.name === STAFF_ROLE_NAME);
}

function formatDate() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function buildRegistrationEmbed(reg) {
  const statusEmoji = reg.status === 'Active' ? '🟢' : '🔴';
  const violationList = reg.violations.length > 0
    ? reg.violations.map(v => `${v.type}\n📅 ${v.date} — Added by **${v.addedBy}**`).join('\n\n')
    : 'None';

  return new EmbedBuilder()
    .setTitle(`🪪 ${reg.username}`)
    .setColor(reg.status === 'Active' ? '#00FF7F' : '#FF4444')
    .addFields(
      { name: '🔤  PLATE', value: `\`\`\`\n${reg.plate}\n\`\`\``, inline: true },
      { name: `${statusEmoji}  STATUS`, value: `\`\`\`\n${reg.status}\n\`\`\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '📅  REGISTERED', value: `\`\`\`\n${reg.date}\n\`\`\``, inline: false },
      { name: '📋  VIOLATIONS', value: violationList, inline: false },
    )
    .setFooter({ text: 'Maryland State Roleplay • License Plate Registry' });
}

async function updateForumPost(reg) {
  if (!reg.forumPostId) return;
  try {
    const thread = await client.channels.fetch(reg.forumPostId);
    const messages = await thread.messages.fetch({ limit: 1 });
    const firstMsg = messages.last();
    if (firstMsg) await firstMsg.edit({ embeds: [buildRegistrationEmbed(reg)] });
  } catch (e) {
    console.error('Failed to update forum post:', e);
  }
}

client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'register') {
      if (registrations[interaction.user.id]) {
        return interaction.reply({ content: `❌ You already have a registered plate: **${registrations[interaction.user.id].plate}**. You cannot register twice.`, ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId('register_modal')
        .setTitle('🪪 License Plate Registration');
      const plateInput = new TextInputBuilder()
        .setCustomId('plate')
        .setLabel('Custom Plate Number (max 5 characters)')
        .setPlaceholder('e.g. MSR12')
        .setMaxLength(5)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(plateInput));
      await interaction.showModal(modal);
      return;
    }

    if (commandName === 'setchannel') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (!guildSettings[interaction.guildId]) guildSettings[interaction.guildId] = {};
      guildSettings[interaction.guildId].regChannelId = channel.id;
      return interaction.reply({ content: `✅ Registration channel set to ${channel}`, ephemeral: true });
    }

    if (commandName === 'setchannelmodviewer') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      if (channel.type !== ChannelType.GuildForum) {
        return interaction.reply({ content: '❌ Please select a Forum channel.', ephemeral: true });
      }
      if (!guildSettings[interaction.guildId]) guildSettings[interaction.guildId] = {};
      guildSettings[interaction.guildId].forumChannelId = channel.id;
      return interaction.reply({ content: `✅ Mod viewer forum set to ${channel}`, ephemeral: true });
    }

    if (commandName === 'lookup') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const plate = interaction.options.getString('plate').toUpperCase();
      const userId = plates[plate];
      if (!userId || !registrations[userId]) return interaction.reply({ content: `❌ No registration found for plate **${plate}**`, ephemeral: true });
      return interaction.reply({ embeds: [buildRegistrationEmbed(registrations[userId])], ephemeral: true });
    }

    if (commandName === 'revoke') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const plate = interaction.options.getString('plate').toUpperCase();
      const reason = interaction.options.getString('reason');
      const userId = plates[plate];
      if (!userId || !registrations[userId]) return interaction.reply({ content: `❌ No registration found for plate **${plate}**`, ephemeral: true });
      const reg = registrations[userId];
      reg.status = `Suspended — ${reason}`;
      await updateForumPost(reg);
      return interaction.reply({ content: `✅ Plate **${plate}** revoked. Reason: ${reason}`, ephemeral: true });
    }

    if (commandName === 'addviolation') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const plate = interaction.options.getString('plate').toUpperCase();
      const violationType = interaction.options.getString('violation');
      const customViolation = interaction.options.getString('custom_violation');
      if (violationType === 'custom' && !customViolation) {
        return interaction.reply({ content: '❌ Please provide a custom violation description.', ephemeral: true });
      }
      const userId = plates[plate];
      if (!userId || !registrations[userId]) return interaction.reply({ content: `❌ No registration found for plate **${plate}**`, ephemeral: true });
      const reg = registrations[userId];
      const violation = {
        type: violationType === 'custom' ? `✏️ ${customViolation}` : violationType,
        date: formatDate(),
        addedBy: interaction.user.username,
      };
      reg.violations.push(violation);
      await updateForumPost(reg);
      return interaction.reply({ content: `✅ Violation **${violation.type}** added to plate **${plate}**`, ephemeral: true });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'register_modal') {
    const plate = interaction.fields.getTextInputValue('plate').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (plate.length === 0) return interaction.reply({ content: '❌ Plate must contain letters or numbers only.', ephemeral: true });
    if (registrations[interaction.user.id]) return interaction.reply({ content: `❌ You already have a registered plate: **${registrations[interaction.user.id].plate}**`, ephemeral: true });
    if (plates[plate]) return interaction.reply({ content: `❌ The plate **${plate}** is already taken. Please choose another.`, ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const settings = guildSettings[interaction.guildId];
    if (!settings || !settings.regChannelId) {
      return interaction.editReply({ content: '❌ Registration channel has not been set up yet. Ask a staff member to run /setchannel.' });
    }

    const reg = {
      plate,
      username: interaction.user.username,
      userId: interaction.user.id,
      date: formatDate(),
      status: 'Active',
      forumPostId: null,
      violations: [],
    };

    registrations[interaction.user.id] = reg;
    plates[plate] = interaction.user.id;

    try {
      const regChannel = await client.channels.fetch(settings.regChannelId);
      await regChannel.send({ embeds: [buildRegistrationEmbed(reg)] });
    } catch (e) {
      console.error('Failed to post in registration channel:', e);
    }

    if (settings.forumChannelId) {
      try {
        const forumChannel = await client.channels.fetch(settings.forumChannelId);
        const thread = await forumChannel.threads.create({
          name: `${reg.username} — ${plate}`,
          message: { embeds: [buildRegistrationEmbed(reg)] },
        });
        reg.forumPostId = thread.id;
      } catch (e) {
        console.error('Failed to create forum post:', e);
      }
    }

    await interaction.editReply({ content: `✅ Your plate **${plate}** has been registered successfully!` });
  }
});

client.login(TOKEN);

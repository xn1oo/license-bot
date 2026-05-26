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
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const STAFF_ROLE_NAME = 'AT | 𝐀𝐝𝐦𝐢𝐧𝐬𝐭𝐫𝐚𝐭𝐢𝐨𝐧 𝐓𝐞𝐚𝐦';
const POLICE_ROLE_NAME = 'PD | 𝐏𝐨𝐥𝐢𝐜𝐞 𝐃𝐞𝐩𝐚𝐫𝐭𝐦𝐞𝐧𝐭';

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
    .setName('setupregister')
    .setDescription('Post the registration button message (Staff only)')
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
    .toJSON(),

  new SlashCommandBuilder()
    .setName('deleteplate')
    .setDescription('Delete a license plate registration (Staff only)')
    .addStringOption(opt =>
      opt.setName('plate').setDescription('The plate to delete').setRequired(true)
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
  return member.roles.cache.some(r => r.name === STAFF_ROLE_NAME || r.name === POLICE_ROLE_NAME);
}

function formatDate() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function buildRegistrationEmbed(reg) {
  const statusEmoji = reg.status === 'Active' ? '🟢' : '🔴';

  let violationText = '';
  if (reg.violations.length === 0) {
    violationText = '```\nNone\n```';
  } else {
    violationText = reg.violations.map((v, i) =>
      `**#${i + 1}** ${v.type}\n` +
      `⏳ Time Served: **${v.timeServed}**\n` +
      `📅 ${v.date} — Added by **${v.addedBy}**`
    ).join('\n\n');
  }

  return new EmbedBuilder()
    .setTitle(`🪪  ${reg.robloxUsername}`)
    .setColor(reg.status === 'Active' ? '#00FF7F' : '#FF4444')
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '🔤  PLATE', value: `\`\`\`\n${reg.plate}\n\`\`\``, inline: true },
      { name: `${statusEmoji}  STATUS`, value: `\`\`\`\n${reg.status}\n\`\`\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '📅  REGISTERED', value: `\`\`\`\n${reg.date}\n\`\`\``, inline: false },
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '📋  VIOLATIONS', value: violationText, inline: false },
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
    )
    .setFooter({ text: 'Maryland State Roleplay • License Plate Registry' });
}

async function updateForumPost(reg) {
  if (!reg.forumPostId) return;
  try {
    const thread = await client.channels.fetch(reg.forumPostId);
    const messages = await thread.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
    if (botMsg) await botMsg.edit({ embeds: [buildRegistrationEmbed(reg)] });
  } catch (e) {
    console.error('Failed to update forum post:', e);
  }
}

client.on('interactionCreate', async interaction => {

  // ── Button Click ──
  if (interaction.isButton() && interaction.customId === 'open_register') {
    if (registrations[interaction.user.id]) {
      return interaction.reply({
        content: `❌ You already have a registered plate: **${registrations[interaction.user.id].plate}**. You cannot register twice.`,
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('register_modal')
      .setTitle('🪪 License Plate Registration');

    const robloxInput = new TextInputBuilder()
      .setCustomId('roblox')
      .setLabel('Roblox Username')
      .setPlaceholder('Enter your exact Roblox username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const plateInput = new TextInputBuilder()
      .setCustomId('plate')
      .setLabel('Custom Plate Number (max 5 characters)')
      .setPlaceholder('e.g. MSR12')
      .setMaxLength(5)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const warningInput = new TextInputBuilder()
      .setCustomId('warning_ack')
      .setLabel('Type AGREE to acknowledge the warning')
      .setPlaceholder('⚠️ FALSE ROBLOX USERNAME = PERMANENT BAN. Type AGREE')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(robloxInput),
      new ActionRowBuilder().addComponents(plateInput),
      new ActionRowBuilder().addComponents(warningInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setupregister') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const button = new ButtonBuilder()
        .setCustomId('open_register')
        .setLabel('🪪 Register Plate')
        .setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder().addComponents(button);
      const embed = new EmbedBuilder()
        .setTitle('🪪 │ 𝖣𝖱𝖨𝖵𝖤𝖱𝖲 𝖫𝖨𝖢𝖤𝖭𝖲𝖤 𝖱𝖤𝖦𝖨𝖲𝖳𝖱𝖠𝖳𝖨𝖮𝖭')
        .setDescription(
          '**Register your license and vehicle tags below before hitting the road**\n\n' +
          '**Rules:**\n' +
          '• One plate per person\n' +
          '• Max 5 characters\n' +
          '• Letters and numbers only\n\n' +
          '⚠️ **WARNING:** If we find out you put a false Roblox username this will result in an **immediate permanent ban** from the Discord server.'
        )
        .setColor('#00FF7F')
        .setFooter({ text: 'Maryland State Roleplay • License Plate Registry' });
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Registration message posted!', ephemeral: true });
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

      const modal = new ModalBuilder()
        .setCustomId('violation_modal')
        .setTitle('📋 Add Violation');

      const plateInput = new TextInputBuilder()
        .setCustomId('plate')
        .setLabel('License Plate')
        .setPlaceholder('Enter the license plate number')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const violationInput = new TextInputBuilder()
        .setCustomId('violation')
        .setLabel('Violation')
        .setPlaceholder('Describe the violation')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const timeInput = new TextInputBuilder()
        .setCustomId('timeServed')
        .setLabel('Time Served')
        .setPlaceholder('e.g. 10 minutes, 1 hour, None')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(plateInput),
        new ActionRowBuilder().addComponents(violationInput),
        new ActionRowBuilder().addComponents(timeInput),
      );

      await interaction.showModal(modal);
      return;
    }

    if (commandName === 'deleteplate') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      const plate = interaction.options.getString('plate').toUpperCase();
      const userId = plates[plate];
      if (!userId || !registrations[userId]) return interaction.reply({ content: `❌ No registration found for plate **${plate}**`, ephemeral: true });
      delete registrations[userId];
      delete plates[plate];
      return interaction.reply({ content: `✅ Plate **${plate}** has been deleted successfully!`, ephemeral: true });
    }
  }

  // ── Modal Submit — Register ──
  if (interaction.isModalSubmit() && interaction.customId === 'register_modal') {
    const robloxUsername = interaction.fields.getTextInputValue('roblox').trim();
    const plate = interaction.fields.getTextInputValue('plate').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const ack = interaction.fields.getTextInputValue('warning_ack').trim().toUpperCase();

    if (ack !== 'AGREE') {
      return interaction.reply({ content: '❌ You must type **AGREE** to acknowledge the warning.', ephemeral: true });
    }

    if (plate.length === 0) return interaction.reply({ content: '❌ Plate must contain letters or numbers only.', ephemeral: true });
    if (registrations[interaction.user.id]) return interaction.reply({ content: `❌ You already have a registered plate: **${registrations[interaction.user.id].plate}**`, ephemeral: true });
    if (plates[plate]) return interaction.reply({ content: `❌ The plate **${plate}** is already taken. Please choose another.`, ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const settings = guildSettings[interaction.guildId];
    if (!settings || !settings.forumChannelId) {
      return interaction.editReply({ content: '❌ Forum channel has not been set up yet. Ask a staff member to run /setchannelmodviewer.' });
    }

    const reg = {
      plate,
      robloxUsername,
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
      const forumChannel = await client.channels.fetch(settings.forumChannelId);
      const thread = await forumChannel.threads.create({
        name: `${robloxUsername} — ${plate}`,
        message: { embeds: [buildRegistrationEmbed(reg)] },
      });
      reg.forumPostId = thread.id;
    } catch (e) {
      console.error('Failed to create forum post:', e);
    }

    await interaction.editReply({
      content: `✅ Your plate **${plate}** has been registered successfully under Roblox username **${robloxUsername}**!`
    });
  }

  // ── Modal Submit — Add Violation ──
  if (interaction.isModalSubmit() && interaction.customId === 'violation_modal') {
    const plate = interaction.fields.getTextInputValue('plate').toUpperCase().trim();
    const violationType = interaction.fields.getTextInputValue('violation').trim();
    const timeServed = interaction.fields.getTextInputValue('timeServed').trim();

    const userId = plates[plate];
    if (!userId || !registrations[userId]) {
      return interaction.reply({ content: `❌ No registration found for plate **${plate}**`, ephemeral: true });
    }

    const reg = registrations[userId];
    const violation = {
      type: violationType,
      timeServed,
      date: formatDate(),
      addedBy: interaction.user.username,
    };
    reg.violations.push(violation);
    await updateForumPost(reg);

    return interaction.reply({ content: `✅ Violation added to plate **${plate}**`, ephemeral: true });
  }
});

client.login(TOKEN);

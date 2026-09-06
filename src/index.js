require('dotenv').config();

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle,
  ActivityType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const OpenAI = require('openai');

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  openAiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  panelChannelId: process.env.PANEL_CHANNEL_ID || null,
  ticketPanelChannelId: process.env.TICKET_PANEL_CHANNEL_ID || null,
  applicationPanelChannelId: process.env.APPLICATION_PANEL_CHANNEL_ID || null,
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || null,
  applicationCategoryId: process.env.APPLICATION_CATEGORY_ID || null,
  staffRoleId: process.env.STAFF_ROLE_ID || null,
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  partnershipRoleId: process.env.PARTNERSHIP_ROLE_ID || null,
  logChannelId: process.env.LOG_CHANNEL_ID || null,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || null,
  welcomeRoleId: process.env.WELCOME_ROLE_ID || null,
  suggestionChannelId: process.env.SUGGESTION_CHANNEL_ID || null,
  antiSpamLimit: Number(process.env.ANTI_SPAM_LIMIT || 6),
  antiSpamWindowMs: Number(process.env.ANTI_SPAM_WINDOW_MS || 10000)
};

const botSettings = {
  status: 'online',
  activity: 'support på serveren',
  activityType: ActivityType.Watching
};

if (!config.token || !config.clientId) {
  throw new Error('DISCORD_TOKEN og CLIENT_ID skal udfyldes i .env');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: []
});

const openai = config.openAiKey ? new OpenAI({ apiKey: config.openAiKey }) : null;
const spamTracker = new Map();
const commands = [
  {
    name: 'panel',
    description: 'Sender ticket- og ansøgningspanelerne',
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  },
  {
    name: 'ticketpanel',
    description: 'Sender kun ticket-panelet til ticket-kanalen',
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  },
  {
    name: 'ansogningpanel',
    description: 'Sender kun ansøgningspanelet til ansøgningskanalen',
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  },
  {
    name: 'close',
    description: 'Lukker den aktuelle ticket eller ansøgning'
  },
  {
    name: 'clear',
    description: 'Sletter beskeder fra den aktuelle kanal',
    default_member_permissions: PermissionFlagsBits.ManageMessages.toString(),
    options: [{ name: 'antal', description: 'Antal beskeder fra 1 til 100', type: 4, required: true, min_value: 1, max_value: 100 }]
  },
  {
    name: 'timeout',
    description: 'Giver et medlem timeout',
    default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
    options: [
      { name: 'medlem', description: 'Medlemmet der skal have timeout', type: 6, required: true },
      { name: 'minutter', description: 'Timeout-længde i minutter', type: 4, required: true, min_value: 1, max_value: 40320 },
      { name: 'grund', description: 'Grunden til timeout', type: 3, required: false }
    ]
  },
  {
    name: 'suggest',
    description: 'Send et forslag til serveren',
    options: [{ name: 'forslag', description: 'Dit forslag', type: 3, required: true, max_length: 1000 }]
  }
];

const ticketTypes = {
  support: { label: 'Support', emoji: '🛠️', color: 0x3498db, roleId: config.staffRoleId },
  management: { label: 'Management', emoji: '🧭', color: 0xe67e22, roleId: config.staffRoleId },
  partnership: { label: 'Partnerskab', emoji: '🤝', color: 0x9b59b6, roleId: config.partnershipRoleId }
};

const applicationTypes = {
  staff: { label: 'Staff', emoji: '🛡️' },
  police: { label: 'Politi', emoji: '👮' },
  fire: { label: 'Brandvæsen', emoji: '🚒' },
  doctor: { label: 'Læge', emoji: '🩺' },
  emt: { label: 'Akutlæge', emoji: '🚑' }
};

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function ticketChannelName(type, user) {
  return `${type}-${slugify(user.username)}`.slice(0, 90);
}

function buildPanels() {
  const ticketEmbed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🎫 Billetpanel')
    .setDescription('Har du brug for hjælp? Vælg den rigtige kategori herunder, så bliver der oprettet en privat ticket til dig.')
    .setFooter({ text: 'Hold venligst din ticket til ét emne' });

  const ticketRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_support').setLabel('Support').setEmoji('🛠️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_management').setLabel('Management').setEmoji('🧭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_partnership').setLabel('Partnerskab').setEmoji('🤝').setStyle(ButtonStyle.Success)
  );

  const applicationEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📋 Ansøgningspanel')
    .setDescription('Vil du være en del af holdet? Vælg den ansøgning, der passer til dig. Du får en privat kanal med spørgsmålene.')
    .setFooter({ text: 'Skriv ærligt og udførligt i din ansøgning' });

  const applicationMenu = new StringSelectMenuBuilder()
    .setCustomId('application_select')
    .setPlaceholder('Vælg en ansøgningstype')
    .addOptions(Object.entries(applicationTypes).map(([value, item]) =>
      new StringSelectMenuOptionBuilder().setLabel(item.label).setValue(value).setEmoji(item.emoji)
    ));

  return {
    ticket: { embeds: [ticketEmbed], components: [ticketRow] },
    application: { embeds: [applicationEmbed], components: [new ActionRowBuilder().addComponents(applicationMenu)] }
  };
}

async function sendPanels(channel) {
  const panels = buildPanels();
  await channel.send(panels.ticket);
  await channel.send(panels.application);
}

async function sendSinglePanel(channel, panelType) {
  const panels = buildPanels();
  await channel.send(panels[panelType]);
}

function supportRoleMentions(guild) {
  const roleIds = [config.staffRoleId, config.adminRoleId].filter(Boolean);
  return roleIds.length ? roleIds.map(roleId => `<@&${roleId}>`).join(' ') : `<@&${guild.roles.everyone.id}>`;
}

function baseOverwrites(guild, userId, roleIds) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  for (const roleId of roleIds.filter(Boolean)) {
    overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  return overwrites;
}

async function createPrivateChannel(interaction, type, kind) {
  const item = kind === 'ticket' ? ticketTypes[type] : applicationTypes[type];
  const categoryId = kind === 'ticket' ? config.ticketCategoryId : config.applicationCategoryId;
  const roleIds = kind === 'ticket'
    ? [item.roleId, config.staffRoleId, config.adminRoleId]
    : [config.staffRoleId, config.adminRoleId];
  const channelName = `${kind}-${slugify(item.label)}-${slugify(interaction.user.username)}`.slice(0, 90);
  const existing = interaction.guild.channels.cache.find(channel =>
    channel.name === channelName && channel.type === ChannelType.GuildText
  );

  if (existing) return existing;

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites: baseOverwrites(interaction.guild, interaction.user.id, roleIds),
    topic: `${kind}:${type} | Oprettet af ${interaction.user.tag}`
  });

  return channel;
}

async function logAction(guild, message) {
  if (!config.logChannelId) return;
  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send(message).catch(() => null);
}

function isModerator(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim ticket').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Luk ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
}

async function handleTicketAction(interaction) {
  if (!interaction.channel.topic?.startsWith('ticket:') && !interaction.channel.topic?.startsWith('ansogning:')) {
    await interaction.reply({ content: 'Denne kanal er ikke en ticket eller ansøgning.', ephemeral: true });
    return;
  }
  if (!isModerator(interaction)) {
    await interaction.reply({ content: 'Kun staff kan bruge denne knap.', ephemeral: true });
    return;
  }
  if (interaction.customId === 'ticket_claim') {
    await interaction.reply(`🙋 Ticket claimed af ${interaction.user}.`);
    await logAction(interaction.guild, `🙋 ${interaction.user.tag} claimed ${interaction.channel}`);
    return;
  }
  await interaction.reply('🔒 Kanalen lukkes om 5 sekunder.');
  await logAction(interaction.guild, `🔒 ${interaction.user.tag} lukkede ${interaction.channel}`);
  setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
}

async function handleSuggestion(interaction) {
  const suggestion = interaction.options.getString('forslag', true);
  const channel = config.suggestionChannelId
    ? await interaction.guild.channels.fetch(config.suggestionChannelId).catch(() => null)
    : interaction.channel;
  if (!channel?.isTextBased()) {
    await interaction.reply({ content: 'Forslagskanalen findes ikke. Sæt SUGGESTION_CHANNEL_ID i .env.', ephemeral: true });
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('💡 Nyt forslag')
    .setDescription(suggestion)
    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
    .setFooter({ text: 'Stem med knapperne' })
    .setTimestamp();
  const sent = await channel.send({ embeds: [embed] });
  await sent.react('👍');
  await sent.react('👎');
  await interaction.reply({ content: `Dit forslag er sendt til ${channel}.`, ephemeral: true });
}

async function handleClear(interaction) {
  const amount = interaction.options.getInteger('antal', true);
  if (!interaction.channel.isTextBased() || !interaction.channel.bulkDelete) {
    await interaction.reply({ content: 'Denne kanal understøtter ikke sletning af beskeder.', ephemeral: true });
    return;
  }
  const deleted = await interaction.channel.bulkDelete(amount, true);
  await interaction.reply({ content: `🧹 Slettede ${deleted.size} beskeder.`, ephemeral: true });
  await logAction(interaction.guild, `🧹 ${interaction.user.tag} slettede ${deleted.size} beskeder i ${interaction.channel}.`);
}

async function handleTimeout(interaction) {
  const member = interaction.options.getMember('medlem');
  const minutes = interaction.options.getInteger('minutter', true);
  const reason = interaction.options.getString('grund') || 'Ingen grund angivet';
  if (!member?.moderatable) {
    await interaction.reply({ content: 'Jeg kan ikke give dette medlem timeout. Tjek min rolleplacering.', ephemeral: true });
    return;
  }
  await member.timeout(minutes * 60 * 1000, reason);
  await interaction.reply(`⏳ ${member} har fået timeout i ${minutes} minutter. Grund: ${reason}`);
  await logAction(interaction.guild, `⏳ ${interaction.user.tag} gav ${member.user.tag} timeout i ${minutes} minutter: ${reason}`);
}

function applicationModal(type) {
  const item = applicationTypes[type];
  return new ModalBuilder()
    .setCustomId(`application_modal_${type}`)
    .setTitle(`${item.label}-ansøgning`)
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Hvor gammel er du?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('experience').setLabel('Fortæl om din erfaring').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivation').setLabel('Hvorfor søger du?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))
    );
}

async function handleTicket(interaction, type) {
  await interaction.deferReply({ ephemeral: true });
  const channel = await createPrivateChannel(interaction, type, 'ticket');
  const item = ticketTypes[type];
  const embed = new EmbedBuilder()
    .setColor(item.color)
    .setTitle(`${item.emoji} ${item.label}`)
    .setDescription(`Hej ${interaction.user}, tak fordi du oprettede en ticket. Beskriv dit problem her, så hjælper teamet dig hurtigst muligt.`)
    .addFields({ name: 'Luk ticket', value: 'Brug `/close`, når sagen er færdig.' });
  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [ticketControls()] });
  await interaction.editReply(`Din ticket er klar: ${channel}`);
  await logAction(interaction.guild, `📁 ${interaction.user.tag} åbnede ${item.label}-ticket: ${channel}`);
}

async function handleApplication(interaction, type) {
  await interaction.showModal(applicationModal(type));
}

async function handleApplicationSubmit(interaction, type) {
  await interaction.deferReply({ ephemeral: true });
  const channel = await createPrivateChannel(interaction, type, 'ansogning');
  const item = applicationTypes[type];
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${item.emoji} ${item.label}-ansøgning`)
    .setDescription(`Ansøgning fra ${interaction.user}`)
    .addFields(
      { name: 'Alder', value: interaction.fields.getTextInputValue('age') },
      { name: 'Erfaring', value: interaction.fields.getTextInputValue('experience') },
      { name: 'Motivation', value: interaction.fields.getTextInputValue('motivation') }
    )
    .setTimestamp();
  await channel.send({ content: supportRoleMentions(interaction.guild), embeds: [embed] });
  await interaction.editReply(`Din ansøgning er sendt: ${channel}`);
  await logAction(interaction.guild, `📋 ${interaction.user.tag} sendte en ${item.label}-ansøgning: ${channel}`);
}

async function answerWithAi(message) {
  if (!openai) {
    await message.reply('AI-support er ikke sat op endnu. Tilføj `OPENAI_API_KEY` i `.env`, så er jeg klar.');
    return;
  }
  const question = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  if (!question) {
    await message.reply('Skriv dit spørgsmål efter mit ping, så prøver jeg at hjælpe.');
    return;
  }
  await message.channel.sendTyping();
  const completion = await openai.chat.completions.create({
    model: config.openAiModel,
    messages: [
      { role: 'system', content: 'Du er en venlig dansk Discord-supporter. Svar kort, naturligt og konkret på dansk. Opfind ikke serverregler eller staff-beslutninger. Sig tydeligt, hvis en medarbejder skal tage over.' },
      { role: 'user', content: question }
    ],
    max_tokens: 500
  });
  const answer = completion.choices[0]?.message?.content?.trim() || 'Jeg kunne ikke finde et svar lige nu.';
  await message.reply(answer.slice(0, 1900));
}

client.once(Events.ClientReady, async readyClient => {
  readyClient.user.setPresence({
    status: botSettings.status,
    activities: [{ name: botSettings.activity, type: botSettings.activityType }]
  });
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  await rest.put(route, { body: commands });
  console.log(`✅ ${readyClient.user.tag} er online`);
  console.log(`Status: ${botSettings.status} | Activity: ${botSettings.activity}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel') {
        const panelChannel = config.panelChannelId
          ? await interaction.guild.channels.fetch(config.panelChannelId).catch(() => null)
          : interaction.channel;
        if (!panelChannel?.isTextBased()) {
          await interaction.reply({ content: 'Panel-kanalen findes ikke. Sæt PANEL_CHANNEL_ID i .env.', ephemeral: true });
          return;
        }
        await sendPanels(panelChannel);
        await interaction.reply({ content: `Panelerne er sendt til ${panelChannel}.`, ephemeral: true });
      }
      if (interaction.commandName === 'ticketpanel' || interaction.commandName === 'ansogningpanel') {
        const isTicketPanel = interaction.commandName === 'ticketpanel';
        const channelId = isTicketPanel ? config.ticketPanelChannelId : config.applicationPanelChannelId;
        const panelType = isTicketPanel ? 'ticket' : 'application';
        const label = isTicketPanel ? 'ticket-panelet' : 'ansøgningspanelet';
        const panelChannel = channelId
          ? await interaction.guild.channels.fetch(channelId).catch(() => null)
          : null;
        if (!panelChannel?.isTextBased()) {
          await interaction.reply({ content: `Kanalen til ${label} findes ikke. Sæt ${isTicketPanel ? 'TICKET_PANEL_CHANNEL_ID' : 'APPLICATION_PANEL_CHANNEL_ID'} i .env.`, ephemeral: true });
          return;
        }
        await sendSinglePanel(panelChannel, panelType);
        await interaction.reply({ content: `${label} er sendt til ${panelChannel}.`, ephemeral: true });
      }
      if (interaction.commandName === 'close') {
        if (!interaction.channel.topic?.startsWith('ticket:') && !interaction.channel.topic?.startsWith('ansogning:')) {
          await interaction.reply({ content: 'Denne kanal er ikke en ticket eller ansøgning.', ephemeral: true });
          return;
        }
        await interaction.reply('Kanalen lukkes om 5 sekunder.');
        await logAction(interaction.guild, `🔒 ${interaction.user.tag} lukkede ${interaction.channel}`);
        setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
      }
      if (interaction.commandName === 'clear') await handleClear(interaction);
      if (interaction.commandName === 'timeout') await handleTimeout(interaction);
      if (interaction.commandName === 'suggest') await handleSuggestion(interaction);
    }
    if (interaction.isButton() && ['ticket_claim', 'ticket_close'].includes(interaction.customId)) {
      await handleTicketAction(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
      await handleTicket(interaction, interaction.customId.replace('ticket_', ''));
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'application_select') {
      await handleApplication(interaction, interaction.values[0]);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('application_modal_')) {
      await handleApplicationSubmit(interaction, interaction.customId.replace('application_modal_', ''));
    }
  } catch (error) {
    console.error(error);
    const reply = { content: 'Der skete en fejl. Tjek bot-loggen eller prøv igen.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild || !client.user) return;

  const now = Date.now();
  const timestamps = (spamTracker.get(message.author.id) || []).filter(time => now - time < config.antiSpamWindowMs);
  timestamps.push(now);
  spamTracker.set(message.author.id, timestamps);
  if (timestamps.length > config.antiSpamLimit && message.member?.moderatable) {
    await message.delete().catch(() => null);
    await message.member.timeout(60 * 1000, 'Anti-spam').catch(() => null);
    await message.channel.send(`🚨 ${message.author} fik 1 minuts timeout for spam.`).then(sent => {
      setTimeout(() => sent.delete().catch(() => null), 5000);
    }).catch(() => null);
    spamTracker.delete(message.author.id);
    await logAction(message.guild, `🚨 Anti-spam gav ${message.author.tag} timeout i ${message.channel}.`);
    return;
  }

  if (message.mentions.has(client.user)) {
    try {
      await answerWithAi(message);
    } catch (error) {
      console.error(error);
      await message.reply('AI-support er midlertidigt utilgængelig. Prøv igen om lidt eller opret en support-ticket.');
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
  if (config.welcomeRoleId) await member.roles.add(config.welcomeRoleId).catch(() => null);
  if (!config.welcomeChannelId) return;
  const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('👋 Velkommen!')
    .setDescription(`Velkommen til serveren, ${member}! Læs reglerne og brug /panel, hvis du har brug for hjælp.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => null);
  await logAction(member.guild, `👋 ${member.user.tag} joined serveren.`);
});

client.login(config.token);

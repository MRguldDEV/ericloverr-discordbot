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

async function createAiCompletion(question, systemMessage) {
  const request = {
    model: config.openAiModel,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: question }
    ]
  };
  if (config.openAiModel.startsWith('gpt-5')) request.max_completion_tokens = 500;
  else request.max_tokens = 500;
  return openai.chat.completions.create(request);
}

function aiErrorMessage(error) {
  const status = error?.status;
  if (status === 401) return 'OpenAI API-nøglen er ugyldig eller udløbet. Lav en ny nøgle og opdater OPENAI_API_KEY i .env.';
  if (status === 404) return `OpenAI-modellen "${config.openAiModel}" blev ikke fundet eller er ikke tilgængelig for din konto.`;
  if (status === 429) return 'OpenAI afviser forespørgslen på grund af rate limit eller manglende kredit.';
  return 'AI-support kunne ikke svare lige nu. Tjek bot-loggen for den præcise OpenAI-fejl.';
}

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
  },
  {
    name: 'ai',
    description: 'Stil AI-supporten et spørgsmål',
    options: [{ name: 'sporgsmal', description: 'Dit spørgsmål', type: 3, required: true, max_length: 1500 }]
  },
  {
    name: 'askai',
    description: 'Stil AI-supporten et spørgsmål',
    options: [{ name: 'sporgsmal', description: 'Dit spørgsmål', type: 3, required: true, max_length: 1500 }]
  },
  {
    name: 'ban',
    description: 'Bannér et medlem fra serveren',
    default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
    options: [
      { name: 'medlem', description: 'Medlemmet der skal bannes', type: 6, required: true },
      { name: 'grund', description: 'Grund til ban', type: 3, required: false }
    ]
  },
  {
    name: 'kick',
    description: 'Kick et medlem fra serveren',
    default_member_permissions: PermissionFlagsBits.KickMembers.toString(),
    options: [
      { name: 'medlem', description: 'Medlemmet der skal kickes', type: 6, required: true },
      { name: 'grund', description: 'Grund til kick', type: 3, required: false }
    ]
  },
  {
    name: 'warn',
    description: 'Giv et medlem en advarsel',
    default_member_permissions: PermissionFlagsBits.ManageMessages.toString(),
    options: [
      { name: 'medlem', description: 'Medlemmet der skal advares', type: 6, required: true },
      { name: 'grund', description: 'Grund til advarsel', type: 3, required: true }
    ]
  },
  {
    name: 'lock',
    description: 'Lås den aktuelle kanal',
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString()
  },
  {
    name: 'unlock',
    description: 'Lås den aktuelle kanal op',
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString()
  },
  {
    name: 'slowmode',
    description: 'Sæt slowmode i den aktuelle kanal',
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [{ name: 'sekunder', description: '0 til 21600 sekunder', type: 4, required: true, min_value: 0, max_value: 21600 }]
  },
  {
    name: 'userinfo',
    description: 'Vis oplysninger om et medlem',
    options: [{ name: 'medlem', description: 'Medlemmet du vil se', type: 6, required: false }]
  },
  {
    name: 'serverinfo',
    description: 'Vis oplysninger om serveren'
  },
  {
    name: 'avatar',
    description: 'Vis en brugers avatar',
    options: [{ name: 'medlem', description: 'Brugeren du vil se', type: 6, required: false }]
  },
  {
    name: 'ping',
    description: 'Se bottens ping'
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

async function handleAiCommand(interaction) {
  const question = interaction.options.getString('sporgsmal', true);
  if (!openai) {
    await interaction.reply({ content: 'AI-support er ikke sat op. Tilføj OPENAI_API_KEY i .env.', ephemeral: true });
    return;
  }
  await interaction.deferReply();
  const completion = await createAiCompletion(question, 'Du er en venlig dansk Discord-supporter. Svar kort, naturligt og konkret på dansk. Opfind ikke serverregler eller staff-beslutninger.');
  const answer = completion.choices[0]?.message?.content?.trim() || 'Jeg kunne ikke finde et svar lige nu.';
  await interaction.editReply(answer.slice(0, 1900));
}

async function handleBan(interaction) {
  const member = interaction.options.getMember('medlem');
  const reason = interaction.options.getString('grund') || 'Ingen grund angivet';
  if (!member?.bannable) {
    await interaction.reply({ content: 'Jeg kan ikke banne dette medlem. Tjek min rolleplacering.', ephemeral: true });
    return;
  }
  await member.ban({ reason });
  await interaction.reply(`🔨 ${member.user.tag} er bannet. Grund: ${reason}`);
  await logAction(interaction.guild, `🔨 ${interaction.user.tag} bannede ${member.user.tag}: ${reason}`);
}

async function handleKick(interaction) {
  const member = interaction.options.getMember('medlem');
  const reason = interaction.options.getString('grund') || 'Ingen grund angivet';
  if (!member?.kickable) {
    await interaction.reply({ content: 'Jeg kan ikke kicke dette medlem. Tjek min rolleplacering.', ephemeral: true });
    return;
  }
  await member.kick(reason);
  await interaction.reply(`👢 ${member.user.tag} er kicked. Grund: ${reason}`);
  await logAction(interaction.guild, `👢 ${interaction.user.tag} kickede ${member.user.tag}: ${reason}`);
}

async function handleWarn(interaction) {
  const member = interaction.options.getMember('medlem');
  const reason = interaction.options.getString('grund', true);
  await interaction.reply(`⚠️ ${member} har fået en advarsel. Grund: ${reason}`);
  await logAction(interaction.guild, `⚠️ ${interaction.user.tag} advarede ${member.user.tag}: ${reason}`);
}

async function handleChannelLock(interaction, locked) {
  await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    SendMessages: locked ? false : null
  });
  await interaction.reply(locked ? '🔒 Kanalen er låst.' : '🔓 Kanalen er låst op.');
  await logAction(interaction.guild, `${locked ? '🔒' : '🔓'} ${interaction.user.tag} ${locked ? 'låste' : 'låste op'} ${interaction.channel}.`);
}

async function handleSlowmode(interaction) {
  const seconds = interaction.options.getInteger('sekunder', true);
  await interaction.channel.setRateLimitPerUser(seconds);
  await interaction.reply(seconds ? `🐌 Slowmode er sat til ${seconds} sekunder.` : '🐌 Slowmode er slået fra.');
}

async function handleUserInfo(interaction) {
  const member = interaction.options.getMember('medlem') || interaction.member;
  const roles = member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.name).join(', ') || 'Ingen roller';
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`👤 ${member.user.tag}`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'Bruger-ID', value: member.id, inline: true },
      { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: 'Roller', value: roles.slice(0, 1024) }
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleServerInfo(interaction) {
  const guild = interaction.guild;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🌐 ${guild.name}`)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: 'Ejer', value: `<@${guild.ownerId}>`, inline: true },
      { name: 'Medlemmer', value: String(guild.memberCount), inline: true },
      { name: 'Kanaler', value: String(guild.channels.cache.size), inline: true },
      { name: 'Oprettet', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>` }
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleAvatar(interaction) {
  const user = interaction.options.getUser('medlem') || interaction.user;
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`🖼️ Avatar: ${user.tag}`).setImage(user.displayAvatarURL({ size: 1024 }));
  await interaction.reply({ embeds: [embed] });
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
  const completion = await createAiCompletion(question, 'Du er en venlig dansk Discord-supporter. Svar kort, naturligt og konkret på dansk. Opfind ikke serverregler eller staff-beslutninger. Sig tydeligt, hvis en medarbejder skal tage over.');
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
      if (interaction.commandName === 'ai' || interaction.commandName === 'askai') await handleAiCommand(interaction);
      if (interaction.commandName === 'ban') await handleBan(interaction);
      if (interaction.commandName === 'kick') await handleKick(interaction);
      if (interaction.commandName === 'warn') await handleWarn(interaction);
      if (interaction.commandName === 'lock') await handleChannelLock(interaction, true);
      if (interaction.commandName === 'unlock') await handleChannelLock(interaction, false);
      if (interaction.commandName === 'slowmode') await handleSlowmode(interaction);
      if (interaction.commandName === 'userinfo') await handleUserInfo(interaction);
      if (interaction.commandName === 'serverinfo') await handleServerInfo(interaction);
      if (interaction.commandName === 'avatar') await handleAvatar(interaction);
      if (interaction.commandName === 'ping') await interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
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
      await message.reply(aiErrorMessage(error));
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

# Dansk Discord supportbot

En Discord.js v14 bot med:

- Ticketpanel: Support, Management og Partnerskab
- Ansøgningspanel: Staff, Politi, Brandvæsen, Læge og Akutlæge
- Private ticket- og ansøgningskanaler
- Dansk AI-support når man pinger botten
- Konfigurerbar status og activity direkte i `src/index.js`
- `/panel` og `/close` slash commands
- Moderation: `/clear` og `/timeout`
- `/suggest` med 👍/👎 stemmer
- AI: `/ai`, `/askai` og ping direkte til botten
- Moderation: `/ban`, `/kick`, `/warn`, `/lock`, `/unlock`, `/slowmode`
- Info: `/userinfo`, `/serverinfo`, `/avatar`, `/ping`
- Velkomstbesked og autorole
- Anti-spam med automatisk timeout

## 1. Installer

Kræver Node.js 18.17 eller nyere.

```powershell
npm.cmd install
```

Kopiér `.env.example` til `.env` og udfyld mindst:

```env
DISCORD_TOKEN=din_bot_token
CLIENT_ID=din_application_id
GUILD_ID=din_server_id
OPENAI_API_KEY=din_openai_nøgle
```

`GUILD_ID` gør, at slash commands bliver opdateret med det samme på én server. Udelad den, hvis commands skal registreres globalt.

## 2. Discord Developer Portal

Botten skal inviteres med scopes:

- `bot`
- `applications.commands`

Giv den som minimum disse permissions:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Manage Channels
- Manage Messages

Under **Bot** skal disse intents være slået til:

- Server Members Intent er ikke nødvendig
- Message Content Intent er nødvendig for AI-support

## 3. Kør botten

```powershell
npm.cmd start
```

Kør derefter `/panel` i den kanal, hvor panelerne skal stå. Kommandoen kræver administrator.

## 4. Panel-kanal, kategorier og roller

Udfyld kanal-ID'erne sådan:

- `TICKET_PANEL_CHANNEL_ID`: kanal til ticket-panelet
- `APPLICATION_PANEL_CHANNEL_ID`: kanal til ansøgningspanelet
- `PANEL_CHANNEL_ID`: valgfri samlet kanal til `/panel`, som sender begge paneler

Brug `/ticketpanel` eller `/ansogningpanel` til at sende ét panel ad gangen. Kommandoerne kan køres fra en anden kanal.

Udfyld ID'erne i `.env`, hvis tickets skal placeres i bestemte kategorier eller gives til bestemte roller:

- `PANEL_CHANNEL_ID`: fast kanal til ticket- og ansøgningspanelerne
- `TICKET_CATEGORY_ID`: kategori til tickets
- `APPLICATION_CATEGORY_ID`: kategori til ansøgninger
- `STAFF_ROLE_ID`: staff-rolle med adgang til tickets og ansøgninger
- `ADMIN_ROLE_ID`: admin-rolle med adgang til tickets og ansøgninger
- `PARTNERSHIP_ROLE_ID`: ekstra rolle til partnerskabstickets
- `LOG_CHANNEL_ID`: kanal til åbne/lukkede tickets og ansøgninger
- `WELCOME_CHANNEL_ID`: kanal til velkomstbeskeder
- `WELCOME_ROLE_ID`: rolle der gives automatisk til nye medlemmer
- `SUGGESTION_CHANNEL_ID`: kanal hvor `/suggest` sender forslag
- `ANTI_SPAM_LIMIT`: antal beskeder før anti-spam reagerer, standard `6`
- `ANTI_SPAM_WINDOW_MS`: tidsvindue i millisekunder, standard `10000`

Lad felter stå tomme, hvis de ikke skal bruges.

## 5. Ekstra commands

- `/clear antal`: sletter 1-100 beskeder. Kræver Manage Messages.
- `/timeout medlem minutter grund`: giver timeout. Kræver Moderate Members.
- `/suggest forslag`: sender et forslag til forslagskanalen med stemmeknapper.
- Ticket-kanaler får knapper til `Claim ticket` og `Luk ticket`.

Anti-spam sletter beskeder og giver automatisk 1 minuts timeout, når en bruger sender for mange beskeder i det valgte tidsvindue.

## 6. Skift status og activity

Øverst i `src/index.js` findes:

```js
const botSettings = {
  status: 'online',
  activity: 'support på serveren',
  activityType: ActivityType.Watching
};
```

Gyldige statusser er:

- `online`
- `idle`
- `dnd` for forstyr ikke
- `invisible` for usynlig

Gyldige activity-typer fra Discord.js er blandt andet `ActivityType.Playing`, `ActivityType.Watching`, `ActivityType.Listening` og `ActivityType.Competing`.

AI-support kræver `OPENAI_API_KEY`. Uden nøglen svarer botten venligt, at AI-support ikke er sat op, mens resten af botten stadig virker.

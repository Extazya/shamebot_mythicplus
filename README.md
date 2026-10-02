# 🗝️ WoW M+ Discord Bot

Discord bot that tracks your players' **Mythic+** runs through the **Raider.io** API.  
Every new completed key, timed or depleted, is announced in a Discord channel of your choice.  
The bot can join several Discord servers: each one has its own channel and player list.

---

## ✨ Features

| Command | Description | Permission |
|---|---|---|
| `/add <name> <realm> [region]` | Track a character (checks that it exists on Raider.io) | Everyone |
| `/remove <name> <realm> [region]` | Stop tracking a character | Everyone |
| `/list` | List the characters tracked on this server | Everyone |
| `/check <name> <realm> [region] [count]` | Show a character's 1 to 5 latest runs | Everyone |
| `/setchannel [channel]` | Set the announcement channel (empty for the current one) | Manage Server |
| `/forcepoll` | Check for new runs right now | Manage Server |

Commands only work in a server, not in direct messages.

**Automatic polling every 5 minutes**: new runs are detected and announced without any manual action.

---

## 🔔 Announcements

Each run produces a colored Discord embed:

- 🟢 **Green**: timed key, with the number of levels gained (+1, +2, +3)
- 🔴 **Red**: depleted key

Shown: dungeon (with its icon), key level, result, clear time vs timer, run score, affixes, date (shown in each reader's own timezone), Raider.io link.

---

## 🚀 Installation

### Requirements

- [Node.js](https://nodejs.org/) **v18 or later**
- A [Discord Developer Portal](https://discord.com/developers/applications) account

---

### Step 1: create the Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** and give it a name (`MPlus Tracker` for instance)
3. In **General Information**, copy the **Application ID**: this is your `CLIENT_ID`
4. In the **Bot** tab:
   - Click **Add Bot**
   - Copy the **Token**: this is your `DISCORD_TOKEN`
   - *Privileged Gateway Intents* are **not** needed
5. In **OAuth2 → URL Generator**:
   - Scopes: `bot` and `applications.commands`
   - Bot permissions: `Send Messages`, `Embed Links`, `View Channels`
   - Open the generated URL to invite the bot to your server

---

### Step 2: configure the project

```bash
git clone https://github.com/Extazya/shamebot_mythicplus.git
cd shamebot_mythicplus

npm install
cp .env.example .env
```

Fill in at least the first two values of `.env`:

```env
DISCORD_TOKEN=your_discord_token
CLIENT_ID=your_client_id
# Optional: instant command registration on a single server
GUILD_ID=
# Optional: database location (default data/db.json)
# DB_PATH=/var/lib/mplus-bot/db.json
```

`.env` and `data/` are ignored by git. Never commit them, the token gives full control over the bot.

---

### Step 3: register the slash commands

```bash
npm run deploy
```

> **Note:** global registration can take up to **1 hour** to show up everywhere.  
> For **instant** registration on a single server (handy during development), set `GUILD_ID` in `.env`
> (right click on the server, *Copy Server ID*, developer mode required).
>
> Run `npm run deploy` again after every update that changes the commands.

---

### Step 4: run the tests (optional)

```bash
npm test
```

Tests use neither the network nor Discord, and work on a temporary database: `data/db.json` is left untouched.

---

### Step 5: start the bot

```bash
npm start
```

During development, with automatic restart:
```bash
npm run dev
```

---

## ⚙️ Discord setup

Once the bot is up and connected:

**1. Set the announcement channel** (required before any announcement):
```
/setchannel #mythic-plus
```

**2. Add characters to track**:
```
/add Arthas Archimonde eu
/add Thrall Hyjal eu
/add SomePlayer Illidan us
```

The bot checks that each character exists on Raider.io before adding it, stores the official spelling of the name and realm (`tarren mill`, `Tarren Mill` and `tarren-mill` are the same realm), and records the current runs so old ones are not announced.

**3. Trigger a check by hand** (optional):
```
/forcepoll
```

---

## 📁 Project layout

```
shamebot_mythicplus/
├── src/
│   ├── index.js            # Entry point: Discord login, command loading, events, v1 migration
│   ├── db.js               # Atomic JSON storage, per guild (players, channel) + seen run ids
│   ├── player.js           # Character identity: realm slug, unique key, Raider.io link
│   ├── options.js          # Shared name / realm / region command options
│   ├── raiderio.js         # Raider.io client (fetch, 10s timeout, retry on 429/503) + run formatting
│   ├── ratelimiter.js      # Serialized token bucket: at most 60 req/min to Raider.io
│   ├── embeds.js           # Discord embed builders (run, profile, list)
│   ├── poller.js           # 5 minute polling loop with a concurrency guard
│   └── commands/
│       ├── add.js          # /add
│       ├── remove.js       # /remove
│       ├── list.js         # /list
│       ├── check.js        # /check
│       ├── setchannel.js   # /setchannel
│       └── forcepoll.js    # /forcepoll
├── tests/
│   ├── mock-discord.js     # discord.js mock (no network)
│   └── run.js              # Unit and integration tests (npm test)
├── data/
│   └── db.json             # Created automatically, ignored by git
├── deploy-commands.js      # Slash command registration script
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🛠️ Customization

### Polling interval

In `src/poller.js`:
```js
const POLL_INTERVAL_MS = 5 * 60 * 1000;
```

> ⚠️ Below 2 minutes you may hit the Raider.io API limits, and Raider.io only refreshes its data about every 15 minutes anyway.

### Rate limit

In `src/ratelimiter.js`:
```js
const MAX_REQUESTS = 60; // per minute
```

---

## 🖥️ 24/7 hosting

To keep the bot running all the time, use one of these:

| Option | Cost | Ease |
|---|---|---|
| [Railway](https://railway.app) | Free (limited) / paid | ⭐⭐⭐ |
| [Render](https://render.com) | Free (limited) / paid | ⭐⭐⭐ |
| [fly.io](https://fly.io) | Free (limited) / paid | ⭐⭐ |
| VPS (OVH, Hetzner...) | about 4€/month | ⭐ |

**With PM2 on a VPS:**
```bash
npm install -g pm2
pm2 start src/index.js --name "mplus-bot"
pm2 save       # remember the process list
pm2 startup    # start on boot
```

---

## ⚠️ Limits and behaviour

### Raider.io API
- **Free, no API key required**
- Raider.io refreshes its data about every **15 minutes**, polling more often brings nothing
- The bot stays under **60 requests/minute** (built-in rate limiter, retries included) and retries automatically on HTTP 429 and 503
- A character tracked by several servers is fetched only once per cycle

### First use
On `/add`, the bot records the character's current runs **without announcing them**. Only runs completed **after** the add are announced, including the very first run of a character that had none yet.

### Storage
Data lives in `data/db.json` (configurable with `DB_PATH`). The file is created automatically. **Do not delete it**: every server would lose its channel and player list.

A corrupted file is renamed to `db.json.corrupt-<timestamp>` (so it can be recovered by hand) and an empty database is created.

When the bot leaves a Discord server, that server's configuration is deleted.

### Upgrading from v1
v1 stored a single channel and player list for the whole bot. On the first v2 start, that data is bound to the server owning the old announcement channel (or to the bot's only server if it is in just one). Already seen runs are kept, nothing is announced again. Remember to run `npm run deploy` again.

### Reconnection
discord.js reconnects automatically after a network outage. Connection and disconnection events are logged.

On an uncaught error the bot exits on purpose (code 1) instead of running in an unknown state: run it under a supervisor (PM2, systemd, Docker `restart: unless-stopped`...) so it restarts automatically.

---

## 🐛 Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Commands do not show up | Global registration not propagated yet | Wait 1h, or set `GUILD_ID` then `npm run deploy` |
| `❌ Missing variables in .env` | `.env` missing or incomplete | Check `DISCORD_TOKEN` and `CLIENT_ID` |
| `Channel ... not found` in the logs | Channel deleted or no longer visible to the bot | Run `/setchannel` again |
| `Cannot send to channel` in the logs | Bot permissions removed after `/setchannel` | Give the bot *View Channel*, *Send Messages* and *Embed Links* back |
| A character is not found | Misspelled name or realm, or character not indexed | Check that the profile exists on [raider.io](https://raider.io) |
| Runs are not announced | `/setchannel` not set on this server, or missing permissions | Check `/setchannel` and the bot permissions in the channel |
| No player or channel configured anymore | `data/db.json` deleted, or corrupted then reset | Restore from `db.json.corrupt-*` if present, otherwise redo `/setchannel` and `/add` |
| `v1 configuration not migrated` at startup | Old channel deleted and bot in several servers | Redo `/setchannel` and `/add` on the right server |

---

## 📝 License

MIT, free to use and modify.

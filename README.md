# 🗝️ WoW M+ Discord Bot

Bot Discord pour suivre automatiquement les runs **Mythic+** de vos joueurs via l'API **Raider.io**. Chaque nouvelle clé complétée (dans les temps ou non) est annoncée dans un canal Discord défini.

---

## ✨ Fonctionnalités

| Commande | Description |
|---|---|
| `/add <nom> <serveur> [region]` | Ajoute un joueur au suivi |
| `/remove <nom> <serveur> [region]` | Retire un joueur du suivi |
| `/list` | Liste tous les joueurs suivis |
| `/check <nom> <serveur> [region] [nombre]` | Affiche les dernières runs d'un joueur |
| `/setchannel [canal]` | Définit le canal d'annonces (nécessite Gérer le serveur) |
| `/forcepoll` | Force une vérification immédiate (nécessite Gérer le serveur) |

Le bot vérifie les nouvelles runs **toutes les 5 minutes** automatiquement.

---

## 🚀 Installation

### Prérequis

- [Node.js](https://nodejs.org/) **v18 ou supérieur**
- Un compte [Discord Developer Portal](https://discord.com/developers/applications)

---

### Étape 1 — Créer l'application Discord

1. Rendez-vous sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Cliquez **New Application** → donnez un nom (ex: `MPlus Tracker`)
3. Dans **General Information**, copiez l'**Application ID** → ce sera votre `CLIENT_ID`
4. Dans l'onglet **Bot** :
   - Cliquez **Add Bot**
   - Copiez le **Token** → ce sera votre `DISCORD_TOKEN`
   - Activez les **Privileged Gateway Intents** si besoin (pour ce bot, ce n'est pas nécessaire)
5. Dans **OAuth2 → URL Generator** :
   - Scopes : `bot` + `applications.commands`
   - Permissions bot : `Send Messages`, `Embed Links`, `View Channels`
   - Copiez l'URL générée et invitez le bot sur votre serveur

---

### Étape 2 — Configurer le projet

```bash
# Cloner / décompresser le projet, puis :
cd wow-mplus-bot

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env
```

Ouvrez `.env` et renseignez vos valeurs :

```env
DISCORD_TOKEN=ton_token_discord_ici
CLIENT_ID=ton_client_id_ici
```

---

### Étape 3 — Enregistrer les commandes slash

```bash
npm run deploy
```

> Les commandes globales peuvent prendre jusqu'à **1 heure** pour apparaître sur tous les serveurs.  
> Pour un déploiement **instantané** sur un seul serveur, modifiez `deploy-commands.js` :
> ```js
> // Remplacez cette ligne :
> Routes.applicationCommands(process.env.CLIENT_ID),
> // Par :
> Routes.applicationGuildCommands(process.env.CLIENT_ID, 'TON_GUILD_ID'),
> ```

---

### Étape 4 — Lancer le bot

```bash
npm start
```

En développement (redémarrage automatique) :
```bash
npm run dev
```

---

## ⚙️ Configuration Discord

Une fois le bot lancé :

1. **Définir le canal d'annonces** (obligatoire) :
   ```
   /setchannel #nom-du-canal
   ```

2. **Ajouter des joueurs** :
   ```
   /add Arthas Archimonde eu
   /add Thrall Hyjal eu
   /add SomePlayer Illidan us
   ```

3. **Vérifier manuellement** (optionnel) :
   ```
   /forcepoll
   ```

---

## 📁 Structure du projet

```
wow-mplus-bot/
├── src/
│   ├── index.js          # Point d'entrée du bot
│   ├── db.js             # Stockage JSON (joueurs, canal, runs vus)
│   ├── raiderio.js       # Wrapper API Raider.io
│   ├── embeds.js         # Construction des embeds Discord
│   ├── poller.js         # Boucle de vérification automatique
│   └── commands/
│       ├── add.js        # /add
│       ├── remove.js     # /remove
│       ├── list.js       # /list
│       ├── check.js      # /check
│       ├── setchannel.js # /setchannel
│       └── forcepoll.js  # /forcepoll
├── data/
│   └── db.json           # Créé automatiquement au démarrage
├── deploy-commands.js    # Script d'enregistrement des commandes
├── package.json
├── .env.example
└── README.md
```

---

## 🔔 Exemple d'annonce

Chaque run génère un embed Discord coloré :

- 🟢 **Vert** = clé dans les temps (+1, +2, +3 coffres)
- 🔴 **Rouge** = clé hors temps (dépassée)

Informations affichées :
- Donjon + niveau de clé
- Résultat (dans/hors temps, bonus de coffres)
- Durée réelle vs par time
- Score M+ gagné
- Affixes actifs
- Lien Raider.io du run

---

## 🛠️ Personnalisation

### Changer l'intervalle de polling

Dans `src/poller.js`, modifiez :
```js
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
```

### Hébergement 24/7

Pour garder le bot actif en permanence, utilisez :
- [Railway](https://railway.app) (gratuit avec limitations)
- [Render](https://render.com)
- [fly.io](https://fly.io)
- Un VPS (OVH, Hetzner, etc.)

Avec PM2 sur un serveur :
```bash
npm install -g pm2
pm2 start src/index.js --name "mplus-bot"
pm2 save
pm2 startup
```

---

## ⚠️ Limites de l'API Raider.io

- L'API publique de Raider.io est **gratuite et sans clé** requise
- Elle est limitée à environ **300 requêtes/minute**
- Les données sont rafraîchies toutes les ~15 minutes côté Raider.io
- Un intervalle de polling de 5 minutes est un bon compromis

---

## 📝 Licence

MIT — Libre d'utilisation et de modification.

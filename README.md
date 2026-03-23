# 🗝️ WoW M+ Discord Bot

Bot Discord pour suivre automatiquement les runs **Mythic+** de vos joueurs via l'API **Raider.io**.  
Chaque nouvelle clé complétée — dans les temps ou non — est annoncée en temps réel dans un canal Discord défini.

---

## ✨ Fonctionnalités

| Commande | Description | Permission |
|---|---|---|
| `/add <nom> <serveur> [region]` | Ajoute un joueur au suivi (vérifie qu'il existe sur Raider.io) | Tout le monde |
| `/remove <nom> <serveur> [region]` | Retire un joueur du suivi | Tout le monde |
| `/list` | Liste tous les joueurs suivis | Tout le monde |
| `/check <nom> <serveur> [region] [nombre]` | Affiche les 1 à 5 dernières runs d'un joueur | Tout le monde |
| `/setchannel [canal]` | Définit le canal d'annonces (vide = canal actuel) | Gérer le serveur |
| `/forcepoll` | Force une vérification immédiate des nouvelles runs | Gérer le serveur |

**Polling automatique toutes les 5 minutes** — les nouvelles runs sont détectées et annoncées sans action manuelle.

---

## 🔔 Aperçu des annonces

Chaque run génère un embed Discord coloré avec :

- 🟢 **Vert** — clé dans les temps (avec le nombre de coffres bonus)
- 🔴 **Rouge** — clé hors temps

Informations affichées : donjon, niveau de clé, résultat, durée réelle vs par time, score M+ gagné, affixes actifs, date, lien Raider.io.

---

## 🚀 Installation

### Prérequis

- [Node.js](https://nodejs.org/) **v18 ou supérieur**
- Un compte [Discord Developer Portal](https://discord.com/developers/applications)

---

### Étape 1 — Créer l'application Discord

1. Rendez-vous sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Cliquez **New Application** → donnez-lui un nom (ex : `MPlus Tracker`)
3. Dans **General Information** → copiez l'**Application ID** → ce sera votre `CLIENT_ID`
4. Dans l'onglet **Bot** :
   - Cliquez **Add Bot**
   - Copiez le **Token** → ce sera votre `DISCORD_TOKEN`
   - Les *Privileged Gateway Intents* ne sont **pas** nécessaires pour ce bot
5. Dans **OAuth2 → URL Generator** :
   - Cochez les scopes : `bot` + `applications.commands`
   - Cochez les permissions bot : `Send Messages`, `Embed Links`, `View Channels`
   - Copiez l'URL générée et invitez le bot sur votre serveur

---

### Étape 2 — Configurer le projet

```bash
# Décompresser le projet, puis :
cd wow-mplus-bot

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env
```

Ouvrez `.env` et renseignez vos deux valeurs :

```env
DISCORD_TOKEN=ton_token_discord_ici
CLIENT_ID=ton_client_id_ici
```

---

### Étape 3 — Enregistrer les commandes slash

```bash
npm run deploy
```

> **Note :** Le déploiement global peut prendre jusqu'à **1 heure** pour apparaître partout.  
> Pour un déploiement **instantané** sur un seul serveur (recommandé en développement), modifiez `deploy-commands.js` :
> ```js
> // Remplacez :
> Routes.applicationCommands(process.env.CLIENT_ID)
> // Par :
> Routes.applicationGuildCommands(process.env.CLIENT_ID, 'VOTRE_GUILD_ID')
> ```

---

### Étape 4 — Lancer les tests (optionnel)

```bash
node tests/run.js
```

---

### Étape 5 — Démarrer le bot

```bash
npm start
```

En développement avec redémarrage automatique :
```bash
npm run dev
```

---

## ⚙️ Configuration sur Discord

Une fois le bot démarré et connecté :

**1. Définir le canal d'annonces** (obligatoire avant que les notifications fonctionnent) :
```
/setchannel #mythic-plus
```

**2. Ajouter des joueurs à suivre** :
```
/add Arthas Archimonde eu
/add Thrall Hyjal eu
/add SomePlayer Illidan us
```

Le bot vérifie que chaque personnage existe sur Raider.io avant de l'ajouter, et initialise automatiquement ses runs connus pour ne pas notifier les anciennes.

**3. Vérifier les annonces manuellement** (optionnel) :
```
/forcepoll
```

---

## 📁 Structure du projet

```
wow-mplus-bot/
├── src/
│   ├── index.js            # Point d'entrée : connexion Discord, chargement commandes, événements
│   ├── db.js               # Persistance JSON atomique (joueurs, canal, IDs de runs vus)
│   ├── raiderio.js         # Client API Raider.io (HTTP, timeout 10s, retry sur 429)
│   ├── ratelimiter.js      # Token bucket sérialisé : 60 req/min max vers Raider.io
│   ├── embeds.js           # Construction des embeds Discord (run, profil, liste)
│   ├── poller.js           # Boucle de polling toutes les 5 min avec guard anti-concurrence
│   └── commands/
│       ├── add.js          # /add
│       ├── remove.js       # /remove
│       ├── list.js         # /list
│       ├── check.js        # /check
│       ├── setchannel.js   # /setchannel
│       └── forcepoll.js    # /forcepoll
├── tests/
│   ├── mock-discord.js     # Mock discord.js pour les tests (sans dépendance réseau)
│   └── run.js              # Suite de 29 tests unitaires et d'intégration
├── data/
│   └── db.json             # Créé automatiquement — ne pas versionner
├── deploy-commands.js      # Script d'enregistrement des commandes slash
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🛠️ Personnalisation

### Changer l'intervalle de polling

Dans `src/poller.js` :
```js
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — à ajuster selon vos besoins
```

> ⚠️ En dessous de 2 minutes, vous risquez d'atteindre les limites de l'API Raider.io (les données côté Raider.io ne se rafraîchissent de toute façon que toutes les ~15 minutes).

### Changer la limite de rate limiting

Dans `src/ratelimiter.js` :
```js
const MAX_REQUESTS = 60; // requêtes max par minute vers Raider.io
```

---

## 🖥️ Hébergement 24/7

Pour que le bot tourne en permanence, utilisez l'une de ces solutions :

| Solution | Coût | Facilité |
|---|---|---|
| [Railway](https://railway.app) | Gratuit (limité) / payant | ⭐⭐⭐ |
| [Render](https://render.com) | Gratuit (limité) / payant | ⭐⭐⭐ |
| [fly.io](https://fly.io) | Gratuit (limité) / payant | ⭐⭐ |
| VPS (OVH, Hetzner…) | ~4€/mois | ⭐ |

**Avec PM2 sur un VPS :**
```bash
npm install -g pm2
pm2 start src/index.js --name "mplus-bot"
pm2 save       # Sauvegarde pour redémarrage auto
pm2 startup    # Active le démarrage au boot
```

---

## ⚠️ Limites et comportements à connaître

### API Raider.io
- **Gratuite, sans clé API requise**
- Les données côté Raider.io se rafraîchissent toutes les **~15 minutes** — un polling plus fréquent n'apportera rien
- Le bot se limite à **60 requêtes/minute** (rate limiter intégré) et gère automatiquement les erreurs HTTP 429 avec retry

### Première utilisation
Lors du premier `/add`, le bot enregistre les runs actuels du joueur **sans les annoncer**. Seules les runs **postérieures** à l'ajout seront notifiées.

### Stockage
Les données sont stockées dans `data/db.json`. Ce fichier est créé automatiquement. **Ne le supprimez pas** sans raison : cela ferait ré-annoncer toutes les runs connues au prochain poll.

### Reconnexion
Discord.js gère la reconnexion automatiquement en cas de coupure réseau. Les événements de connexion/déconnexion sont loggués dans la console.

---

## 🐛 Dépannage

| Problème | Cause probable | Solution |
|---|---|---|
| Les commandes n'apparaissent pas | Déploiement global pas encore propagé | Attendre 1h, ou utiliser `applicationGuildCommands` |
| `❌ Variables manquantes dans .env` | `.env` absent ou mal rempli | Vérifier `DISCORD_TOKEN` et `CLIENT_ID` |
| `Canal introuvable` dans les logs | Le canal a été supprimé ou le bot n'y a plus accès | Relancer `/setchannel` |
| Un joueur n'est pas trouvé | Nom ou serveur mal orthographié, ou personnage non indexé | Vérifier sur [raider.io](https://raider.io) que le profil existe |
| Les runs ne s'annoncent pas | `setchannel` non configuré, ou bot sans permission | Vérifier `/setchannel` et les permissions du bot dans le canal |
| Toutes les anciennes runs ré-annoncées | `data/db.json` supprimé ou corrompu | Normal au redémarrage — utilisez `/forcepoll` pour re-initialiser |

---

## 📝 Licence

MIT — Libre d'utilisation et de modification.

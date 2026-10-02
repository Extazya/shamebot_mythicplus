# 🗝️ WoW M+ Discord Bot

Bot Discord pour suivre automatiquement les runs **Mythic+** de vos joueurs via l'API **Raider.io**.  
Chaque nouvelle clé complétée — dans les temps ou non — est annoncée en temps réel dans un canal Discord défini.  
Le bot peut être installé sur plusieurs serveurs Discord : chacun a son propre canal et sa propre liste de joueurs.

---

## ✨ Fonctionnalités

| Commande | Description | Permission |
|---|---|---|
| `/add <nom> <serveur> [region]` | Ajoute un joueur au suivi (vérifie qu'il existe sur Raider.io) | Tout le monde |
| `/remove <nom> <serveur> [region]` | Retire un joueur du suivi | Tout le monde |
| `/list` | Liste les joueurs suivis sur ce serveur | Tout le monde |
| `/check <nom> <serveur> [region] [nombre]` | Affiche les 1 à 5 dernières runs d'un joueur | Tout le monde |
| `/setchannel [canal]` | Définit le canal d'annonces (vide = canal actuel) | Gérer le serveur |
| `/forcepoll` | Force une vérification immédiate des nouvelles runs | Gérer le serveur |

Les commandes ne sont utilisables que sur un serveur (pas en message privé).

**Polling automatique toutes les 5 minutes** — les nouvelles runs sont détectées et annoncées sans action manuelle.

---

## 🔔 Aperçu des annonces

Chaque run génère un embed Discord coloré avec :

- 🟢 **Vert** — clé dans les temps (avec le nombre de niveaux gagnés : +1, +2, +3)
- 🔴 **Rouge** — clé hors temps

Informations affichées : donjon (avec son icône), niveau de clé, résultat, durée réelle vs par time, score de la run, affixes actifs, date (affichée dans le fuseau horaire de chaque lecteur), lien Raider.io.

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
git clone https://github.com/Extazya/shamebot_mythicplus.git
cd shamebot_mythicplus

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env
```

Ouvrez `.env` et renseignez au minimum les deux premières valeurs :

```env
DISCORD_TOKEN=ton_token_discord_ici
CLIENT_ID=ton_client_id_ici
# Optionnel : déploiement instantané des commandes sur un seul serveur
GUILD_ID=
# Optionnel : emplacement de la base (défaut : data/db.json)
# DB_PATH=/var/lib/mplus-bot/db.json
```

`.env` et `data/` sont exclus du dépôt par le `.gitignore` : ne les commitez jamais (le token donne le contrôle total du bot).

---

### Étape 3 — Enregistrer les commandes slash

```bash
npm run deploy
```

> **Note :** Le déploiement global peut prendre jusqu'à **1 heure** pour apparaître partout.  
> Pour un déploiement **instantané** sur un seul serveur (recommandé en développement), renseignez `GUILD_ID` dans `.env`
> (clic droit sur le serveur → *Copier l'identifiant du serveur*, mode développeur requis).
>
> Relancez `npm run deploy` après chaque mise à jour du bot qui modifie les commandes.

---

### Étape 4 — Lancer les tests (optionnel)

```bash
npm test
```

Les tests n'utilisent ni le réseau ni Discord, et travaillent sur une base temporaire : ils ne touchent pas à `data/db.json`.

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

Le bot vérifie que chaque personnage existe sur Raider.io avant de l'ajouter, enregistre l'orthographe officielle du nom et du serveur (`tarren mill`, `Tarren Mill` et `tarren-mill` désignent le même serveur), et initialise ses runs connues pour ne pas notifier les anciennes.

**3. Vérifier les annonces manuellement** (optionnel) :
```
/forcepoll
```

---

## 📁 Structure du projet

```
shamebot_mythicplus/
├── src/
│   ├── index.js            # Point d'entrée : connexion Discord, chargement commandes, événements, migration v1
│   ├── db.js               # Persistance JSON atomique, par serveur (joueurs, canal) + IDs de runs vus
│   ├── player.js           # Identité d'un personnage : slug du serveur, clé unique, lien Raider.io
│   ├── options.js          # Options communes nom / serveur / région des commandes
│   ├── raiderio.js         # Client API Raider.io (fetch, timeout 10s, retry sur 429/503) + formatage des runs
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
│   └── run.js              # Suite de tests unitaires et d'intégration (npm test)
├── data/
│   └── db.json             # Créé automatiquement — ignoré par git
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
- Le bot se limite à **60 requêtes/minute** (rate limiter intégré, nouveaux essais compris) et réessaie automatiquement sur les erreurs HTTP 429 et 503
- Un personnage suivi par plusieurs serveurs Discord n'est interrogé qu'une fois par cycle

### Première utilisation
Lors du premier `/add`, le bot enregistre les runs actuelles du joueur **sans les annoncer**. Seules les runs **postérieures** à l'ajout seront notifiées — y compris la toute première run d'un personnage qui n'en avait encore aucune.

### Stockage
Les données sont stockées dans `data/db.json` (modifiable via `DB_PATH`). Ce fichier est créé automatiquement. **Ne le supprimez pas** : vous perdriez les canaux et listes de joueurs de tous les serveurs.

Si le fichier est corrompu, il est renommé en `db.json.corrupt-<timestamp>` (pour pouvoir le récupérer à la main) et une base vide est recréée.

Quand le bot quitte un serveur Discord, la configuration de ce serveur est supprimée.

### Mise à jour depuis la v1
La v1 stockait un seul canal et une seule liste de joueurs pour tout le bot. Au premier démarrage de la v2, ces données sont automatiquement rattachées au serveur qui possède l'ancien canal d'annonces (ou au seul serveur du bot s'il n'est que sur un). Les runs déjà vues sont conservées : rien n'est ré-annoncé. Pensez à relancer `npm run deploy`.

### Reconnexion
Discord.js gère la reconnexion automatiquement en cas de coupure réseau. Les événements de connexion/déconnexion sont loggués dans la console.

En cas d'erreur non rattrapée, le bot s'arrête volontairement (code 1) plutôt que de continuer dans un état incertain : faites-le tourner sous un superviseur (PM2, systemd, Docker `restart: unless-stopped`…) pour qu'il redémarre automatiquement.

---

## 🐛 Dépannage

| Problème | Cause probable | Solution |
|---|---|---|
| Les commandes n'apparaissent pas | Déploiement global pas encore propagé | Attendre 1h, ou renseigner `GUILD_ID` puis `npm run deploy` |
| `❌ Variables manquantes dans .env` | `.env` absent ou mal rempli | Vérifier `DISCORD_TOKEN` et `CLIENT_ID` |
| `Canal … introuvable` dans les logs | Le canal a été supprimé ou le bot n'y a plus accès | Relancer `/setchannel` |
| `Envoi impossible dans le canal` dans les logs | Permissions retirées au bot après `/setchannel` | Rendre au bot *Voir le salon*, *Envoyer des messages* et *Intégrer des liens* |
| Un joueur n'est pas trouvé | Nom ou serveur mal orthographié, ou personnage non indexé | Vérifier sur [raider.io](https://raider.io) que le profil existe |
| Les runs ne s'annoncent pas | `/setchannel` non configuré sur ce serveur, ou bot sans permission | Vérifier `/setchannel` et les permissions du bot dans le canal |
| Plus aucun joueur ni canal configuré | `data/db.json` supprimé, ou corrompu puis réinitialisé | Restaurer depuis `db.json.corrupt-*` si présent, sinon refaire `/setchannel` et `/add` |
| `Configuration v1 non migrée` au démarrage | Ancien canal supprimé et bot présent sur plusieurs serveurs | Refaire `/setchannel` et `/add` sur le bon serveur |

---

## 📝 Licence

MIT — Libre d'utilisation et de modification.

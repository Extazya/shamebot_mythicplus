/**
 * Mock discord.js pour les tests.
 * Enregistre les appels pour pouvoir faire des assertions dessus.
 */

class EmbedBuilder {
  constructor() {
    this._data   = { fields: [] };
    this._errors = [];
  }

  setColor(c)    { this._data.color = c; return this; }
  setTitle(t)    { this._data.title = t; return this; }
  setFooter(f)   { this._data.footer = f; return this; }
  setTimestamp() { return this; }
  setAuthor(a)   { this._data.author = a; return this; }
  setDescription(d) {
    if (d !== null && d !== undefined && d.length > 4096)
      this._errors.push(`Description trop longue : ${d.length} chars`);
    this._data.description = d;
    return this;
  }

  setURL(u) {
    if (u === null || u === undefined)
      this._errors.push('setURL appelé avec null/undefined');
    this._data.url = u;
    return this;
  }

  setThumbnail(u) {
    if (u === null || u === undefined)
      this._errors.push('setThumbnail appelé avec null/undefined');
    this._data.thumbnail = u;
    return this;
  }

  addFields(...args) {
    const fields = args.flat();
    for (const f of fields) {
      if (f.value === null || f.value === undefined || f.value === '')
        this._errors.push(`Champ embed "${f.name}" vide ou null`);
      this._data.fields.push(f);
    }
    return this;
  }

  /** Lève une erreur si des problèmes ont été détectés */
  validate() {
    if (this._errors.length > 0)
      throw new Error('Embed invalide :\n  - ' + this._errors.join('\n  - '));
    return this;
  }
}

class OptionBuilder {
  setName(n)           { this._name = n; return this; }
  setDescription()     { return this; }
  setRequired()        { return this; }
  addChoices()         { return this; }
  setMinValue()        { return this; }
  setMaxValue()        { return this; }
}

class SlashCommandBuilder {
  setName(n)                       { this.name = n; return this; }
  setDescription()                 { return this; }
  addStringOption(fn)              { fn(new OptionBuilder()); return this; }
  addIntegerOption(fn)             { fn(new OptionBuilder()); return this; }
  addChannelOption(fn)             { fn(new OptionBuilder()); return this; }
  setDefaultMemberPermissions()    { return this; }
  toJSON()                         { return { name: this.name }; }
}

class Collection extends Map {}

class REST {
  constructor() {}
  setToken() { return this; }
  put()      { return Promise.resolve([]); }
}

const Routes = {
  applicationCommands:      () => '/',
  applicationGuildCommands: () => '/',
};

const GatewayIntentBits  = { Guilds: 1 };
const PermissionFlagsBits = { ManageGuild: 32 };

class Client extends require('events') {
  constructor() {
    super();
    this.commands = new Collection();
    this.user     = { tag: 'TestBot#0000' };
    this.channels = {
      fetch: async () => ({
        send: async (payload) => {
          // Valider les embeds si possible
          if (payload.embeds) {
            for (const e of payload.embeds) {
              if (typeof e.validate === 'function') e.validate();
            }
          }
          return payload;
        },
      }),
    };
  }
  login() { return Promise.resolve(); }
  destroy() {}
}

module.exports = {
  EmbedBuilder,
  SlashCommandBuilder,
  Collection,
  REST,
  Routes,
  GatewayIntentBits,
  PermissionFlagsBits,
  Client,
};

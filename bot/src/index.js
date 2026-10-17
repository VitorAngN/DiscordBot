import { Client, Events, GatewayIntentBits, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { definicoes, tratarInteracao } from './comandos.js';
import { erro, log } from './log.js';
import * as player from './player.js';

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  erro('DISCORD_TOKEN não definido. Copie bot/.env.example para bot/.env e cole o token do seu bot.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const PERMISSOES = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
];

// Comandos por servidor aparecem na hora (os globais podem demorar)
async function registrarComandos(guild) {
  try {
    await guild.commands.set(definicoes);
  } catch (e) {
    erro(`Não consegui registrar os comandos em "${guild.name}":`, e.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  log(`Bot online como ${c.user.tag}.`);
  await Promise.all(c.guilds.cache.map(registrarComandos));
  log(
    c.guilds.cache.size
      ? `Comandos prontos em ${c.guilds.cache.size} servidor(es).`
      : 'O bot ainda não está em nenhum servidor.',
  );
  const convite = c.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: PERMISSOES,
  });
  log(`Link para convidar o bot: ${convite}`);
});

client.on(Events.GuildCreate, async (guild) => {
  log(`Entrei no servidor "${guild.name}".`);
  await registrarComandos(guild);
});
client.on(Events.InteractionCreate, tratarInteracao);
client.on(Events.Error, (e) => erro('Cliente do Discord:', e.message));

function encerrar() {
  log('Encerrando...');
  player.sairDeTodos();
  client.destroy().finally(() => process.exit(0));
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('unhandledRejection', (e) => erro('Promessa rejeitada sem tratamento:', e));

client.login(token).catch((e) => {
  erro(
    e.code === 'TokenInvalid'
      ? 'Token inválido. Gere um novo no Developer Portal (Bot → Reset Token) e atualize o .env.'
      : `Falha ao conectar no Discord: ${e.message}`,
  );
  process.exit(1);
});

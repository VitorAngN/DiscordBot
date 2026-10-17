import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { erro } from './log.js';
import { criarBiblioteca } from './midia.js';
import { ID, montarPainel } from './painel.js';
import * as player from './player.js';

const PASSO_VOLUME = 10;

const biblioteca = criarBiblioteca();

export const definicoes = [
  new SlashCommandBuilder().setName('painel').setDescription('Mostra o painel de mídia com botões'),
  new SlashCommandBuilder().setName('entrar').setDescription('Coloca o bot no seu canal de voz'),
  new SlashCommandBuilder()
    .setName('tocar')
    .setDescription('Toca um arquivo da pasta de mídia')
    .addStringOption((o) =>
      o.setName('arquivo').setDescription('Nome do arquivo').setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder().setName('parar').setDescription('Para o que está tocando'),
  new SlashCommandBuilder().setName('sair').setDescription('Tira o bot do canal de voz'),
].map((c) => c.toJSON());

/** Erro causado por quem usou o comando: vira uma resposta privada, sem log. */
class ErroUsuario extends Error {}

// Última mensagem de painel por servidor, atualizada quando o player muda
const paineis = new Map();
const ultimoEstado = new Map();

function painelDe(guildId) {
  return montarPainel(player.estado(guildId), biblioteca.buscar(), biblioteca.listar().length);
}

function lembrarPainel(guildId, mensagem) {
  paineis.set(guildId, mensagem);
  ultimoEstado.set(guildId, JSON.stringify(player.estado(guildId)));
}

player.eventos.on('mudou', async (guildId) => {
  const mensagem = paineis.get(guildId);
  if (!mensagem) return;
  const chave = JSON.stringify(player.estado(guildId));
  if (ultimoEstado.get(guildId) === chave) return;
  ultimoEstado.set(guildId, chave);
  try {
    await mensagem.edit(painelDe(guildId));
  } catch {
    paineis.delete(guildId); // a mensagem foi apagada
  }
});

function canalDoMembro(interaction) {
  const canal = interaction.member?.voice?.channel;
  if (!canal) throw new ErroUsuario('Entre em um canal de voz primeiro.');
  if (!canal.joinable) throw new ErroUsuario(`Não tenho permissão para entrar em ${canal}.`);
  if (canal.speakable === false) throw new ErroUsuario(`Não tenho permissão para falar em ${canal}.`);
  return canal;
}

function arquivoPorNome(nome) {
  const caminho = biblioteca.resolver(nome);
  if (!caminho) throw new ErroUsuario(`Não achei "${nome}" na pasta de mídia.`);
  return caminho;
}

async function autocompletar(interaction) {
  const termo = interaction.options.getFocused();
  await interaction.respond(biblioteca.buscar(termo).map((n) => ({ name: n, value: n })));
}

async function executarComando(interaction) {
  const { guildId } = interaction;
  const privado = MessageFlags.Ephemeral;

  switch (interaction.commandName) {
    case 'painel': {
      await interaction.reply(painelDe(guildId));
      lembrarPainel(guildId, await interaction.fetchReply());
      return;
    }
    case 'entrar': {
      const canal = canalDoMembro(interaction);
      await interaction.deferReply({ flags: privado });
      await player.entrar(canal);
      await interaction.editReply(`Entrei em ${canal}.`);
      return;
    }
    case 'tocar': {
      // Valida tudo antes de responder, para erros saírem só para quem pediu
      const nome = interaction.options.getString('arquivo', true);
      const caminho = arquivoPorNome(nome);
      const canal = player.estado(guildId).conectado ? null : canalDoMembro(interaction);
      await interaction.deferReply();
      if (canal) await player.entrar(canal);
      player.tocar(guildId, caminho, nome);
      await interaction.editReply(`▶️ Tocando **${nome}**`);
      return;
    }
    case 'parar': {
      const parou = player.parar(guildId);
      await interaction.reply({ content: parou ? '⏹️ Parei.' : 'Não estou tocando nada.', flags: privado });
      return;
    }
    case 'sair': {
      const saiu = player.sair(guildId);
      await interaction.reply({ content: saiu ? '👋 Saí da call.' : 'Não estou em nenhuma call.', flags: privado });
      return;
    }
  }
}

async function usarPainel(interaction) {
  const { guildId, customId } = interaction;

  // Validações antes do deferUpdate, para erros saírem como resposta privada
  let canal = null;
  let arquivo = null;
  if (customId === ID.entrar) canal = canalDoMembro(interaction);
  if (customId === ID.arquivo) {
    const nome = interaction.values[0];
    arquivo = { nome, caminho: arquivoPorNome(nome) };
    if (!player.estado(guildId).conectado) canal = canalDoMembro(interaction);
  }

  await interaction.deferUpdate();
  switch (customId) {
    case ID.entrar:
      await player.entrar(canal);
      break;
    case ID.arquivo:
      if (canal) await player.entrar(canal);
      player.tocar(guildId, arquivo.caminho, arquivo.nome);
      break;
    case ID.pausa:
      player.alternarPausa(guildId);
      break;
    case ID.parar:
      player.parar(guildId);
      break;
    case ID.sair:
      player.sair(guildId);
      break;
    case ID.volumeMenos:
      player.ajustarVolume(guildId, -PASSO_VOLUME);
      break;
    case ID.volumeMais:
      player.ajustarVolume(guildId, PASSO_VOLUME);
      break;
    case ID.atualizar:
      break;
  }
  await interaction.editReply(painelDe(guildId));
  lembrarPainel(guildId, interaction.message);
}

async function responderErro(interaction, e) {
  if (interaction.isAutocomplete()) return;
  const esperado = e instanceof ErroUsuario;
  if (!esperado) erro('Falha ao tratar interação:', e);
  const content = esperado ? `⚠️ ${e.message}` : `❌ ${e.message || 'Algo deu errado.'} Veja o terminal do bot.`;
  try {
    if (interaction.isChatInputCommand() && interaction.deferred && !interaction.replied) {
      await interaction.editReply(content);
    } else if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch {
    // A interação expirou; o erro já foi registrado no terminal
  }
}

export async function tratarInteracao(interaction) {
  if (!interaction.inCachedGuild()) return;
  try {
    if (interaction.isAutocomplete()) await autocompletar(interaction);
    else if (interaction.isChatInputCommand()) await executarComando(interaction);
    else if (interaction.isMessageComponent() && interaction.customId.startsWith('painel:')) {
      await usarPainel(interaction);
    }
  } catch (e) {
    await responderErro(interaction, e);
  }
}

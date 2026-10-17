import { EventEmitter } from 'node:events';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { erro, log } from './log.js';

export const VOLUME_PADRAO = 50;
export const VOLUME_MAX = 150;

/** Emite `mudou` (guildId) quando a conexão ou o estado do player mudam. */
export const eventos = new EventEmitter();

/** Uma sessão por servidor: conexão de voz + player. */
const sessoes = new Map();
/** Volume (%) por servidor; sobrevive a sair e entrar de novo na call. */
const volumes = new Map();

function destruir(conexao) {
  if (conexao.state.status !== VoiceConnectionStatus.Destroyed) conexao.destroy();
}

function criarSessao(guildId, conexao) {
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  const sessao = { conexao, player, canal: null };
  conexao.subscribe(player);

  conexao.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      // Troca de servidor de voz pelo Discord: a conexão se recupera sozinha
      await Promise.race([
        entersState(conexao, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conexao, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      // Removido do canal ou queda definitiva
      destruir(conexao);
    }
  });
  conexao.on(VoiceConnectionStatus.Destroyed, () => {
    player.stop(true);
    if (sessoes.get(guildId) === sessao) sessoes.delete(guildId);
    eventos.emit('mudou', guildId);
  });
  conexao.on('error', (e) => erro('Conexão de voz:', e.message));

  player.on('stateChange', (antes, depois) => {
    if (antes.status !== depois.status) eventos.emit('mudou', guildId);
  });
  player.on('error', (e) => erro(`Falha ao tocar "${e.resource.metadata?.nome}":`, e.message));

  return sessao;
}

/** Conecta (ou move) o bot para o canal de voz e espera a conexão ficar pronta. */
export async function entrar(canal) {
  const guildId = canal.guild.id;
  // Se já existe conexão neste servidor, o joinVoiceChannel reaproveita e move
  const conexao = joinVoiceChannel({
    channelId: canal.id,
    guildId,
    adapterCreator: canal.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  let sessao = sessoes.get(guildId);
  if (sessao?.conexao !== conexao) {
    sessao = criarSessao(guildId, conexao);
    sessoes.set(guildId, sessao);
  }
  sessao.canal = canal;

  try {
    await entersState(conexao, VoiceConnectionStatus.Ready, 20_000);
  } catch (e) {
    destruir(conexao);
    throw new Error('Não consegui conectar ao canal de voz a tempo.', { cause: e });
  }
  log(`Conectado em #${canal.name} (${canal.guild.name}).`);
  eventos.emit('mudou', guildId);
  return sessao;
}

export function tocar(guildId, caminho, nome) {
  const sessao = sessoes.get(guildId);
  if (!sessao) throw new Error('O bot não está em um canal de voz.');
  const recurso = createAudioResource(caminho, { inlineVolume: true, metadata: { nome } });
  recurso.volume.setVolume(volumeDe(guildId) / 100);
  sessao.player.play(recurso);
  log(`Tocando "${nome}" em #${sessao.canal.name}.`);
}

/** Pausa ou retoma. Retorna `false` se não houver nada tocando. */
export function alternarPausa(guildId) {
  const player = sessoes.get(guildId)?.player;
  if (!player) return false;
  if (player.state.status === AudioPlayerStatus.Paused) return player.unpause();
  return player.pause();
}

export function parar(guildId) {
  return sessoes.get(guildId)?.player.stop() ?? false;
}

export function sair(guildId) {
  const sessao = sessoes.get(guildId);
  if (!sessao) return false;
  destruir(sessao.conexao);
  return true;
}

export function sairDeTodos() {
  for (const sessao of sessoes.values()) destruir(sessao.conexao);
}

function volumeDe(guildId) {
  return volumes.get(guildId) ?? VOLUME_PADRAO;
}

/** Soma `delta` pontos percentuais ao volume e aplica na faixa atual. */
export function ajustarVolume(guildId, delta) {
  const volume = Math.min(VOLUME_MAX, Math.max(0, volumeDe(guildId) + delta));
  volumes.set(guildId, volume);
  const estadoPlayer = sessoes.get(guildId)?.player.state;
  estadoPlayer?.resource?.volume?.setVolume(volume / 100);
  eventos.emit('mudou', guildId);
  return volume;
}

/** Resumo para exibir: `status` é `tocando`, `pausado` ou `parado`. */
export function estado(guildId) {
  const sessao = sessoes.get(guildId);
  const volume = volumeDe(guildId);
  if (!sessao) return { conectado: false, canal: null, faixa: null, status: 'parado', volume };

  const { status, resource } = sessao.player.state;
  if (status === AudioPlayerStatus.Idle) {
    return { conectado: true, canal: sessao.canal.name, faixa: null, status: 'parado', volume };
  }
  const pausado = status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused;
  return {
    conectado: true,
    canal: sessao.canal.name,
    faixa: resource.metadata?.nome ?? null,
    status: pausado ? 'pausado' : 'tocando',
    volume,
  };
}

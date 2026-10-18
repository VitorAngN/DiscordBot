// Ponte com o app do Windows. Dentro do app (WebView2), o navegador captura só a imagem da janela;
// o app captura o som apenas do programa dono dela (ou tudo menos o Discord) e manda para cá.
import { pcmParaFloat32 } from './fila-audio.js';

const webview = globalThis.chrome?.webview;

/** A página está aberta dentro do app do Windows. */
export const dentroDoApp = Boolean(webview);

/**
 * O app (0.4.0 em diante) diz o que sabe fazer em `window.transmissorApp.recursos`. Apps mais
 * antigos não dizem nada, e a página faz como antes (por exemplo, guarda a chave no navegador).
 */
const recursosDoApp = dentroDoApp ? (globalThis.transmissorApp?.recursos ?? []) : [];

/** O app guarda a chave de transmissão protegida pelo Windows. */
export const appGuardaChave = recursosDoApp.includes('chave');

/** O app tem ícone na bandeja e atalho de encerrar: precisa saber se está ao vivo e manda comandos. */
export const appTemBandeja = recursosDoApp.includes('bandeja');

const TEMPO_RESPOSTA_MS = 15_000;
const TEMPO_RESPOSTA_CHAVE_MS = 3_000;

let contexto = null;
let no = null;
let esperando = null;
let esperandoChave = null;
let aoParar = null;
let aoComando = null;

webview?.addEventListener('message', (evento) => {
  const mensagem = evento.data;
  switch (mensagem?.tipo) {
    case 'audio': {
      if (!no) return;
      const amostras = pcmParaFloat32(mensagem.pcm);
      no.port.postMessage(amostras, [amostras.buffer]);
      break;
    }
    case 'audio-pronto':
      esperando?.resolve(mensagem);
      break;
    case 'audio-erro':
      esperando?.reject(new Error(mensagem.mensagem ?? 'O app não conseguiu capturar o som.'));
      break;
    case 'audio-parou':
      aoParar?.(mensagem.mensagem ?? 'A captura de som parou.');
      break;
    case 'chave':
      esperandoChave?.(typeof mensagem.chave === 'string' ? mensagem.chave : null);
      break;
    case 'comando':
      aoComando?.(mensagem.comando);
      break;
  }
});

/** Conta ao app se está ao vivo e quantos assistem, para o ícone da bandeja. */
export function contarEstadoAoApp(aoVivo, espectadores = 0) {
  if (appTemBandeja) webview.postMessage({ tipo: 'estado', aoVivo, espectadores });
}

/**
 * Comandos da bandeja e do atalho: "encerrar" ou "mostrar-trocar" (escolher outra janela precisa
 * de um clique na página, então o app só traz a janela para a frente).
 * @param {(comando: string) => void} acao
 */
export function quandoOAppPedir(acao) {
  aoComando = acao;
}

/** A chave de transmissão que o app guardou (protegida pelo Windows), ou `null`. */
export function lerChaveDoApp() {
  if (!appGuardaChave) return Promise.resolve(null);
  return new Promise((resolve) => {
    const tempo = setTimeout(() => resolve(null), TEMPO_RESPOSTA_CHAVE_MS);
    esperandoChave = (chave) => (clearTimeout(tempo), resolve(chave));
    webview.postMessage({ tipo: 'chave-ler' });
  }).finally(() => (esperandoChave = null));
}

/** O app guarda a chave neste PC, protegida pelo Windows (DPAPI). */
export function guardarChaveNoApp(chave) {
  if (appGuardaChave) webview.postMessage({ tipo: 'chave-guardar', chave });
}

export function esquecerChaveNoApp() {
  if (appGuardaChave) webview.postMessage({ tipo: 'chave-esquecer' });
}

/**
 * Cria o contexto de áudio. Chame logo no clique de quem transmite: sem um clique, o navegador
 * pode deixar o áudio pausado.
 */
export function prepararAudio() {
  contexto = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
  return contexto.resume();
}

/**
 * Pede ao app o som do programa da janela capturada e devolve a faixa para enviar.
 * @param {string} rotulo rótulo da faixa de vídeo (no Chromium, "window:<janela>:0")
 * @param {'jogo' | 'sem-discord'} modo
 * @param {(motivo: string) => void} quandoParar
 */
export async function iniciarAudio(rotulo, modo, quandoParar) {
  if (!contexto) prepararAudio();
  await contexto.audioWorklet.addModule('/js/ponte-audio.worklet.js');
  no = new AudioWorkletNode(contexto, 'ponte-de-audio', { numberOfInputs: 0, outputChannelCount: [2] });
  const destino = contexto.createMediaStreamDestination();
  no.connect(destino);
  aoParar = quandoParar;

  const programa = await pedirSom(rotulo, modo);
  return { faixa: destino.stream.getAudioTracks()[0], programa };
}

/**
 * Troca de onde vem o som (outra janela ou outro modo) sem mexer na faixa que já está no ar.
 * @param {string} rotulo
 * @param {'jogo' | 'sem-discord'} modo
 * @returns {Promise<string>} o programa de onde o som passa a vir
 */
export function trocarSom(rotulo, modo) {
  return pedirSom(rotulo, modo);
}

function pedirSom(rotulo, modo) {
  return new Promise((resolve, reject) => {
    const tempo = setTimeout(() => reject(new Error('O app não respondeu sobre o som.')), TEMPO_RESPOSTA_MS);
    esperando = {
      resolve: (resposta) => (clearTimeout(tempo), resolve(resposta.programa)),
      reject: (erro) => (clearTimeout(tempo), reject(erro)),
    };
    webview.postMessage({ tipo: 'iniciar-audio', rotulo, modo });
  }).finally(() => (esperando = null));
}

export function pararAudio() {
  if (!webview) return;
  webview.postMessage({ tipo: 'parar-audio' });
  no?.disconnect();
  contexto?.close();
  no = null;
  contexto = null;
  aoParar = null;
}

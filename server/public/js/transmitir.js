import {
  appGuardaChave,
  contarEstadoAoApp,
  dentroDoApp,
  esquecerChaveNoApp,
  guardarChaveNoApp,
  iniciarAudio,
  lerChaveDoApp,
  pararAudio,
  prepararAudio,
  quandoOAppPedir,
  trocarSom,
} from './ponte-app.js';
import { QUALIDADE_PADRAO, QUALIDADES, TAXA_AUDIO, qualidadeValida, taxaPorEspectador } from './qualidade.js';
import { opusEstereo } from './sdp.js';
import { configurarTela } from './tela.js';
import { aguardarCandidatos, aguardarConexao, api, novaConexao } from './webrtc.js';

const CHAVE_SALVA = 'discordbot:chave';
const QUALIDADE_SALVA = 'discordbot:qualidade';
const NOME_SALVO = 'discordbot:nome';
const AVISAR_SALVO = 'discordbot:avisar';
/** Sinal de vida para o servidor: sem ele por 2 minutos, a sala encerra sozinha. */
const INTERVALO_DE_SINAL_MS = 20_000;

const TEXTO_DO_AVISO = {
  publicado: 'Aviso postado no Discord.',
  desligado: 'Aviso no Discord desligado: mande o link você mesmo.',
  'nao-configurado': 'O servidor não tem o bot configurado para avisar no Discord: mande o link você mesmo.',
  falhou: 'Não deu para postar o aviso no Discord: mande o link você mesmo.',
};

function lerSalvo(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function salvar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Só não lembra
  }
}

const $ = (id) => document.getElementById(id);
const elementos = {
  formulario: $('formulario'),
  chave: $('chave'),
  campoChave: $('campoChave'),
  lembrar: $('lembrar'),
  campoLembrar: $('campoLembrar'),
  chaveSalva: $('chaveSalva'),
  trocarChave: $('trocarChave'),
  titulo: $('titulo'),
  nome: $('nome'),
  avisar: $('avisar'),
  iniciar: $('iniciar'),
  aoVivo: $('aoVivo'),
  link: $('link'),
  copiar: $('copiar'),
  parar: $('parar'),
  trocar: $('trocar'),
  status: $('status'),
  selo: $('selo'),
  previa: $('previa'),
  uso: $('uso'),
  espectadores: $('espectadores'),
  qualidade: $('qualidade'),
  dicaQualidade: $('dicaQualidade'),
  tituloPagina: $('tituloPagina'),
  subtitulo: $('subtitulo'),
  campoSom: $('campoSom'),
  modoSom: $('modoSom'),
  campoSomAoVivo: $('campoSomAoVivo'),
  modoSomAoVivo: $('modoSomAoVivo'),
  dicaNavegador: $('dicaNavegador'),
  palco: $('palco'),
  barraDaPrevia: $('barraDaPrevia'),
};

configurarTela({ palco: $('palco'), video: elementos.previa, telaCheia: $('telaCheia'), flutuante: $('flutuante') });

/**
 * Transmissão atual: { sala, token, pc, midia, qualidade, enviaVideo, enviaAudio, programa, relogioDeUso }.
 * `midia` é o que está sendo capturado agora; muda ao trocar de janela.
 */
let atual = null;

/** Dentro do app, o som vem do app (só o jogo), não do navegador. */
function configurarModoApp() {
  document.documentElement.classList.add('no-app');
  document.title = 'Transmitir';
  elementos.tituloPagina.textContent = 'Transmitir';
  elementos.subtitulo.textContent = 'Escolha a janela do jogo. O som vem só desse programa: a call do Discord não entra.';
  elementos.campoSom.hidden = false;
  elementos.campoSomAoVivo.hidden = false;
  elementos.dicaNavegador.hidden = true;
  elementos.iniciar.textContent = 'Escolher a janela do jogo';
  elementos.trocar.textContent = '🔄 Trocar janela';
  mostrarPrevia(false);
}

/** No app, a prévia só aparece ao vivo: antes disso seria só um quadro preto ocupando a janela. */
function mostrarPrevia(visivel) {
  elementos.palco.hidden = !visivel;
  elementos.barraDaPrevia.hidden = !visivel;
}

const emGb = (bytes) => (bytes / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Mostra quanto da cota grátis já foi usado (estimativa do servidor). */
async function atualizarUso(chave) {
  try {
    const { usado, limite, janelaDias } = await api('/api/uso', { token: chave });
    elementos.uso.textContent = `Uso estimado nos últimos ${janelaDias} dias: ${emGb(usado)} GB de ${emGb(limite)} GB (trava de uso).`;
  } catch {
    elementos.uso.textContent = '';
  }
}

function mostrarStatus(texto, tipo = 'info') {
  elementos.status.textContent = texto;
  elementos.status.dataset.tipo = tipo;
}

function mostrarSelo(estado, texto) {
  elementos.selo.dataset.estado = estado;
  elementos.selo.textContent = texto;
}

function lerChaveSalva() {
  try {
    return localStorage.getItem(CHAVE_SALVA);
  } catch {
    return null;
  }
}

function guardarChave(chave) {
  if (appGuardaChave) return; // o app guarda, protegida, depois que a chave funcionar
  try {
    if (elementos.lembrar.checked) localStorage.setItem(CHAVE_SALVA, chave);
    else localStorage.removeItem(CHAVE_SALVA);
  } catch {
    // Armazenamento bloqueado: só não lembra
  }
}

/** Com a chave guardada pelo app, o campo some e fica só o aviso de que ela está salva. */
function mostrarChaveSalva(salva) {
  elementos.campoChave.hidden = salva;
  elementos.chave.required = !salva;
  elementos.chaveSalva.hidden = !salva;
}

/** Busca a chave que o app guardou. A que versões antigas guardavam no navegador passa para o app. */
async function carregarChaveDoApp() {
  elementos.campoLembrar.hidden = true; // o app sempre guarda, protegida pelo Windows
  let chave = await lerChaveDoApp();
  const antiga = lerChaveSalva();
  if (antiga) {
    if (!chave) {
      chave = antiga;
      guardarChaveNoApp(antiga);
    }
    try {
      localStorage.removeItem(CHAVE_SALVA);
    } catch {
      // Nada a limpar
    }
  }
  if (chave && !atual) {
    elementos.chave.value = chave;
    mostrarChaveSalva(true);
  }
}

function esquecerChave() {
  esquecerChaveNoApp();
  elementos.chave.value = '';
  mostrarChaveSalva(false);
}

function montarQualidades() {
  for (const [id, q] of Object.entries(QUALIDADES)) {
    const mbps = (q.taxaVideo / 1e6).toLocaleString('pt-BR');
    elementos.qualidade.add(new Option(`${q.nome} (até ${mbps} Mbps)`, id));
  }
  let salva = null;
  try {
    salva = localStorage.getItem(QUALIDADE_SALVA);
  } catch {
    // Sem armazenamento: usa a padrão
  }
  elementos.qualidade.value = salva && qualidadeValida(salva) ? salva : QUALIDADE_PADRAO;
  mostrarDicaDeQualidade();
}

/** Quanto cada amigo assistindo gasta da cota grátis por hora, nessa qualidade. */
function mostrarDicaDeQualidade() {
  const gbPorHora = ((taxaPorEspectador(elementos.qualidade.value) / 8) * 3600) / 1e9;
  elementos.dicaQualidade.textContent = `Cada amigo assistindo gasta até ~${gbPorHora.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB da cota grátis por hora. Mais qualidade também pede mais upload da sua internet.`;
}

/** Abre o seletor do navegador. Devolve `null` se a pessoa cancelar. */
async function capturarTela(qualidade) {
  try {
    const midia = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { max: qualidade.largura },
        height: { max: qualidade.altura },
        frameRate: { ideal: qualidade.fps, max: qualidade.fps },
        ...(dentroDoApp && { displaySurface: 'window' }),
      },
      // No app, o som do navegador fica de fora: quem captura é o app, sem o Discord.
      // No navegador, só o som de uma aba: o do PC inteiro levaria junto a call do Discord.
      audio: dentroDoApp ? false : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'exclude',
      selfBrowserSurface: 'exclude',
    });
    midia.getVideoTracks()[0].contentHint = 'motion'; // prioriza fluidez, como em jogo
    return midia;
  } catch {
    return null;
  }
}

/** Se o navegador capturou maior que o teto (ex.: monitor 4K), quanto reduzir no envio. */
function reducaoPara(video, qualidade) {
  const { width = qualidade.largura, height = qualidade.altura } = video.getSettings();
  return Math.max(1, width / qualidade.largura, height / qualidade.altura);
}

/** Termina a transmissão se a pessoa parar de compartilhar a janela que está no ar. */
function vigiarFim(video) {
  video.addEventListener('ended', () => {
    if (atual?.midia.getVideoTracks()[0] === video) encerrar();
  });
}

function mostrarAoVivo() {
  const { qualidade, programa, enviaAudio, situacaoDoAviso } = atual;
  let texto;
  if (programa) texto = `Ao vivo em ${qualidade.nome}, com o som de: ${programa}.`;
  else if (enviaAudio?.track) texto = `Ao vivo com vídeo e som, em ${qualidade.nome}.`;
  else texto = `Ao vivo em ${qualidade.nome}, mas sem som: para ter som, compartilhe uma aba com o som ligado.`;
  const aviso = TEXTO_DO_AVISO[situacaoDoAviso];
  mostrarStatus(aviso ? `${texto} ${aviso}` : texto);
}

/** "Ninguém assistindo ainda", "1 pessoa assistindo", "3 pessoas assistindo". */
function mostrarEspectadores(quantos) {
  const texto = quantos === 0 ? 'Ninguém assistindo ainda' : `${quantos} ${quantos === 1 ? 'pessoa' : 'pessoas'} assistindo`;
  elementos.espectadores.textContent = `👀 ${texto}`;
  contarEstadoAoApp(true, quantos);
}

/**
 * Manda o sinal de vida e, com a resposta, atualiza quantos estão assistindo. Se o servidor já
 * tiver encerrado a sala, encerra aqui também.
 */
function vigiarSinal(sala, token) {
  return setInterval(async () => {
    try {
      const resposta = await api(`/api/salas/${sala}/sinal`, { metodo: 'POST', token });
      if (atual?.sala === sala && Number.isInteger(resposta?.espectadores)) mostrarEspectadores(resposta.espectadores);
    } catch (erro) {
      if (erro.status === 410 && atual?.sala === sala) {
        mostrarStatus('O servidor encerrou a transmissão: ficou mais de 2 minutos sem sinal deste PC.', 'erro');
        encerrar({ manterStatus: true });
      }
    }
  }, INTERVALO_DE_SINAL_MS);
}

async function iniciar() {
  const chave = elementos.chave.value.trim();
  guardarChave(chave);
  const idQualidade = elementos.qualidade.value;
  const qualidade = QUALIDADES[idQualidade];
  try {
    localStorage.setItem(QUALIDADE_SALVA, idQualidade);
  } catch {
    // Só não lembra
  }
  elementos.iniciar.disabled = true;
  mostrarStatus(dentroDoApp ? 'Escolha a janela do jogo…' : 'Escolha a janela ou aba para transmitir…');
  // Ainda no clique: sem ele, o áudio que vem do app pode ficar pausado
  if (dentroDoApp) prepararAudio();

  const midia = await capturarTela(qualidade);
  if (!midia) {
    if (dentroDoApp) pararAudio();
    elementos.iniciar.disabled = false;
    mostrarStatus('Nada foi escolhido para transmitir.');
    return;
  }

  const [video] = midia.getVideoTracks();
  let [audio] = midia.getAudioTracks();
  elementos.previa.srcObject = midia;
  mostrarPrevia(true);
  atual = { sala: null, token: null, pc: null, midia, qualidade, programa: null };

  try {
    if (dentroDoApp) {
      mostrarStatus('Preparando o som do jogo…');
      elementos.modoSomAoVivo.value = elementos.modoSom.value;
      const quandoParar = (motivo) => mostrarStatus(`${motivo} Use "Trocar janela" para tentar de novo.`, 'erro');
      ({ faixa: audio, programa: atual.programa } = await iniciarAudio(video.label, elementos.modoSom.value, quandoParar));
    }

    mostrarStatus('Criando a sala…');
    const titulo = elementos.titulo.value.trim();
    const nome = elementos.nome.value.trim();
    const avisar = elementos.avisar.checked;
    salvar(NOME_SALVO, nome);
    salvar(AVISAR_SALVO, avisar ? 'sim' : 'nao');
    const { sala, link, token } = await api('/api/salas', {
      metodo: 'POST',
      token: chave,
      corpo: { titulo, qualidade: idQualidade, nome, avisar },
    });
    if (appGuardaChave) {
      guardarChaveNoApp(chave);
      mostrarChaveSalva(true);
    }
    const pc = novaConexao();
    Object.assign(atual, { sala, token, pc });

    const faixas = [];
    const transceptorDeVideo = pc.addTransceiver(video, {
      direction: 'sendonly',
      sendEncodings: [
        { maxBitrate: qualidade.taxaVideo, maxFramerate: qualidade.fps, scaleResolutionDownBy: reducaoPara(video, qualidade) },
      ],
    });
    faixas.push({ trackName: 'video', transceptor: transceptorDeVideo });
    atual.enviaVideo = transceptorDeVideo.sender;
    if (audio) {
      const transceptorDeAudio = pc.addTransceiver(audio, { direction: 'sendonly' });
      faixas.push({ trackName: 'audio', transceptor: transceptorDeAudio });
      atual.enviaAudio = transceptorDeAudio.sender;
    }

    await pc.setLocalDescription(await pc.createOffer());
    await aguardarCandidatos(pc);

    mostrarStatus('Conectando ao servidor de vídeo…');
    const { sessionDescription } = await api(`/api/salas/${sala}/publicar`, {
      metodo: 'POST',
      token,
      corpo: {
        sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
        tracks: faixas.map((f) => ({ mid: f.transceptor.mid, trackName: f.trackName })),
      },
    });
    // Estéreo no envio: o codificador segue o que a resposta do SFU pede
    await pc.setRemoteDescription({ type: 'answer', sdp: opusEstereo(sessionDescription.sdp, TAXA_AUDIO) });
    await aguardarConexao(pc);
    mostrarStatus(avisar ? 'Ficando ao vivo e avisando no Discord…' : 'Ficando ao vivo…');
    ({ discord: atual.situacaoDoAviso } = await api(`/api/salas/${sala}/ao-vivo`, { metodo: 'POST', token }));
    atual.relogioDeSinal = vigiarSinal(sala, token);

    elementos.link.textContent = link;
    mostrarEspectadores(0);
    atualizarUso(chave);
    atual.relogioDeUso = setInterval(() => atualizarUso(chave), 60_000);
    elementos.aoVivo.hidden = false;
    elementos.formulario.hidden = true;
    mostrarSelo('ao-vivo', '● AO VIVO');
    mostrarAoVivo();

    vigiarFim(video);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') mostrarStatus('A conexão com o servidor de vídeo caiu. Encerre e comece de novo.', 'erro');
    });
  } catch (erro) {
    // Chave errada: o app esquece a que tinha guardado e o campo volta
    if (erro.status === 401 && appGuardaChave) esquecerChave();
    mostrarStatus(`Não deu para transmitir: ${erro.message}`, 'erro');
    await encerrar({ manterStatus: true });
  }
}

/**
 * Troca a janela (ou aba) no ar, sem derrubar a sala: só a imagem que sai é substituída,
 * e quem assiste nem precisa recarregar. No app, o som passa a vir do programa da nova janela.
 */
async function trocarJanela() {
  if (!atual?.enviaVideo) return;
  const transmissao = atual;
  elementos.trocar.disabled = true;
  try {
    const nova = await capturarTela(transmissao.qualidade);
    if (!nova || atual !== transmissao) {
      nova?.getTracks().forEach((t) => t.stop());
      mostrarAoVivo();
      return;
    }
    const [video] = nova.getVideoTracks();
    const [audio] = nova.getAudioTracks();

    await transmissao.enviaVideo.replaceTrack(video);
    const parametros = transmissao.enviaVideo.getParameters();
    if (parametros.encodings?.[0]) {
      parametros.encodings[0].scaleResolutionDownBy = reducaoPara(video, transmissao.qualidade);
      await transmissao.enviaVideo.setParameters(parametros);
    }

    if (dentroDoApp) {
      mostrarStatus('Trocando o som para o programa da nova janela…');
      transmissao.programa = await trocarSom(video.label, elementos.modoSomAoVivo.value);
    } else if (audio && transmissao.enviaAudio) {
      await transmissao.enviaAudio.replaceTrack(audio);
    }

    const antiga = transmissao.midia;
    transmissao.midia = nova;
    antiga.getTracks().forEach((t) => t.stop());
    elementos.previa.srcObject = nova;
    vigiarFim(video);

    if (!dentroDoApp && !transmissao.enviaAudio && audio) {
      mostrarStatus('Janela trocada. O som da nova aba só entra se a transmissão já começou com som: encerre e comece de novo.');
    } else {
      mostrarAoVivo();
    }
  } catch (erro) {
    mostrarStatus(`Não deu para trocar: ${erro.message}`, 'erro');
  } finally {
    elementos.trocar.disabled = false;
  }
}

/** No app: troca o modo do som (só o jogo ou tudo menos o Discord) sem parar. */
async function trocarModoDeSom() {
  if (!dentroDoApp || !atual?.enviaVideo) return;
  const video = atual.midia.getVideoTracks()[0];
  try {
    mostrarStatus('Trocando o som…');
    atual.programa = await trocarSom(video.label, elementos.modoSomAoVivo.value);
    mostrarAoVivo();
  } catch (erro) {
    mostrarStatus(`Não deu para trocar o som: ${erro.message}`, 'erro');
  }
}

async function encerrar({ manterStatus = false } = {}) {
  const transmissao = atual;
  atual = null;
  if (transmissao) {
    clearInterval(transmissao.relogioDeUso);
    clearInterval(transmissao.relogioDeSinal);
    transmissao.midia.getTracks().forEach((t) => t.stop());
    if (dentroDoApp) pararAudio();
    transmissao.pc?.close();
    if (transmissao.sala) {
      await api(`/api/salas/${transmissao.sala}`, { metodo: 'DELETE', token: transmissao.token }).catch(() => {});
    }
  }
  elementos.previa.srcObject = null;
  if (dentroDoApp) mostrarPrevia(false);
  elementos.aoVivo.hidden = true;
  elementos.formulario.hidden = false;
  elementos.iniciar.disabled = false;
  mostrarSelo('parado', 'Parado');
  contarEstadoAoApp(false);
  if (!manterStatus) mostrarStatus('Transmissão encerrada.');
}

elementos.formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();
  iniciar();
});
elementos.parar.addEventListener('click', () => encerrar());
elementos.trocar.addEventListener('click', () => trocarJanela());
elementos.modoSomAoVivo.addEventListener('change', () => trocarModoDeSom());
elementos.copiar.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elementos.link.textContent);
  elementos.copiar.textContent = 'Copiado!';
  setTimeout(() => (elementos.copiar.textContent = 'Copiar'), 1500);
});
// Fechar a aba encerra a sala (melhor esforço; ela expira sozinha de qualquer jeito)
window.addEventListener('pagehide', () => {
  if (!atual?.sala) return;
  fetch(`/api/salas/${atual.sala}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${atual.token}` },
    keepalive: true,
  });
});

if (dentroDoApp) configurarModoApp();
quandoOAppPedir((comando) => {
  if (!atual?.sala) return;
  if (comando === 'encerrar') {
    encerrar({ manterStatus: true });
    mostrarStatus('Transmissão encerrada pelo atalho ou pelo ícone da bandeja.');
  } else if (comando === 'mostrar-trocar') {
    elementos.trocar.focus();
    mostrarStatus('Clique em "Trocar janela" para escolher a nova janela.');
  }
});
montarQualidades();
elementos.qualidade.addEventListener('change', mostrarDicaDeQualidade);

if (appGuardaChave) {
  carregarChaveDoApp();
  elementos.trocarChave.addEventListener('click', () => {
    esquecerChave();
    elementos.chave.focus();
  });
} else {
  const salva = lerChaveSalva();
  if (salva) {
    elementos.chave.value = salva;
    elementos.lembrar.checked = true;
  }
}
elementos.nome.value = lerSalvo(NOME_SALVO) ?? '';
elementos.avisar.checked = lerSalvo(AVISAR_SALVO) !== 'nao';

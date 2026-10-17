import { QUALIDADE_PADRAO, QUALIDADES, TAXA_AUDIO, qualidadeValida, taxaPorEspectador } from './qualidade.js';
import { opusEstereo } from './sdp.js';
import { aguardarCandidatos, aguardarConexao, api, novaConexao } from './webrtc.js';

const CHAVE_SALVA = 'discordbot:chave';
const QUALIDADE_SALVA = 'discordbot:qualidade';

const $ = (id) => document.getElementById(id);
const elementos = {
  formulario: $('formulario'),
  chave: $('chave'),
  lembrar: $('lembrar'),
  titulo: $('titulo'),
  iniciar: $('iniciar'),
  aoVivo: $('aoVivo'),
  link: $('link'),
  copiar: $('copiar'),
  parar: $('parar'),
  status: $('status'),
  selo: $('selo'),
  previa: $('previa'),
  uso: $('uso'),
  qualidade: $('qualidade'),
  dicaQualidade: $('dicaQualidade'),
};

/** Transmissão atual: { sala, token, pc, midia, relogioDeUso } */
let atual = null;

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
  try {
    if (elementos.lembrar.checked) localStorage.setItem(CHAVE_SALVA, chave);
    else localStorage.removeItem(CHAVE_SALVA);
  } catch {
    // Armazenamento bloqueado: só não lembra
  }
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
  mostrarStatus('Escolha a janela ou aba para transmitir…');

  let midia;
  try {
    midia = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { max: qualidade.largura },
        height: { max: qualidade.altura },
        frameRate: { ideal: qualidade.fps, max: qualidade.fps },
      },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
    });
  } catch {
    elementos.iniciar.disabled = false;
    mostrarStatus('Nada foi escolhido para transmitir.');
    return;
  }

  const [video] = midia.getVideoTracks();
  const [audio] = midia.getAudioTracks();
  video.contentHint = 'motion'; // prioriza fluidez, como em jogo
  elementos.previa.srcObject = midia;
  atual = { sala: null, token: null, pc: null, midia };

  try {
    mostrarStatus('Criando a sala…');
    const titulo = elementos.titulo.value.trim();
    const { sala, link, token } = await api('/api/salas', {
      metodo: 'POST',
      token: chave,
      corpo: { titulo, qualidade: idQualidade },
    });
    const pc = novaConexao();
    Object.assign(atual, { sala, token, pc });

    // Se o navegador capturou maior que o teto (ex.: monitor 4K), reduz no envio
    const { width = qualidade.largura, height = qualidade.altura } = video.getSettings();
    const reducao = Math.max(1, width / qualidade.largura, height / qualidade.altura);
    const faixas = [
      {
        trackName: 'video',
        transceptor: pc.addTransceiver(video, {
          direction: 'sendonly',
          sendEncodings: [
            { maxBitrate: qualidade.taxaVideo, maxFramerate: qualidade.fps, scaleResolutionDownBy: reducao },
          ],
        }),
      },
    ];
    if (audio) faixas.push({ trackName: 'audio', transceptor: pc.addTransceiver(audio, { direction: 'sendonly' }) });

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
    await api(`/api/salas/${sala}/ao-vivo`, { metodo: 'POST', token });

    elementos.link.textContent = link;
    atualizarUso(chave);
    atual.relogioDeUso = setInterval(() => atualizarUso(chave), 60_000);
    elementos.aoVivo.hidden = false;
    elementos.formulario.hidden = true;
    mostrarSelo('ao-vivo', '● AO VIVO');
    mostrarStatus(
      audio
        ? `Ao vivo com vídeo e som, em ${qualidade.nome}.`
        : `Ao vivo em ${qualidade.nome}, mas sem som: para ter som, compartilhe uma aba com o som ligado.`,
    );

    // O usuário clicou em "Parar de compartilhar" na barra do navegador
    video.addEventListener('ended', () => encerrar());
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') mostrarStatus('A conexão com o servidor de vídeo caiu. Encerre e comece de novo.', 'erro');
    });
  } catch (erro) {
    mostrarStatus(`Não deu para transmitir: ${erro.message}`, 'erro');
    await encerrar({ manterStatus: true });
  }
}

async function encerrar({ manterStatus = false } = {}) {
  const transmissao = atual;
  atual = null;
  if (transmissao) {
    clearInterval(transmissao.relogioDeUso);
    transmissao.midia.getTracks().forEach((t) => t.stop());
    transmissao.pc?.close();
    if (transmissao.sala) {
      await api(`/api/salas/${transmissao.sala}`, { metodo: 'DELETE', token: transmissao.token }).catch(() => {});
    }
  }
  elementos.previa.srcObject = null;
  elementos.aoVivo.hidden = true;
  elementos.formulario.hidden = false;
  elementos.iniciar.disabled = false;
  mostrarSelo('parado', 'Parado');
  if (!manterStatus) mostrarStatus('Transmissão encerrada.');
}

elementos.formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();
  iniciar();
});
elementos.parar.addEventListener('click', () => encerrar());
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

montarQualidades();
elementos.qualidade.addEventListener('change', mostrarDicaDeQualidade);

const salva = lerChaveSalva();
if (salva) {
  elementos.chave.value = salva;
  elementos.lembrar.checked = true;
}

import { opusEstereo } from './sdp.js';
import { aguardarCandidatos, api, novaConexao } from './webrtc.js';

const ESPERA_AGUARDANDO_MS = 3_000;
const ESPERA_AO_VIVO_MS = 5_000;

const $ = (id) => document.getElementById(id);
const elementos = {
  titulo: $('titulo'),
  detalhe: $('detalhe'),
  selo: $('selo'),
  video: $('video'),
  sobreposicao: $('sobreposicao'),
  mensagem: $('mensagem'),
  assistir: $('assistir'),
};

const sala = location.pathname.split('/').filter(Boolean)[1] ?? new URLSearchParams(location.search).get('sala');

let conexao = null;
let publicacaoAtual = null;
let querAssistir = false;
let conectando = false;

function mostrarSelo(estado, texto) {
  elementos.selo.dataset.estado = estado;
  elementos.selo.textContent = texto;
}

function mostrarSobreposicao(mensagem, { botao = false } = {}) {
  elementos.mensagem.textContent = mensagem;
  elementos.assistir.hidden = !botao;
  elementos.sobreposicao.hidden = false;
}

function desconectar() {
  conexao?.close();
  conexao = null;
  publicacaoAtual = null;
  elementos.video.srcObject = null;
}

async function conectar() {
  conectando = true;
  desconectar();
  mostrarSobreposicao('Conectando à transmissão…');
  const pc = novaConexao();
  conexao = pc;
  try {
    const fluxo = new MediaStream();
    pc.addEventListener('track', (evento) => {
      fluxo.addTrack(evento.track);
      elementos.video.srcObject = fluxo;
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') {
        elementos.sobreposicao.hidden = true;
        elementos.video.play().catch(() => mostrarSobreposicao('Clique para começar.', { botao: true }));
      } else if (pc.connectionState === 'failed' && conexao === pc) {
        // A próxima verificação tenta de novo
        desconectar();
        mostrarSobreposicao('A conexão caiu. Reconectando…');
      }
    });

    const { sessionId, sessionDescription, publicacao } = await api(`/api/salas/${sala}/assistir`, { metodo: 'POST' });
    publicacaoAtual = publicacao;
    await pc.setRemoteDescription(sessionDescription);
    const resposta = await pc.createAnswer();
    try {
      await pc.setLocalDescription({ type: 'answer', sdp: opusEstereo(resposta.sdp) });
    } catch {
      await pc.setLocalDescription(resposta); // o navegador recusou o ajuste: fica em mono
    }
    await aguardarCandidatos(pc);
    await api(`/api/salas/${sala}/assistir/${encodeURIComponent(sessionId)}/resposta`, {
      metodo: 'POST',
      corpo: { sessionDescription: { type: 'answer', sdp: pc.localDescription.sdp } },
    });
  } catch (erro) {
    if (conexao === pc) desconectar();
    mostrarSobreposicao(`Não deu para conectar: ${erro.message} Tentando de novo…`);
  } finally {
    conectando = false;
  }
}

async function verificar() {
  let espera = ESPERA_AGUARDANDO_MS;
  try {
    const info = await api(`/api/salas/${sala}`);
    elementos.titulo.textContent = info.titulo;
    document.title = `${info.titulo} — transmissão`;

    if (info.estado === 'encerrada') {
      desconectar();
      mostrarSelo('encerrada', 'Encerrada');
      elementos.detalhe.textContent = 'Obrigado por assistir!';
      mostrarSobreposicao('A transmissão terminou.');
      return; // não há mais o que esperar
    }

    if (info.estado === 'aguardando') {
      desconectar();
      mostrarSelo('aguardando', 'Aguardando');
      elementos.detalhe.textContent = 'A página começa sozinha quando a transmissão iniciar.';
      mostrarSobreposicao('Aguardando a transmissão começar…');
    } else {
      espera = ESPERA_AO_VIVO_MS;
      mostrarSelo('ao-vivo', '● AO VIVO');
      elementos.detalhe.textContent = `Ao vivo desde ${new Date(info.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      if (!querAssistir) {
        // O som só pode tocar depois de um clique de quem está assistindo
        mostrarSobreposicao('A transmissão está ao vivo.', { botao: true });
      } else if (!conectando && (conexao === null || info.publicacao !== publicacaoAtual)) {
        await conectar();
      }
    }
  } catch (erro) {
    if (erro.status === 404) {
      mostrarSelo('erro', 'Não encontrada');
      elementos.detalhe.textContent = 'Confira se o link está completo.';
      mostrarSobreposicao('Sala não encontrada.');
      return;
    }
    elementos.detalhe.textContent = 'Sem resposta do servidor, tentando de novo…';
  }
  setTimeout(verificar, espera);
}

elementos.assistir.addEventListener('click', () => {
  querAssistir = true;
  if (conexao) {
    elementos.video.play().then(() => (elementos.sobreposicao.hidden = true));
  } else {
    conectar();
  }
});

if (!sala) {
  mostrarSelo('erro', 'Link inválido');
  mostrarSobreposicao('Este link não tem uma sala.');
} else {
  verificar();
}

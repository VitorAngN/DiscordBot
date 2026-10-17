import { opusEstereo } from './sdp.js';
import { aguardarCandidatos, api, novaConexao } from './webrtc.js';

const ESPERA_AGUARDANDO_MS = 3_000;
const ESPERA_AO_VIVO_MS = 5_000;
/** Enquanto assiste, avisa o servidor nesse intervalo (alimenta a trava de uso). */
const INTERVALO_PRESENCA_MS = 15_000;
const SENHA_SALVA = 'discordbot:senha-assistir';

const $ = (id) => document.getElementById(id);
const elementos = {
  titulo: $('titulo'),
  detalhe: $('detalhe'),
  selo: $('selo'),
  video: $('video'),
  sobreposicao: $('sobreposicao'),
  mensagem: $('mensagem'),
  assistir: $('assistir'),
  senha: $('senha'),
  campoSenha: $('campoSenha'),
};

const sala = location.pathname.split('/').filter(Boolean)[1] ?? new URLSearchParams(location.search).get('sala');

/** Conexão atual: { pc, sessao, publicacao } */
let atual = null;
let querAssistir = false;
let conectando = false;
let senha = lerSenha();
let proximo = null;

function lerSenha() {
  try {
    return localStorage.getItem(SENHA_SALVA) ?? '';
  } catch {
    return '';
  }
}

function guardarSenha(valor) {
  try {
    localStorage.setItem(SENHA_SALVA, valor);
  } catch {
    // Armazenamento bloqueado: pede de novo da próxima vez
  }
}

const chamar = (caminho, opcoes = {}) => api(caminho, { ...opcoes, token: senha || undefined });

function mostrarSelo(estado, texto) {
  elementos.selo.dataset.estado = estado;
  elementos.selo.textContent = texto;
}

function mostrarSobreposicao(mensagem, { botao = false, pedirSenha = false } = {}) {
  elementos.mensagem.textContent = mensagem;
  elementos.assistir.hidden = !botao;
  elementos.senha.hidden = !pedirSenha;
  elementos.sobreposicao.hidden = false;
}

function desconectar() {
  atual?.pc.close();
  atual = null;
  elementos.video.srcObject = null;
}

function agendar(espera) {
  clearTimeout(proximo);
  proximo = setTimeout(ciclo, espera);
}

async function conectar() {
  conectando = true;
  desconectar();
  mostrarSobreposicao('Conectando à transmissão…');
  const pc = novaConexao();
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
      } else if (pc.connectionState === 'failed' && atual?.pc === pc) {
        desconectar();
        mostrarSobreposicao('A conexão caiu. Reconectando…');
        agendar(1_000);
      }
    });

    const { sessionId, sessionDescription, publicacao } = await chamar(`/api/salas/${sala}/assistir`, { metodo: 'POST' });
    atual = { pc, sessao: sessionId, publicacao };
    await pc.setRemoteDescription(sessionDescription);
    const resposta = await pc.createAnswer();
    try {
      await pc.setLocalDescription({ type: 'answer', sdp: opusEstereo(resposta.sdp) });
    } catch {
      await pc.setLocalDescription(resposta); // o navegador recusou o ajuste: fica em mono
    }
    await aguardarCandidatos(pc);
    await chamar(`/api/salas/${sala}/assistir/${encodeURIComponent(sessionId)}/resposta`, {
      metodo: 'POST',
      corpo: { sessionDescription: { type: 'answer', sdp: pc.localDescription.sdp } },
    });
  } catch (erro) {
    pc.close();
    if (atual?.pc === pc) atual = null;
    if (erro.status === 429) mostrarLimite(erro.message);
    else mostrarSobreposicao(`Não deu para conectar: ${erro.message} Tentando de novo…`);
  } finally {
    conectando = false;
  }
}

function mostrarLimite(mensagem) {
  desconectar();
  querAssistir = false; // não fica tentando de novo sozinho; o botão volta quando a sala estiver ao vivo
  mostrarSelo('aguardando', 'Pausada');
  elementos.detalhe.textContent = 'O limite grátis de transmissão foi atingido.';
  mostrarSobreposicao(mensagem ?? 'O limite grátis de transmissão foi atingido. Tente de novo mais tarde.');
}

function mostrarEncerrada() {
  desconectar();
  mostrarSelo('encerrada', 'Encerrada');
  elementos.detalhe.textContent = 'Obrigado por assistir!';
  mostrarSobreposicao('A transmissão terminou.');
}

/** Enquanto assiste: avisa o servidor e obedece se ele mandar parar. */
async function avisarPresenca() {
  const conexao = atual;
  const { continuar, motivo, publicacao } = await chamar(
    `/api/salas/${sala}/assistir/${encodeURIComponent(conexao.sessao)}/presenca`,
    { metodo: 'POST' },
  );
  if (atual !== conexao) return { espera: ESPERA_AO_VIVO_MS }; // a conexão mudou enquanto esperava
  if (continuar) {
    if (publicacao !== conexao.publicacao) await conectar(); // a transmissão recomeçou
    return { espera: INTERVALO_PRESENCA_MS };
  }
  if (motivo === 'encerrada') {
    mostrarEncerrada();
    return { fim: true };
  }
  if (motivo === 'limite') {
    mostrarLimite();
    return { espera: 60_000 };
  }
  desconectar(); // aguardando: volta a esperar a transmissão
  return { espera: ESPERA_AGUARDANDO_MS };
}

/** Sem assistir: confere o estado da sala. */
async function conferirSala() {
  const info = await chamar(`/api/salas/${sala}`);
  elementos.titulo.textContent = info.titulo;
  document.title = `${info.titulo} — transmissão`;

  if (info.estado === 'encerrada') {
    mostrarEncerrada();
    return { fim: true };
  }
  if (info.estado === 'aguardando') {
    mostrarSelo('aguardando', 'Aguardando');
    elementos.detalhe.textContent = 'A página começa sozinha quando a transmissão iniciar.';
    mostrarSobreposicao('Aguardando a transmissão começar…');
    return { espera: ESPERA_AGUARDANDO_MS };
  }

  mostrarSelo('ao-vivo', '● AO VIVO');
  const inicio = new Date(info.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  elementos.detalhe.textContent = `Ao vivo desde ${inicio}`;
  if (!querAssistir) {
    // O som só pode tocar depois de um clique de quem está assistindo
    mostrarSobreposicao('A transmissão está ao vivo.', { botao: true });
  } else if (!conectando) {
    await conectar();
  }
  return { espera: ESPERA_AO_VIVO_MS };
}

async function ciclo() {
  let resultado = { espera: ESPERA_AGUARDANDO_MS };
  try {
    resultado = atual && !conectando ? await avisarPresenca() : await conferirSala();
  } catch (erro) {
    if (erro.status === 401) {
      desconectar();
      mostrarSelo('aguardando', 'Só convidados');
      elementos.detalhe.textContent = 'Peça a senha para quem te mandou o link.';
      mostrarSobreposicao(senha ? 'Senha incorreta. Tente de novo.' : 'Esta transmissão é só para convidados.', { pedirSenha: true });
      return; // espera a senha
    }
    if (erro.status === 404) {
      mostrarSelo('erro', 'Não encontrada');
      elementos.detalhe.textContent = 'Confira se o link está completo.';
      mostrarSobreposicao('Sala não encontrada.');
      return;
    }
    elementos.detalhe.textContent = 'Sem resposta do servidor, tentando de novo…';
  }
  if (!resultado.fim) agendar(resultado.espera);
}

elementos.assistir.addEventListener('click', () => {
  querAssistir = true;
  if (atual) {
    elementos.video.play().then(() => (elementos.sobreposicao.hidden = true));
  } else {
    conectar().then(() => agendar(INTERVALO_PRESENCA_MS));
  }
});

elementos.senha.addEventListener('submit', (evento) => {
  evento.preventDefault();
  senha = elementos.campoSenha.value.trim();
  guardarSenha(senha);
  elementos.campoSenha.value = '';
  mostrarSobreposicao('Conferindo…');
  ciclo();
});

if (!sala) {
  mostrarSelo('erro', 'Link inválido');
  mostrarSobreposicao('Este link não tem uma sala.');
} else {
  ciclo();
}

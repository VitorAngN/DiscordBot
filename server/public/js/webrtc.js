// Funções compartilhadas entre as páginas de transmitir e de assistir.

const SERVIDORES_ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];

export function novaConexao() {
  return new RTCPeerConnection({ iceServers: SERVIDORES_ICE, bundlePolicy: 'max-bundle' });
}

/**
 * O SFU recebe o SDP de uma vez só, então espera o navegador reunir os
 * candidatos de rede antes de enviar (com limite de tempo).
 */
export function aguardarCandidatos(pc, limiteMs = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const terminar = () => {
      clearTimeout(tempo);
      pc.removeEventListener('icegatheringstatechange', conferir);
      resolve();
    };
    const conferir = () => {
      if (pc.iceGatheringState === 'complete') terminar();
    };
    const tempo = setTimeout(terminar, limiteMs);
    pc.addEventListener('icegatheringstatechange', conferir);
  });
}

/** Resolve quando a conexão fica `connected`; rejeita se falhar ou demorar demais. */
export function aguardarConexao(pc, limiteMs = 15_000) {
  if (pc.connectionState === 'connected') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const terminar = (erro) => {
      clearTimeout(tempo);
      pc.removeEventListener('connectionstatechange', conferir);
      erro ? reject(erro) : resolve();
    };
    const conferir = () => {
      if (pc.connectionState === 'connected') terminar();
      else if (pc.connectionState === 'failed') terminar(new Error('A conexão com o servidor de vídeo falhou.'));
    };
    const tempo = setTimeout(() => terminar(new Error('A conexão com o servidor de vídeo demorou demais.')), limiteMs);
    pc.addEventListener('connectionstatechange', conferir);
  });
}

/** Chama a API do servidor; em erro, lança com a mensagem que o servidor mandou. */
export async function api(caminho, { metodo = 'GET', corpo, token } = {}) {
  const headers = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const resposta = await fetch(caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = new Error(dados?.erro ?? `Erro ${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

// Cliente da Connection API do Cloudflare Realtime SFU.
// https://developers.cloudflare.com/realtime/sfu/api/

const BASE = 'https://rtc.live.cloudflare.com/v1';

export interface DescricaoDeSessao {
  type: 'offer' | 'answer';
  sdp: string;
}

/** Faixa que o navegador envia: o `mid` vem do transceptor no SDP. */
export interface FaixaLocal {
  mid: string;
  trackName: string;
}

export interface Assinatura {
  oferta: DescricaoDeSessao;
  faixas: FaixaLocal[];
}

export interface ClienteSfu {
  novaSessao(): Promise<string>;
  publicar(sessionId: string, oferta: DescricaoDeSessao, faixas: FaixaLocal[]): Promise<DescricaoDeSessao>;
  /** Pede as faixas publicadas por `origem`; o SFU devolve uma oferta para o navegador responder. */
  assinar(sessionId: string, origem: string, nomes: string[]): Promise<Assinatura>;
  renegociar(sessionId: string, resposta: DescricaoDeSessao): Promise<void>;
}

export class ErroSfu extends Error {
  constructor(
    message: string,
    readonly codigo?: string,
  ) {
    super(message);
  }
}

interface ErroDaApi {
  errorCode?: string;
  errorDescription?: string;
}

interface RespostaDeFaixas extends ErroDaApi {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: DescricaoDeSessao;
  tracks?: Array<ErroDaApi & { mid?: string; trackName?: string; sessionId?: string }>;
}

export function criarClienteSfu(appId: string, segredo: string, buscar: typeof fetch = fetch): ClienteSfu {
  const raiz = `${BASE}/apps/${encodeURIComponent(appId)}`;

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const resposta = await buscar(`${raiz}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${segredo}`, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => ({}))) as T & ErroDaApi;
    if (!resposta.ok || dados.errorCode) {
      const detalhe = dados.errorDescription ?? dados.errorCode ?? 'erro desconhecido';
      throw new ErroSfu(`O SFU respondeu ${resposta.status}: ${detalhe}`, dados.errorCode);
    }
    return dados;
  }

  /** Erros podem vir por faixa, mesmo com a requisição aceita. */
  function conferirFaixas(dados: RespostaDeFaixas): DescricaoDeSessao {
    const falha = dados.tracks?.find((t) => t.errorCode);
    if (falha) {
      throw new ErroSfu(
        `A faixa "${falha.trackName ?? falha.mid}" falhou: ${falha.errorDescription ?? falha.errorCode}`,
        falha.errorCode,
      );
    }
    if (!dados.sessionDescription) throw new ErroSfu('O SFU não devolveu a descrição da sessão.');
    return dados.sessionDescription;
  }

  const sessao = (id: string) => `/sessions/${encodeURIComponent(id)}`;

  return {
    async novaSessao() {
      const { sessionId } = await chamar<{ sessionId: string }>('POST', '/sessions/new');
      return sessionId;
    },

    async publicar(sessionId, oferta, faixas) {
      const dados = await chamar<RespostaDeFaixas>('POST', `${sessao(sessionId)}/tracks/new`, {
        sessionDescription: oferta,
        tracks: faixas.map((f) => ({ location: 'local', mid: f.mid, trackName: f.trackName })),
      });
      return conferirFaixas(dados);
    },

    async assinar(sessionId, origem, nomes) {
      const dados = await chamar<RespostaDeFaixas>('POST', `${sessao(sessionId)}/tracks/new`, {
        tracks: nomes.map((trackName) => ({ location: 'remote', sessionId: origem, trackName })),
      });
      const oferta = conferirFaixas(dados);
      const faixas = (dados.tracks ?? []).map((t) => ({ mid: t.mid ?? '', trackName: t.trackName ?? '' }));
      return { oferta, faixas };
    },

    async renegociar(sessionId, resposta) {
      await chamar('PUT', `${sessao(sessionId)}/renegotiate`, { sessionDescription: resposta });
    },
  };
}

import { describe, expect, it } from 'vitest';
import { criarClienteSfu, ErroSfu } from '../src/sfu';

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Headers;
  corpo: unknown;
}

/** fetch falso que registra as chamadas e devolve as respostas na ordem. */
function fetchFalso(...respostas: Array<{ status?: number; corpo: unknown }>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: string, init: RequestInit = {}) => {
    chamadas.push({
      url,
      metodo: init.method ?? 'GET',
      cabecalhos: new Headers(init.headers),
      corpo: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const r = respostas.shift() ?? { corpo: {} };
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const BASE = 'https://rtc.live.cloudflare.com/v1/apps/app-123';
const OFERTA = { type: 'offer' as const, sdp: 'v=0 oferta' };
const RESPOSTA = { type: 'answer' as const, sdp: 'v=0 resposta' };

describe('cliente do SFU', () => {
  it('cria sessão com o segredo no cabeçalho', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: { sessionId: 'sessao-1' } });
    const sfu = criarClienteSfu('app-123', 'segredo', buscar);

    expect(await sfu.novaSessao()).toBe('sessao-1');
    expect(chamadas[0]).toMatchObject({ url: `${BASE}/sessions/new`, metodo: 'POST' });
    expect(chamadas[0].cabecalhos.get('Authorization')).toBe('Bearer segredo');
  });

  it('publica faixas locais e devolve a resposta do SFU', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: { sessionDescription: RESPOSTA, tracks: [{ mid: '0', trackName: 'video' }] } });
    const sfu = criarClienteSfu('app-123', 'segredo', buscar);

    const resposta = await sfu.publicar('sessao-1', OFERTA, [{ mid: '0', trackName: 'video' }]);

    expect(resposta).toEqual(RESPOSTA);
    expect(chamadas[0].url).toBe(`${BASE}/sessions/sessao-1/tracks/new`);
    expect(chamadas[0].corpo).toEqual({
      sessionDescription: OFERTA,
      tracks: [{ location: 'local', mid: '0', trackName: 'video' }],
    });
  });

  it('assina faixas remotas de outra sessão', async () => {
    const { buscar, chamadas } = fetchFalso({
      corpo: {
        requiresImmediateRenegotiation: true,
        sessionDescription: OFERTA,
        tracks: [
          { mid: '0', trackName: 'video', sessionId: 'pub' },
          { mid: '1', trackName: 'audio', sessionId: 'pub' },
        ],
      },
    });
    const sfu = criarClienteSfu('app-123', 'segredo', buscar);

    const { oferta, faixas } = await sfu.assinar('espectador', 'pub', ['video', 'audio']);

    expect(oferta).toEqual(OFERTA);
    expect(faixas).toEqual([
      { mid: '0', trackName: 'video' },
      { mid: '1', trackName: 'audio' },
    ]);
    expect(chamadas[0].corpo).toEqual({
      tracks: [
        { location: 'remote', sessionId: 'pub', trackName: 'video' },
        { location: 'remote', sessionId: 'pub', trackName: 'audio' },
      ],
    });
  });

  it('envia a resposta do navegador na renegociação', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: {} });
    await criarClienteSfu('app-123', 'segredo', buscar).renegociar('espectador', RESPOSTA);

    expect(chamadas[0]).toMatchObject({ url: `${BASE}/sessions/espectador/renegotiate`, metodo: 'PUT' });
    expect(chamadas[0].corpo).toEqual({ sessionDescription: RESPOSTA });
  });

  it('transforma erro HTTP em ErroSfu', async () => {
    const { buscar } = fetchFalso({ status: 401, corpo: { errorCode: 'unauthorized', errorDescription: 'bad token' } });
    const sfu = criarClienteSfu('app-123', 'segredo', buscar);

    const erro = await sfu.novaSessao().catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroSfu);
    expect(erro).toMatchObject({ message: 'O SFU respondeu 401: bad token', codigo: 'unauthorized' });
  });

  it('falha quando uma faixa vem com erro, mesmo com status 200', async () => {
    const { buscar } = fetchFalso({
      corpo: { sessionDescription: OFERTA, tracks: [{ trackName: 'video', errorCode: 'not_found', errorDescription: 'track not found' }] },
    });
    const sfu = criarClienteSfu('app-123', 'segredo', buscar);

    await expect(sfu.assinar('espectador', 'pub', ['video'])).rejects.toThrow('A faixa "video" falhou: track not found');
  });
});

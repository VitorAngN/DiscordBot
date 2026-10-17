import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tratarApi, type Dependencias } from '../src/api';
import type { DadosDaSala, RepositorioDeSalas } from '../src/salas';
import type { ClienteSfu } from '../src/sfu';
import type { MedidorDeUso } from '../src/uso';
import { taxaPorEspectador } from '../public/js/qualidade.js';

const ORIGEM = 'https://transmissao.exemplo.workers.dev';
const CHAVE = 'chave-de-teste';
const OFERTA = { type: 'offer' as const, sdp: 'v=0 oferta' };
const RESPOSTA = { type: 'answer' as const, sdp: 'v=0 resposta' };

function repositorioEmMemoria(): RepositorioDeSalas & { dados: Map<string, DadosDaSala> } {
  const dados = new Map<string, DadosDaSala>();
  return {
    dados,
    obter: async (id) => structuredClone(dados.get(id) ?? null),
    salvar: async (id, sala) => void dados.set(id, structuredClone(sala)),
  };
}

function sfuFalso() {
  let sessoes = 0;
  return {
    novaSessao: vi.fn(async () => `sessao-${++sessoes}`),
    publicar: vi.fn(async () => RESPOSTA),
    assinar: vi.fn(async () => ({ oferta: OFERTA, faixas: [{ mid: '0', trackName: 'video' }] })),
    renegociar: vi.fn(async () => {}),
  } satisfies ClienteSfu;
}

function medidorFalso() {
  let total = 0;
  return {
    iniciar: vi.fn(async (_sessao: string, _taxa: number) => {}),
    presenca: vi.fn(async (_sessao: string) => total),
    total: vi.fn(async () => total),
    definirTotal: (bytes: number) => void (total = bytes),
  } satisfies MedidorDeUso & { definirTotal(bytes: number): void };
}

const LIMITE = 900;

let salas: ReturnType<typeof repositorioEmMemoria>;
let sfu: ReturnType<typeof sfuFalso>;
let uso: ReturnType<typeof medidorFalso>;
let deps: Dependencias;

beforeEach(() => {
  salas = repositorioEmMemoria();
  sfu = sfuFalso();
  uso = medidorFalso();
  deps = { salas, sfu, uso, chaveDeTransmissao: CHAVE, chaveDeAssistir: '', limiteDeUso: LIMITE, agora: () => 1_000 };
});

function pedir(metodo: string, caminho: string, { corpo, token }: { corpo?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(`${ORIGEM}${caminho}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return tratarApi(req, deps);
}

// O formato é conferido pelas asserções de cada teste
async function corpo(resposta: Response): Promise<any> {
  return resposta.status === 204 ? null : resposta.json();
}

async function criarSala(titulo?: string): Promise<{ sala: string; link: string; token: string }> {
  const resposta = await pedir('POST', '/api/salas', { token: CHAVE, corpo: titulo === undefined ? undefined : { titulo } });
  expect(resposta.status).toBe(201);
  return corpo(resposta);
}

async function colocarAoVivo(sala: string, token: string) {
  const publicar = await pedir('POST', `/api/salas/${sala}/publicar`, {
    token,
    corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }, { mid: '1', trackName: 'audio' }] },
  });
  expect(publicar.status).toBe(200);
  expect((await pedir('POST', `/api/salas/${sala}/ao-vivo`, { token })).status).toBe(204);
}

describe('criar sala', () => {
  it('exige a chave de transmissão', async () => {
    expect((await pedir('POST', '/api/salas')).status).toBe(401);
    expect((await pedir('POST', '/api/salas', { token: 'errada' })).status).toBe(401);
  });

  it('avisa quando o servidor está sem chave configurada', async () => {
    deps.chaveDeTransmissao = '';
    expect((await pedir('POST', '/api/salas', { token: CHAVE })).status).toBe(503);
  });

  it('cria a sala aguardando, com link curto e token do transmissor', async () => {
    const { sala, link, token } = await criarSala('Minecraft');

    expect(sala).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(link).toBe(`${ORIGEM}/s/${sala}`);
    expect(token.length).toBeGreaterThan(30);
    const info = await corpo(await pedir('GET', `/api/salas/${sala}`));
    expect(info).toEqual({ titulo: 'Minecraft', qualidade: '720p · 60 fps', estado: 'aguardando', publicacao: null, inicio: null });
  });

  it('guarda a qualidade escolhida e recusa qualidades fora da lista', async () => {
    const criar = (qualidade: unknown) => pedir('POST', '/api/salas', { token: CHAVE, corpo: { qualidade } });

    const { sala } = await corpo(await criar('1080p30'));
    expect((await corpo(await pedir('GET', `/api/salas/${sala}`))).qualidade).toBe('1080p · 30 fps');
    expect((await criar('4k')).status).toBe(400);
    expect((await criar(1080)).status).toBe(400);
  });

  it('usa um título padrão e não guarda o token em texto', async () => {
    const { sala, token } = await criarSala();

    expect(salas.dados.get(sala)?.titulo).toBe('Transmissão');
    expect(JSON.stringify(salas.dados.get(sala))).not.toContain(token);
  });
});

describe('consultar sala', () => {
  it('responde 404 para sala inexistente ou ID inválido', async () => {
    expect((await pedir('GET', '/api/salas/AAAAAAAAAA')).status).toBe(404);
    expect((await pedir('GET', '/api/salas/../segredo')).status).toBe(404);
  });
});

describe('publicar', () => {
  it('só aceita o token de quem criou a sala', async () => {
    const { sala } = await criarSala();
    const resposta = await pedir('POST', `/api/salas/${sala}/publicar`, {
      token: CHAVE,
      corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }] },
    });

    expect(resposta.status).toBe(403);
    expect(sfu.novaSessao).not.toHaveBeenCalled();
  });

  it('valida a oferta e as faixas', async () => {
    const { sala, token } = await criarSala();
    const enviar = (c: unknown) => pedir('POST', `/api/salas/${sala}/publicar`, { token, corpo: c });

    expect((await enviar({ sessionDescription: RESPOSTA, tracks: [{ mid: '0', trackName: 'video' }] })).status).toBe(400);
    expect((await enviar({ sessionDescription: OFERTA, tracks: [] })).status).toBe(400);
    expect((await enviar({ sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'Vídeo!' }] })).status).toBe(400);
    expect((await enviar({ sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'a' }, { mid: '1', trackName: 'a' }] })).status).toBe(400);
  });

  it('publica no SFU e só fica ao vivo depois da confirmação', async () => {
    const { sala, token } = await criarSala();
    const resposta = await pedir('POST', `/api/salas/${sala}/publicar`, {
      token,
      corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }] },
    });

    expect(await corpo(resposta)).toEqual({ sessionDescription: RESPOSTA });
    expect(sfu.publicar).toHaveBeenCalledWith('sessao-1', OFERTA, [{ mid: '0', trackName: 'video' }]);
    expect((await corpo(await pedir('GET', `/api/salas/${sala}`))).estado).toBe('aguardando');

    await pedir('POST', `/api/salas/${sala}/ao-vivo`, { token });
    expect(await corpo(await pedir('GET', `/api/salas/${sala}`))).toMatchObject({ estado: 'ao-vivo', publicacao: 1, inicio: 1_000 });
  });

  it('não confirma ao vivo sem ter publicado', async () => {
    const { sala, token } = await criarSala();
    expect((await pedir('POST', `/api/salas/${sala}/ao-vivo`, { token })).status).toBe(409);
  });

  it('repassa falhas do SFU como 502', async () => {
    const { sala, token } = await criarSala();
    const { ErroSfu } = await import('../src/sfu');
    sfu.publicar.mockRejectedValueOnce(new ErroSfu('O SFU respondeu 500: falhou'));

    const resposta = await pedir('POST', `/api/salas/${sala}/publicar`, {
      token,
      corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }] },
    });

    expect(resposta.status).toBe(502);
    expect(await corpo(resposta)).toEqual({ erro: 'O SFU respondeu 500: falhou' });
  });

  it('avisa quando o servidor está sem credenciais do Realtime', async () => {
    deps.sfu = null;
    const { sala, token } = await criarSala();
    const resposta = await pedir('POST', `/api/salas/${sala}/publicar`, {
      token,
      corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }] },
    });

    expect(resposta.status).toBe(503);
  });
});

describe('assistir', () => {
  it('espera a transmissão começar', async () => {
    const { sala } = await criarSala();
    expect((await pedir('POST', `/api/salas/${sala}/assistir`)).status).toBe(409);
  });

  it('assina as faixas do transmissor e repassa a resposta do navegador', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);

    const assistir = await corpo(await pedir('POST', `/api/salas/${sala}/assistir`));
    expect(assistir).toEqual({
      sessionId: 'sessao-2',
      sessionDescription: OFERTA,
      faixas: [{ mid: '0', trackName: 'video' }],
      publicacao: 1,
    });
    expect(sfu.assinar).toHaveBeenCalledWith('sessao-2', 'sessao-1', ['video', 'audio']);

    const resposta = await pedir('POST', `/api/salas/${sala}/assistir/sessao-2/resposta`, { corpo: { sessionDescription: RESPOSTA } });
    expect(resposta.status).toBe(204);
    expect(sfu.renegociar).toHaveBeenCalledWith('sessao-2', RESPOSTA);
  });

  it('recusa resposta que não seja do tipo answer', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);

    const resposta = await pedir('POST', `/api/salas/${sala}/assistir/sessao-2/resposta`, { corpo: { sessionDescription: OFERTA } });
    expect(resposta.status).toBe(400);
  });

  it('uma nova publicação muda o número, para quem assiste reconectar', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);
    await colocarAoVivo(sala, token);

    expect((await corpo(await pedir('GET', `/api/salas/${sala}`))).publicacao).toBe(2);
  });
});

describe('encerrar', () => {
  it('encerra a sala e bloqueia novas ações', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);

    expect((await pedir('DELETE', `/api/salas/${sala}`, { token: 'errado' })).status).toBe(403);
    expect((await pedir('DELETE', `/api/salas/${sala}`, { token })).status).toBe(204);

    expect((await corpo(await pedir('GET', `/api/salas/${sala}`))).estado).toBe('encerrada');
    expect((await pedir('POST', `/api/salas/${sala}/assistir`)).status).toBe(410);
    expect(
      (
        await pedir('POST', `/api/salas/${sala}/publicar`, {
          token,
          corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }] },
        })
      ).status,
    ).toBe(410);
  });
});

describe('senha para assistir', () => {
  beforeEach(() => {
    deps.chaveDeAssistir = 'senha-dos-amigos';
  });

  it('esconde a sala de quem não tem a senha', async () => {
    const { sala, token } = await criarSala('Só amigos');
    await colocarAoVivo(sala, token);

    expect((await pedir('GET', `/api/salas/${sala}`)).status).toBe(401);
    expect((await pedir('GET', `/api/salas/${sala}`, { token: 'chute' })).status).toBe(401);
    expect((await pedir('POST', `/api/salas/${sala}/assistir`)).status).toBe(401);
    expect(sfu.assinar).not.toHaveBeenCalled();
  });

  it('com a senha, assiste normalmente', async () => {
    const { sala, token } = await criarSala('Só amigos');
    await colocarAoVivo(sala, token);
    const senha = 'senha-dos-amigos';

    expect((await corpo(await pedir('GET', `/api/salas/${sala}`, { token: senha }))).titulo).toBe('Só amigos');
    expect((await pedir('POST', `/api/salas/${sala}/assistir`, { token: senha })).status).toBe(200);
    const resposta = await pedir('POST', `/api/salas/${sala}/assistir/sessao-2/resposta`, {
      token: senha,
      corpo: { sessionDescription: RESPOSTA },
    });
    expect(resposta.status).toBe(204);
  });
});

describe('trava de uso', () => {
  it('começa a contar quem assiste e responde à presença', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);
    await pedir('POST', `/api/salas/${sala}/assistir`);

    expect(uso.iniciar).toHaveBeenCalledWith('sessao-2', taxaPorEspectador('720p60'));
    const presenca = await corpo(await pedir('POST', `/api/salas/${sala}/assistir/sessao-2/presenca`));
    expect(presenca).toEqual({ continuar: true, motivo: null, publicacao: 1 });
    expect(uso.presenca).toHaveBeenCalledWith('sessao-2');
  });

  it('no limite, para quem assiste e bloqueia novas transmissões', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);
    uso.definirTotal(LIMITE);

    const presenca = await corpo(await pedir('POST', `/api/salas/${sala}/assistir/sessao-2/presenca`));
    expect(presenca).toMatchObject({ continuar: false, motivo: 'limite' });

    const assistir = await pedir('POST', `/api/salas/${sala}/assistir`);
    expect(assistir.status).toBe(429);
    expect((await corpo(assistir)).erro).toContain('limite grátis');
    expect((await pedir('POST', '/api/salas', { token: CHAVE })).status).toBe(429);
    const publicar = await pedir('POST', `/api/salas/${sala}/publicar`, {
      token,
      corpo: { sessionDescription: OFERTA, tracks: [{ mid: '0', trackName: 'video' }] },
    });
    expect(publicar.status).toBe(429);
  });

  it('avisa quem assiste quando a transmissão termina', async () => {
    const { sala, token } = await criarSala();
    await colocarAoVivo(sala, token);
    await pedir('DELETE', `/api/salas/${sala}`, { token });

    const presenca = await corpo(await pedir('POST', `/api/salas/${sala}/assistir/sessao-2/presenca`));
    expect(presenca).toMatchObject({ continuar: false, motivo: 'encerrada' });
  });

  it('mostra o uso só para quem tem a chave de transmissão', async () => {
    uso.definirTotal(123);

    expect((await pedir('GET', '/api/uso')).status).toBe(401);
    expect(await corpo(await pedir('GET', '/api/uso', { token: CHAVE }))).toEqual({
      usado: 123,
      limite: LIMITE,
      janelaDias: 31,
      atingido: false,
    });
  });
});

describe('rotas', () => {
  it('responde 404 para rotas desconhecidas e 405 para método errado', async () => {
    expect((await pedir('GET', '/api/outra-coisa')).status).toBe(404);
    expect((await pedir('GET', '/api/salas')).status).toBe(405);
  });

  it('JSON inválido vira 400', async () => {
    const { sala, token } = await criarSala();
    const req = new Request(`${ORIGEM}/api/salas/${sala}/publicar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: '{quebrado',
    });
    expect((await tratarApi(req, deps)).status).toBe(400);
  });
});

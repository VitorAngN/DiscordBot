// Rotas /api/*. Recebe as dependências por parâmetro para ser testável fora do runtime dos Workers.
import {
  encerrar,
  gerarIdDeSala,
  gerarToken,
  hashDe,
  marcarAoVivo,
  MAX_TITULO,
  novaSala,
  registrarPublicacao,
  resumoPublico,
  segredosIguais,
  TITULO_PADRAO,
  type DadosDaSala,
  type RepositorioDeSalas,
} from './salas';
import { ErroSfu, type ClienteSfu, type DescricaoDeSessao, type FaixaLocal } from './sfu';

export interface Dependencias {
  salas: RepositorioDeSalas;
  /** `null` quando o servidor ainda não tem as credenciais do Realtime. */
  sfu: ClienteSfu | null;
  /** Senha para criar salas; vazia quando ainda não foi configurada. */
  chaveDeTransmissao: string;
  agora?: () => number;
}

const ID_DE_SALA = /^[0-9A-Za-z]{10}$/;
const ID_DE_SESSAO = /^[0-9A-Za-z_-]{1,128}$/;
const NOME_DE_FAIXA = /^[a-z0-9-]{1,32}$/;
const MAX_FAIXAS = 4;
const MAX_SDP = 64 * 1024;

class ErroHttp extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const semConteudo = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function tratarApi(req: Request, deps: Dependencias): Promise<Response> {
  try {
    return await rotear(req, deps);
  } catch (e) {
    if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
    if (e instanceof ErroSfu) return json({ erro: e.message }, 502);
    console.error('Falha na API:', e);
    return json({ erro: 'Erro interno do servidor.' }, 500);
  }
}

async function rotear(req: Request, deps: Dependencias): Promise<Response> {
  const url = new URL(req.url);
  const [api, recurso, id, acao, sessao, subacao, ...resto] = url.pathname.split('/').filter(Boolean);
  if (api !== 'api' || recurso !== 'salas' || resto.length > 0) throw new ErroHttp(404, 'Rota não encontrada.');

  if (!id) {
    if (req.method !== 'POST') throw new ErroHttp(405, 'Use POST para criar uma sala.');
    return criarSala(req, deps, url.origin);
  }

  if (!ID_DE_SALA.test(id)) throw new ErroHttp(404, 'Sala não encontrada.');
  const sala = await deps.salas.obter(id);
  if (!sala) throw new ErroHttp(404, 'Sala não encontrada.');
  const ctx = { req, deps, id, sala };

  const rota = `${req.method} ${[acao, sessao && ':sessao', subacao].filter(Boolean).join('/')}`;
  switch (rota) {
    case 'GET ':
      return json(resumoPublico(sala));
    case 'DELETE ':
      return encerrarSala(ctx);
    case 'POST publicar':
      return publicar(ctx);
    case 'POST ao-vivo':
      return confirmarAoVivo(ctx);
    case 'POST assistir':
      return assistir(ctx);
    case 'POST assistir/:sessao/resposta':
      return responder(ctx, sessao!);
    default:
      throw new ErroHttp(404, 'Rota não encontrada.');
  }
}

interface Contexto {
  req: Request;
  deps: Dependencias;
  id: string;
  sala: DadosDaSala;
}

async function criarSala(req: Request, deps: Dependencias, origem: string): Promise<Response> {
  if (!deps.chaveDeTransmissao) throw new ErroHttp(503, 'O servidor ainda não tem a chave de transmissão configurada.');
  const chave = tokenDe(req);
  if (!chave || !(await segredosIguais(chave, deps.chaveDeTransmissao))) {
    throw new ErroHttp(401, 'Chave de transmissão inválida.');
  }

  const corpo = await lerJson<{ titulo?: unknown }>(req, true);
  const titulo = typeof corpo?.titulo === 'string' && corpo.titulo.trim() ? corpo.titulo.trim().slice(0, MAX_TITULO) : TITULO_PADRAO;

  let id = gerarIdDeSala();
  while (await deps.salas.obter(id)) id = gerarIdDeSala();
  const token = gerarToken();
  await deps.salas.salvar(id, novaSala(titulo, await hashDe(token), agora(deps)));

  return json({ sala: id, link: `${origem}/s/${id}`, token }, 201);
}

async function publicar({ req, deps, id, sala }: Contexto): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'Esta sala já foi encerrada.');
  const sfu = exigirSfu(deps);

  const corpo = await lerJson<{ sessionDescription?: unknown; tracks?: unknown }>(req);
  const oferta = lerDescricao(corpo?.sessionDescription, 'offer');
  const faixas = lerFaixas(corpo?.tracks);

  const sessionId = await sfu.novaSessao();
  const resposta = await sfu.publicar(sessionId, oferta, faixas);
  const nomes = faixas.map((f) => f.trackName);
  await deps.salas.salvar(id, registrarPublicacao(sala, sessionId, nomes, agora(deps)));

  return json({ sessionDescription: resposta });
}

async function confirmarAoVivo({ req, deps, id, sala }: Contexto): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'Esta sala já foi encerrada.');
  if (!sala.publicacao) throw new ErroHttp(409, 'Publique as faixas antes de ficar ao vivo.');
  await deps.salas.salvar(id, marcarAoVivo(sala));
  return semConteudo();
}

async function assistir({ deps, sala }: Contexto): Promise<Response> {
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'A transmissão terminou.');
  if (sala.estado !== 'ao-vivo' || !sala.publicacao) throw new ErroHttp(409, 'A transmissão ainda não começou.');
  const sfu = exigirSfu(deps);

  const sessionId = await sfu.novaSessao();
  const { oferta, faixas } = await sfu.assinar(sessionId, sala.publicacao.sessionId, sala.publicacao.faixas);
  return json({ sessionId, sessionDescription: oferta, faixas, publicacao: sala.publicacao.numero });
}

async function responder({ req, deps }: Contexto, sessao: string): Promise<Response> {
  if (!ID_DE_SESSAO.test(sessao)) throw new ErroHttp(400, 'Sessão inválida.');
  const sfu = exigirSfu(deps);
  const corpo = await lerJson<{ sessionDescription?: unknown }>(req);
  await sfu.renegociar(sessao, lerDescricao(corpo?.sessionDescription, 'answer'));
  return semConteudo();
}

async function encerrarSala({ req, deps, id, sala }: Contexto): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado !== 'encerrada') await deps.salas.salvar(id, encerrar(sala));
  return semConteudo();
}

// --- Validações ---

function tokenDe(req: Request): string | null {
  const cabecalho = req.headers.get('Authorization') ?? '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() || null : null;
}

async function exigirTransmissor(req: Request, sala: DadosDaSala) {
  const token = tokenDe(req);
  if (!token || (await hashDe(token)) !== sala.hashDoToken) {
    throw new ErroHttp(403, 'Só quem criou a sala pode fazer isso.');
  }
}

function exigirSfu(deps: Dependencias): ClienteSfu {
  if (!deps.sfu) throw new ErroHttp(503, 'O servidor ainda não tem as credenciais do Cloudflare Realtime configuradas.');
  return deps.sfu;
}

async function lerJson<T>(req: Request, opcional = false): Promise<T | null> {
  const texto = await req.text();
  if (!texto.trim()) {
    if (opcional) return null;
    throw new ErroHttp(400, 'Corpo da requisição vazio.');
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErroHttp(400, 'JSON inválido.');
  }
}

function lerDescricao(valor: unknown, tipo: DescricaoDeSessao['type']): DescricaoDeSessao {
  const d = valor as Partial<DescricaoDeSessao> | undefined;
  if (d?.type !== tipo || typeof d.sdp !== 'string' || !d.sdp || d.sdp.length > MAX_SDP) {
    throw new ErroHttp(400, `Envie sessionDescription do tipo "${tipo}".`);
  }
  return { type: tipo, sdp: d.sdp };
}

function lerFaixas(valor: unknown): FaixaLocal[] {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAX_FAIXAS) {
    throw new ErroHttp(400, `Envie de 1 a ${MAX_FAIXAS} faixas em "tracks".`);
  }
  const faixas = valor.map((f: Partial<FaixaLocal>) => {
    if (typeof f?.mid !== 'string' || !f.mid || typeof f.trackName !== 'string' || !NOME_DE_FAIXA.test(f.trackName)) {
      throw new ErroHttp(400, 'Cada faixa precisa de "mid" e de um "trackName" simples (ex.: "video").');
    }
    return { mid: f.mid, trackName: f.trackName };
  });
  if (new Set(faixas.map((f) => f.trackName)).size !== faixas.length) throw new ErroHttp(400, 'Nomes de faixa repetidos.');
  return faixas;
}

const agora = (deps: Dependencias) => (deps.agora ?? Date.now)();

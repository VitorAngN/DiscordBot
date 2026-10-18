// Rotas /api/*. Recebe as dependências por parâmetro para ser testável fora do runtime dos Workers.
import type { AvisoNoDiscord } from './discord';
import {
  abandonada,
  encerrar,
  gerarIdDeSala,
  gerarToken,
  hashDe,
  marcarAoVivo,
  MAX_NOME,
  MAX_TITULO,
  NOME_PADRAO,
  nomeDaQualidade,
  novaSala,
  registrarAviso,
  registrarPublicacao,
  registrarSinal,
  resumoPublico,
  segredosIguais,
  TITULO_PADRAO,
  type DadosDaSala,
  type RepositorioDeSalas,
} from './salas';
import { ErroSfu, type ClienteSfu, type DescricaoDeSessao, type FaixaLocal } from './sfu';
import { chaveDoCliente, type ControleDeTentativas } from './tentativas';
import { JANELA_DIAS, type MedidorDeUso } from './uso';
import { QUALIDADE_PADRAO, qualidadeValida, taxaPorEspectador } from '../public/js/qualidade.js';

export interface Dependencias {
  salas: RepositorioDeSalas;
  /** `null` quando o servidor ainda não tem as credenciais do Realtime. */
  sfu: ClienteSfu | null;
  /** Senha para criar salas; vazia quando ainda não foi configurada. */
  chaveDeTransmissao: string;
  /** Senha para assistir; vazia deixa assistir só com o link. */
  chaveDeAssistir: string;
  uso: MedidorDeUso;
  /** Acima disso (em bytes nos últimos 31 dias), ninguém transmite nem assiste. */
  limiteDeUso: number;
  tentativas: ControleDeTentativas;
  /** `null` quando o servidor não tem o bot e o canal de avisos configurados. */
  discord: AvisoNoDiscord | null;
  agora?: () => number;
}

/** Resultado do aviso no Discord ao ficar ao vivo, para a página mostrar. */
export type SituacaoDoAviso = 'publicado' | 'ja-publicado' | 'desligado' | 'nao-configurado' | 'falhou';

const MENSAGEM_LIMITE =
  'O limite grátis de transmissão foi atingido. Ela volta sozinha quando o uso dos últimos 31 dias baixar.';
const MENSAGEM_BLOQUEIO = 'Muitas senhas erradas seguidas. Espere uns 15 minutos e tente de novo.';

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

/** A API nunca deve aparecer em buscadores nem ficar guardada em cache. */
const CABECALHOS_DA_API = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CABECALHOS_DA_API },
  });

const semConteudo = () => new Response(null, { status: 204, headers: CABECALHOS_DA_API });

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
  if (api === 'api' && recurso === 'uso' && !id) {
    if (req.method !== 'GET') throw new ErroHttp(405, 'Use GET para consultar o uso.');
    return consultarUso(req, deps);
  }
  if (api !== 'api' || recurso !== 'salas' || resto.length > 0) throw new ErroHttp(404, 'Rota não encontrada.');

  if (!id) {
    if (req.method !== 'POST') throw new ErroHttp(405, 'Use POST para criar uma sala.');
    return criarSala(req, deps, url.origin);
  }

  if (!ID_DE_SALA.test(id)) throw new ErroHttp(404, 'Sala não encontrada.');
  let sala = await deps.salas.obter(id);
  if (!sala) throw new ErroHttp(404, 'Sala não encontrada.');
  // Quem transmitia sumiu (fechou o app sem encerrar): encerra agora, sem esperar o alarme da sala
  if (abandonada(sala, agora(deps))) {
    sala = await finalizarSala(sala, deps.discord, agora(deps));
    await deps.salas.salvar(id, sala);
  }
  const ctx = { req, deps, id, sala };

  const rota = `${req.method} ${[acao, sessao && ':sessao', subacao].filter(Boolean).join('/')}`;
  switch (rota) {
    case 'GET ':
      await exigirEspectador(req, deps);
      return json(resumoPublico(sala));
    case 'DELETE ':
      return encerrarSala(ctx);
    case 'POST publicar':
      return publicar(ctx);
    case 'POST ao-vivo':
      return confirmarAoVivo(ctx, url.origin);
    case 'POST sinal':
      return receberSinal(ctx);
    case 'POST assistir':
      return assistir(ctx);
    case 'POST assistir/:sessao/resposta':
      return responder(ctx, sessao!);
    case 'POST assistir/:sessao/presenca':
      return registrarPresenca(ctx, sessao!);
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
  await exigirChaveDeTransmissao(req, deps);
  await exigirCota(deps);

  const corpo = await lerJson<{ titulo?: unknown; qualidade?: unknown; nome?: unknown; avisar?: unknown }>(req, true);
  const titulo = textoLimitado(corpo?.titulo, MAX_TITULO) ?? TITULO_PADRAO;
  const nome = textoLimitado(corpo?.nome, MAX_NOME) ?? NOME_PADRAO;
  const avisar = corpo?.avisar !== false;
  const qualidade = corpo?.qualidade ?? QUALIDADE_PADRAO;
  if (typeof qualidade !== 'string' || !qualidadeValida(qualidade)) {
    throw new ErroHttp(400, 'Qualidade inválida. Use 1080p60, 1080p30, 720p60 ou 720p30.');
  }

  let id = gerarIdDeSala();
  while (await deps.salas.obter(id)) id = gerarIdDeSala();
  const token = gerarToken();
  await deps.salas.salvar(id, novaSala(titulo, qualidade, await hashDe(token), agora(deps), { nome, avisar }));

  return json({ sala: id, link: `${origem}/s/${id}`, token }, 201);
}

async function publicar({ req, deps, id, sala }: Contexto): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'Esta sala já foi encerrada.');
  await exigirCota(deps);
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

/**
 * A conexão de quem transmite subiu: a sala fica ao vivo e, na primeira vez, o bot posta o aviso
 * no Discord. Se o Discord falhar, a transmissão segue; a resposta só conta o que houve com o aviso.
 */
async function confirmarAoVivo({ req, deps, id, sala }: Contexto, origem: string): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'Esta sala já foi encerrada.');
  if (!sala.publicacao) throw new ErroHttp(409, 'Publique as faixas antes de ficar ao vivo.');

  const inicio = agora(deps);
  let aoVivo = marcarAoVivo(sala, inicio);
  let discord: SituacaoDoAviso;
  if (sala.aviso) discord = 'ja-publicado'; // reconexão de quem transmite: a mensagem já está lá
  else if (sala.avisar === false) {
    console.log('Aviso no Discord desligado por quem transmite.');
    discord = 'desligado';
  } else if (!deps.discord) {
    console.warn('Aviso no Discord não configurado: faltam DISCORD_BOT_TOKEN ou DISCORD_CANAL_AVISOS.');
    discord = 'nao-configurado';
  } else {
    try {
      const mensagemId = await deps.discord.publicar({
        nome: sala.nome ?? NOME_PADRAO,
        titulo: sala.titulo,
        qualidade: nomeDaQualidade(sala),
        link: `${origem}/s/${id}`,
        inicio,
      });
      aoVivo = registrarAviso(aoVivo, { mensagemId, inicio });
      console.log(`Aviso postado no Discord (mensagem ${mensagemId}).`);
      discord = 'publicado';
    } catch (e) {
      console.error('Não deu para postar o aviso no Discord:', e);
      discord = 'falhou';
    }
  }
  await deps.salas.salvar(id, aoVivo);
  return json({ discord });
}

/** Sinal de vida de quem transmite (a cada 20 s). Sem ele por 2 minutos, a sala encerra sozinha. */
async function receberSinal({ req, deps, id, sala }: Contexto): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'A transmissão foi encerrada.');
  await deps.salas.salvar(id, registrarSinal(sala, agora(deps)));
  return semConteudo();
}

async function assistir({ req, deps, sala }: Contexto): Promise<Response> {
  await exigirEspectador(req, deps);
  if (sala.estado === 'encerrada') throw new ErroHttp(410, 'A transmissão terminou.');
  if (sala.estado !== 'ao-vivo' || !sala.publicacao) throw new ErroHttp(409, 'A transmissão ainda não começou.');
  await exigirCota(deps);
  const sfu = exigirSfu(deps);

  const sessionId = await sfu.novaSessao();
  const { oferta, faixas } = await sfu.assinar(sessionId, sala.publicacao.sessionId, sala.publicacao.faixas);
  await deps.uso.iniciar(sessionId, taxaPorEspectador(sala.qualidade));
  return json({ sessionId, sessionDescription: oferta, faixas, publicacao: sala.publicacao.numero });
}

async function responder({ req, deps }: Contexto, sessao: string): Promise<Response> {
  await exigirEspectador(req, deps);
  if (!ID_DE_SESSAO.test(sessao)) throw new ErroHttp(400, 'Sessão inválida.');
  const sfu = exigirSfu(deps);
  const corpo = await lerJson<{ sessionDescription?: unknown }>(req);
  await sfu.renegociar(sessao, lerDescricao(corpo?.sessionDescription, 'answer'));
  return semConteudo();
}

/**
 * Quem assiste avisa periodicamente que continua conectado; é isso que alimenta a trava de uso.
 * A resposta diz se pode continuar e, se não, por quê.
 */
async function registrarPresenca({ req, deps, sala }: Contexto, sessao: string): Promise<Response> {
  await exigirEspectador(req, deps);
  if (!ID_DE_SESSAO.test(sessao)) throw new ErroHttp(400, 'Sessão inválida.');
  const total = await deps.uso.presenca(sessao);

  let motivo: 'encerrada' | 'limite' | 'aguardando' | null = null;
  if (sala.estado === 'encerrada') motivo = 'encerrada';
  else if (total >= deps.limiteDeUso) motivo = 'limite';
  else if (sala.estado !== 'ao-vivo') motivo = 'aguardando';

  return json({ continuar: motivo === null, motivo, publicacao: resumoPublico(sala).publicacao });
}

async function consultarUso(req: Request, deps: Dependencias): Promise<Response> {
  await exigirChaveDeTransmissao(req, deps);
  const usado = await deps.uso.total();
  return json({ usado, limite: deps.limiteDeUso, janelaDias: JANELA_DIAS, atingido: usado >= deps.limiteDeUso });
}

async function encerrarSala({ req, deps, id, sala }: Contexto): Promise<Response> {
  await exigirTransmissor(req, sala);
  if (sala.estado !== 'encerrada') await deps.salas.salvar(id, await finalizarSala(sala, deps.discord, agora(deps)));
  return semConteudo();
}

/**
 * Encerra a sala e troca o aviso do Discord por "encerrou" (melhor esforço: se o Discord falhar,
 * a sala encerra do mesmo jeito). Usado ao encerrar, ao achar a sala abandonada e pelo alarme dela.
 */
export async function finalizarSala(sala: DadosDaSala, discord: AvisoNoDiscord | null, agora: number): Promise<DadosDaSala> {
  if (sala.aviso && discord) {
    try {
      await discord.encerrar(sala.aviso.mensagemId, {
        nome: sala.nome ?? NOME_PADRAO,
        titulo: sala.titulo,
        qualidade: nomeDaQualidade(sala),
        inicio: sala.aviso.inicio,
      }, agora);
      console.log(`Aviso no Discord trocado para "encerrou" (mensagem ${sala.aviso.mensagemId}).`);
    } catch (e) {
      console.error('Não deu para atualizar o aviso no Discord:', e);
    }
  }
  return encerrar(sala);
}

// --- Validações ---

/** Texto não vazio, sem espaços nas pontas e cortado no tamanho máximo; senão `null`. */
function textoLimitado(valor: unknown, maximo: number): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, maximo) : null;
}

function tokenDe(req: Request): string | null {
  const cabecalho = req.headers.get('Authorization') ?? '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() || null : null;
}

/**
 * Confere uma senha com limite de tentativas por IP: quem erra demais fica bloqueado por um tempo,
 * mesmo que depois acerte. Pedido sem senha não conta como tentativa (ainda não é um chute).
 */
async function conferirSenha(req: Request, deps: Dependencias, esperada: string, mensagemDeErro: string) {
  const cliente = chaveDoCliente(req);
  if (await deps.tentativas.bloqueado(cliente)) throw new ErroHttp(429, MENSAGEM_BLOQUEIO);
  const recebida = tokenDe(req);
  if (recebida && (await segredosIguais(recebida, esperada))) return;
  if (recebida) await deps.tentativas.registrarFalha(cliente);
  throw new ErroHttp(401, mensagemDeErro);
}

async function exigirChaveDeTransmissao(req: Request, deps: Dependencias) {
  if (!deps.chaveDeTransmissao) throw new ErroHttp(503, 'O servidor ainda não tem a chave de transmissão configurada.');
  await conferirSenha(req, deps, deps.chaveDeTransmissao, 'Chave de transmissão inválida.');
}

/** Com a senha de assistir configurada, só quem a tem vê a sala. */
async function exigirEspectador(req: Request, deps: Dependencias) {
  if (!deps.chaveDeAssistir) return;
  await conferirSenha(req, deps, deps.chaveDeAssistir, 'Senha para assistir inválida.');
}

async function exigirCota(deps: Dependencias) {
  if ((await deps.uso.total()) >= deps.limiteDeUso) throw new ErroHttp(429, MENSAGEM_LIMITE);
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

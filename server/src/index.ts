import { DurableObject } from 'cloudflare:workers';
import { finalizarSala, tratarApi } from './api';
import { criarAvisoNoDiscord, type AvisoNoDiscord } from './discord';
import {
  abandonada,
  contarEspectadores,
  marcarEspectador,
  SEM_SINAL_MS,
  type DadosDaSala,
  type Espectadores,
  type RepositorioDeSalas,
} from './salas';
import { criarClienteSfu } from './sfu';
import {
  ESTADO_INICIAL,
  estaBloqueado,
  expiraEm,
  registrarFalha,
  type ControleDeTentativas,
  type EstadoDeTentativas,
} from './tentativas';
import { ContadorDeUso, DIA_MS, limiteEmBytes, TAXA_ESTIMADA_BPS, type MedidorDeUso, type SessaoDeUso } from './uso';

export interface Env {
  SALAS: DurableObjectNamespace<Sala>;
  USO: DurableObjectNamespace<Uso>;
  TENTATIVAS: DurableObjectNamespace<Tentativas>;
  ASSETS: Fetcher;
  REALTIME_APP_ID?: string;
  REALTIME_APP_SECRET?: string;
  TRANSMISSAO_CHAVE?: string;
  ASSISTIR_CHAVE?: string;
  LIMITE_GB_MES?: string;
  /** Token do bot que posta os avisos (o mesmo do bot/.env) e o canal onde ele posta. */
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CANAL_AVISOS?: string;
}

/** Salas sem atividade por mais tempo que isso são apagadas. */
const VALIDADE_MS = 24 * 60 * 60 * 1000;

function avisoNoDiscord(env: Env): AvisoNoDiscord | null {
  const { DISCORD_BOT_TOKEN: token, DISCORD_CANAL_AVISOS: canal } = env;
  return token && canal ? criarAvisoNoDiscord(token, canal) : null;
}

/**
 * Uma instância por sala. Ao vivo, o alarme confere o sinal de quem transmite: sem sinal por
 * `SEM_SINAL_MS`, encerra a sala e atualiza o aviso do Discord. Parada, ela se apaga depois de um dia.
 */
export class Sala extends DurableObject<Env> {
  async obter(): Promise<DadosDaSala | null> {
    return (await this.ctx.storage.get<DadosDaSala>('sala')) ?? null;
  }

  async salvar(sala: DadosDaSala): Promise<void> {
    await this.ctx.storage.put('sala', sala);
    const proximo = sala.estado === 'ao-vivo' ? Date.now() + SEM_SINAL_MS + 5_000 : Date.now() + VALIDADE_MS;
    await this.ctx.storage.setAlarm(proximo);
  }

  async marcarEspectador(sessao: string, agora: number): Promise<void> {
    await this.ctx.storage.put('espectadores', marcarEspectador(await this.espectadores(), sessao, agora));
  }

  async contarEspectadores(agora: number): Promise<number> {
    return contarEspectadores(await this.espectadores(), agora);
  }

  private async espectadores(): Promise<Espectadores> {
    return (await this.ctx.storage.get<Espectadores>('espectadores')) ?? {};
  }

  override async alarm(): Promise<void> {
    const sala = await this.obter();
    if (!sala) return;
    const agora = Date.now();
    if (abandonada(sala, agora)) {
      await this.salvar(await finalizarSala(sala, avisoNoDiscord(this.env), agora));
    } else if (sala.estado === 'ao-vivo') {
      await this.ctx.storage.setAlarm((sala.ultimoSinal ?? agora) + SEM_SINAL_MS + 5_000);
    } else {
      await this.ctx.storage.deleteAll();
    }
  }
}

/** Versões anteriores guardavam só o horário (número); essas contam no pior caso de qualidade. */
type SessaoGuardada = SessaoDeUso | number;

function lerSessao(valor: SessaoGuardada | undefined): SessaoDeUso | undefined {
  return typeof valor === 'number' ? { visto: valor, taxa: TAXA_ESTIMADA_BPS } : valor;
}

/** Instância única que soma o uso de todas as salas, por dia. */
export class Uso extends DurableObject<Env> {
  readonly #contador: ContadorDeUso;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const storage = ctx.storage;
    this.#contador = new ContadorDeUso({
      sessao: async (id) => lerSessao(await storage.get<SessaoGuardada>(`sessao:${id}`)),
      salvarSessao: (id, sessao) => storage.put(`sessao:${id}`, sessao),
      somarNoDia: async (dia, bytes) => storage.put(`dia:${dia}`, ((await storage.get<number>(`dia:${dia}`)) ?? 0) + bytes),
      dias: async () => {
        const dias = await storage.list<number>({ prefix: 'dia:' });
        return new Map([...dias].map(([chave, bytes]) => [chave.slice('dia:'.length), bytes]));
      },
      apagarDias: async (dias) => {
        await storage.delete(dias.map((dia) => `dia:${dia}`));
      },
    });
  }

  async iniciar(sessao: string, taxaBps: number): Promise<void> {
    await this.#contador.iniciar(sessao, taxaBps);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + DIA_MS);
  }

  presenca(sessao: string): Promise<number> {
    return this.#contador.presenca(sessao);
  }

  total(): Promise<number> {
    return this.#contador.total();
  }

  /** Uma vez por dia, esquece as sessões que pararam de assistir. */
  override async alarm(): Promise<void> {
    const antes = Date.now() - DIA_MS;
    const sessoes = await this.ctx.storage.list<SessaoGuardada>({ prefix: 'sessao:' });
    const paradas = [...sessoes].filter(([, valor]) => lerSessao(valor)!.visto < antes).map(([chave]) => chave);
    for (let i = 0; i < paradas.length; i += 128) await this.ctx.storage.delete(paradas.slice(i, i + 128));
    if (sessoes.size > paradas.length) await this.ctx.storage.setAlarm(Date.now() + DIA_MS);
  }
}

/** Uma instância por IP: conta as senhas erradas dele e bloqueia por um tempo quando passa do limite. */
export class Tentativas extends DurableObject<Env> {
  async bloqueado(): Promise<boolean> {
    return estaBloqueado(await this.estado(), Date.now());
  }

  async registrarFalha(): Promise<void> {
    const novo = registrarFalha(await this.estado(), Date.now());
    await this.ctx.storage.put('estado', novo);
    await this.ctx.storage.setAlarm(expiraEm(novo)); // depois disso, nada mais importa
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async estado(): Promise<EstadoDeTentativas> {
    return (await this.ctx.storage.get<EstadoDeTentativas>('estado')) ?? ESTADO_INICIAL;
  }
}

function controleDeTentativas(tentativas: DurableObjectNamespace<Tentativas>): ControleDeTentativas {
  const de = (cliente: string) => tentativas.get(tentativas.idFromName(cliente));
  return {
    bloqueado: (cliente) => de(cliente).bloqueado(),
    registrarFalha: (cliente) => de(cliente).registrarFalha(),
  };
}

function repositorio(salas: DurableObjectNamespace<Sala>): RepositorioDeSalas {
  const sala = (id: string) => salas.get(salas.idFromName(id));
  return {
    obter: (id) => sala(id).obter(),
    salvar: (id, dados) => sala(id).salvar(dados),
    marcarEspectador: (id, sessao, agora) => sala(id).marcarEspectador(sessao, agora),
    contarEspectadores: (id, agora) => sala(id).contarEspectadores(agora),
  };
}

function medidor(uso: DurableObjectNamespace<Uso>): MedidorDeUso {
  const global = uso.get(uso.idFromName('global'));
  return {
    iniciar: (sessao, taxaBps) => global.iniciar(sessao, taxaBps),
    presenca: (sessao) => global.presenca(sessao),
    total: () => global.total(),
  };
}

const LINK_DE_SALA = /^\/s\/[0-9A-Za-z]{10}\/?$/;

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/api/')) {
      const { REALTIME_APP_ID: appId, REALTIME_APP_SECRET: segredo } = env;
      return tratarApi(req, {
        salas: repositorio(env.SALAS),
        sfu: appId && segredo ? criarClienteSfu(appId, segredo) : null,
        chaveDeTransmissao: env.TRANSMISSAO_CHAVE ?? '',
        chaveDeAssistir: env.ASSISTIR_CHAVE ?? '',
        uso: medidor(env.USO),
        limiteDeUso: limiteEmBytes(env.LIMITE_GB_MES),
        tentativas: controleDeTentativas(env.TENTATIVAS),
        discord: avisoNoDiscord(env),
      });
    }

    // Link curto que vai para o Discord: /s/<sala> abre a página de assistir
    if (LINK_DE_SALA.test(url.pathname)) {
      return comCabecalhosDeSeguranca(await env.ASSETS.fetch(new Request(new URL('/assistir', url), req)));
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

/**
 * Os arquivos estáticos recebem esses cabeçalhos pelo public/_headers; a página que o Worker
 * entrega em /s/<sala> recebe aqui, para não depender de o _headers valer nesse caminho.
 */
function comCabecalhosDeSeguranca(resposta: Response): Response {
  const nova = new Response(resposta.body, resposta);
  nova.headers.set('X-Robots-Tag', 'noindex, nofollow');
  nova.headers.set('Referrer-Policy', 'no-referrer');
  nova.headers.set('X-Content-Type-Options', 'nosniff');
  nova.headers.set('X-Frame-Options', 'DENY');
  nova.headers.set('Content-Security-Policy', POLITICA_DE_CONTEUDO);
  return nova;
}

/** Igual à do public/_headers: só scripts e estilos do próprio servidor, e nada de ser embutido em outro site. */
const POLITICA_DE_CONTEUDO =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

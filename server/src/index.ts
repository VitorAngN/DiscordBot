import { DurableObject } from 'cloudflare:workers';
import { tratarApi } from './api';
import type { DadosDaSala, RepositorioDeSalas } from './salas';
import { criarClienteSfu } from './sfu';
import { ContadorDeUso, DIA_MS, limiteEmBytes, TAXA_ESTIMADA_BPS, type MedidorDeUso, type SessaoDeUso } from './uso';

export interface Env {
  SALAS: DurableObjectNamespace<Sala>;
  USO: DurableObjectNamespace<Uso>;
  ASSETS: Fetcher;
  REALTIME_APP_ID?: string;
  REALTIME_APP_SECRET?: string;
  TRANSMISSAO_CHAVE?: string;
  ASSISTIR_CHAVE?: string;
  LIMITE_GB_MES?: string;
}

/** Salas sem atividade por mais tempo que isso são apagadas. */
const VALIDADE_MS = 24 * 60 * 60 * 1000;

/** Uma instância por sala: guarda os dados dela e se apaga sozinha depois de um dia parada. */
export class Sala extends DurableObject<Env> {
  async obter(): Promise<DadosDaSala | null> {
    return (await this.ctx.storage.get<DadosDaSala>('sala')) ?? null;
  }

  async salvar(sala: DadosDaSala): Promise<void> {
    await this.ctx.storage.put('sala', sala);
    await this.ctx.storage.setAlarm(Date.now() + VALIDADE_MS);
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
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

function repositorio(salas: DurableObjectNamespace<Sala>): RepositorioDeSalas {
  const sala = (id: string) => salas.get(salas.idFromName(id));
  return {
    obter: (id) => sala(id).obter(),
    salvar: (id, dados) => sala(id).salvar(dados),
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
      });
    }

    // Link curto que vai para o Discord: /s/<sala> abre a página de assistir
    if (LINK_DE_SALA.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/assistir', url), req));
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

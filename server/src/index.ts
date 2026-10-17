import { DurableObject } from 'cloudflare:workers';
import { tratarApi } from './api';
import type { DadosDaSala, RepositorioDeSalas } from './salas';
import { criarClienteSfu } from './sfu';

export interface Env {
  SALAS: DurableObjectNamespace<Sala>;
  ASSETS: Fetcher;
  REALTIME_APP_ID?: string;
  REALTIME_APP_SECRET?: string;
  TRANSMISSAO_CHAVE?: string;
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

function repositorio(salas: DurableObjectNamespace<Sala>): RepositorioDeSalas {
  const sala = (id: string) => salas.get(salas.idFromName(id));
  return {
    obter: (id) => sala(id).obter(),
    salvar: (id, dados) => sala(id).salvar(dados),
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
      });
    }

    // Link curto que vai para o Discord: /s/<sala> abre a página de assistir
    if (LINK_DE_SALA.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/assistir', url), req));
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

// Regras das salas, sem depender do armazenamento.
import { QUALIDADES } from '../public/js/qualidade.js';

/**
 * `aguardando`: criada, ainda sem vídeo confirmado.
 * `ao-vivo`: o transmissor está conectado ao SFU.
 * `encerrada`: o transmissor encerrou; a sala não volta.
 */
export type EstadoDaSala = 'aguardando' | 'ao-vivo' | 'encerrada';

export interface Publicacao {
  sessionId: string;
  faixas: string[];
  /** Aumenta a cada nova publicação, para quem assiste saber que precisa reconectar. */
  numero: number;
  inicio: number;
}

/** Mensagem que o bot postou no Discord quando a sala ficou ao vivo. */
export interface AvisoPostado {
  mensagemId: string;
  inicio: number;
}

export interface DadosDaSala {
  titulo: string;
  /** Chave de `QUALIDADES`. Salas antigas não têm (contam como a mais alta). */
  qualidade?: string;
  /** Quem transmite, como aparece no aviso do Discord. */
  nome?: string;
  /** Postar o aviso no Discord ao ficar ao vivo. */
  avisar?: boolean;
  aviso?: AvisoPostado | null;
  /** Último sinal de vida de quem transmite (a página manda a cada 20 s). */
  ultimoSinal?: number;
  criadaEm: number;
  hashDoToken: string;
  estado: EstadoDaSala;
  publicacao: Publicacao | null;
}

export interface RepositorioDeSalas {
  obter(id: string): Promise<DadosDaSala | null>;
  salvar(id: string, sala: DadosDaSala): Promise<void>;
}

export const TITULO_PADRAO = 'Transmissão';
export const MAX_TITULO = 100;
export const NOME_PADRAO = 'Alguém';
export const MAX_NOME = 40;
/**
 * Ao vivo sem sinal de quem transmite por mais que isso: o app fechou ou a internet caiu; a sala encerra.
 * O sinal vem a cada 20 s, mas o navegador pode atrasar timers de janelas minimizadas para 1 por minuto.
 */
export const SEM_SINAL_MS = 2 * 60_000;

export function novaSala(
  titulo: string,
  qualidade: string,
  hashDoToken: string,
  agora: number,
  { nome = NOME_PADRAO, avisar = true }: { nome?: string; avisar?: boolean } = {},
): DadosDaSala {
  return { titulo, qualidade, nome, avisar, aviso: null, criadaEm: agora, hashDoToken, estado: 'aguardando', publicacao: null };
}

/** Nova conexão do transmissor ao SFU. Fica `aguardando` até ele confirmar que conectou. */
export function registrarPublicacao(sala: DadosDaSala, sessionId: string, faixas: string[], agora: number): DadosDaSala {
  const numero = (sala.publicacao?.numero ?? 0) + 1;
  return { ...sala, estado: 'aguardando', publicacao: { sessionId, faixas, numero, inicio: agora } };
}

export function marcarAoVivo(sala: DadosDaSala, agora: number): DadosDaSala {
  return { ...sala, estado: 'ao-vivo', ultimoSinal: agora };
}

export function registrarSinal(sala: DadosDaSala, agora: number): DadosDaSala {
  return { ...sala, ultimoSinal: agora };
}

export function registrarAviso(sala: DadosDaSala, aviso: AvisoPostado): DadosDaSala {
  return { ...sala, aviso };
}

/** Ao vivo, mas quem transmite sumiu (sem sinal há mais de `SEM_SINAL_MS`). */
export function abandonada(sala: DadosDaSala, agora: number): boolean {
  const ultimo = sala.ultimoSinal ?? sala.publicacao?.inicio ?? sala.criadaEm;
  return sala.estado === 'ao-vivo' && agora - ultimo > SEM_SINAL_MS;
}

export function encerrar(sala: DadosDaSala): DadosDaSala {
  return { ...sala, estado: 'encerrada', publicacao: null };
}

/** O que qualquer pessoa com o link pode ver (sem IDs de sessão nem token). */
export function resumoPublico(sala: DadosDaSala) {
  return {
    titulo: sala.titulo,
    nome: sala.nome ?? null,
    qualidade: nomeDaQualidade(sala),
    estado: sala.estado,
    publicacao: sala.estado === 'ao-vivo' ? (sala.publicacao?.numero ?? null) : null,
    inicio: sala.estado === 'ao-vivo' ? (sala.publicacao?.inicio ?? null) : null,
  };
}

export function nomeDaQualidade(sala: DadosDaSala): string | null {
  return (sala.qualidade && QUALIDADES[sala.qualidade]?.nome) || null;
}

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** ID curto e difícil de adivinhar, bom para link (62^10 combinações). */
export function gerarIdDeSala(tamanho = 10): string {
  // 248 é o maior múltiplo de 62 abaixo de 256: descartar o resto evita viés
  let id = '';
  while (id.length < tamanho) {
    for (const byte of crypto.getRandomValues(new Uint8Array(tamanho * 2))) {
      if (byte < 248 && id.length < tamanho) id += ALFABETO[byte % 62];
    }
  }
  return id;
}

/** Token do transmissor: 32 bytes aleatórios em base64url. */
export function gerarToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function hashDe(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compara dois segredos pelo hash, com tempo constante. */
export async function segredosIguais(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hashDe(a), hashDe(b)]);
  let diferenca = 0;
  for (let i = 0; i < ha.length; i++) diferenca |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diferenca === 0;
}

// Regras das salas, sem depender do armazenamento.

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

export interface DadosDaSala {
  titulo: string;
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

export function novaSala(titulo: string, hashDoToken: string, agora: number): DadosDaSala {
  return { titulo, criadaEm: agora, hashDoToken, estado: 'aguardando', publicacao: null };
}

/** Nova conexão do transmissor ao SFU. Fica `aguardando` até ele confirmar que conectou. */
export function registrarPublicacao(sala: DadosDaSala, sessionId: string, faixas: string[], agora: number): DadosDaSala {
  const numero = (sala.publicacao?.numero ?? 0) + 1;
  return { ...sala, estado: 'aguardando', publicacao: { sessionId, faixas, numero, inicio: agora } };
}

export function marcarAoVivo(sala: DadosDaSala): DadosDaSala {
  return { ...sala, estado: 'ao-vivo' };
}

export function encerrar(sala: DadosDaSala): DadosDaSala {
  return { ...sala, estado: 'encerrada', publicacao: null };
}

/** O que qualquer pessoa com o link pode ver (sem IDs de sessão nem token). */
export function resumoPublico(sala: DadosDaSala) {
  return {
    titulo: sala.titulo,
    estado: sala.estado,
    publicacao: sala.estado === 'ao-vivo' ? (sala.publicacao?.numero ?? null) : null,
    inicio: sala.estado === 'ao-vivo' ? (sala.publicacao?.inicio ?? null) : null,
  };
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

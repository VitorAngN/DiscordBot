// Limite de tentativas de senha: depois de várias senhas erradas seguidas, o endereço (IP) fica
// bloqueado por um tempo. Assim ninguém consegue ficar chutando as senhas.

/** Senhas erradas permitidas dentro da janela antes de bloquear. */
export const MAX_FALHAS = 8;
export const JANELA_MS = 10 * 60_000;
export const BLOQUEIO_MS = 15 * 60_000;

/** Usado pela API; quem implementa é o Durable Object `Tentativas` (um por IP). */
export interface ControleDeTentativas {
  bloqueado(chave: string): Promise<boolean>;
  registrarFalha(chave: string): Promise<void>;
}

export interface EstadoDeTentativas {
  /** Quando cada senha errada recente aconteceu. */
  falhas: number[];
  bloqueadoAte: number;
}

export const ESTADO_INICIAL: EstadoDeTentativas = { falhas: [], bloqueadoAte: 0 };

export function estaBloqueado(estado: EstadoDeTentativas, agora: number): boolean {
  return estado.bloqueadoAte > agora;
}

/** Registra uma senha errada; ao chegar no máximo dentro da janela, bloqueia. */
export function registrarFalha(estado: EstadoDeTentativas, agora: number): EstadoDeTentativas {
  const falhas = [...estado.falhas.filter((quando) => agora - quando < JANELA_MS), agora];
  if (falhas.length >= MAX_FALHAS) return { falhas: [], bloqueadoAte: agora + BLOQUEIO_MS };
  return { falhas, bloqueadoAte: estado.bloqueadoAte };
}

/** Quando o estado pode ser apagado (nada mais importa depois disso). */
export function expiraEm(estado: EstadoDeTentativas): number {
  return Math.max(estado.bloqueadoAte, ...estado.falhas.map((quando) => quando + JANELA_MS));
}

/** Endereço de quem fez o pedido, como a Cloudflare informa. */
export function chaveDoCliente(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'desconhecido';
}

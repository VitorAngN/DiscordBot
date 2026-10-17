// Trava de uso: estima quanto os espectadores já receberam e bloqueia antes de passar da cota grátis.
// O Realtime só cobra o que sai da Cloudflare para quem assiste; quem transmite envia de graça.

/** A cota grátis vale por mês de cobrança, que pode não começar no dia 1: somar 31 dias cobre qualquer mês. */
export const JANELA_DIAS = 31;
export const DIA_MS = 86_400_000;

/** Pior caso por espectador: vídeo no máximo (6 Mbps), som e sobrecarga. Na prática, gasta menos. */
export const TAXA_ESTIMADA_BPS = 6_500_000;

/** Maior intervalo contado entre dois sinais de presença (cobre abas em segundo plano, que atrasam timers). */
export const MAX_INTERVALO_MS = 70_000;

/** Usado pela API; quem implementa é o Durable Object `Uso`. */
export interface MedidorDeUso {
  /** Começa a contar uma sessão de quem assiste. */
  iniciar(sessao: string): Promise<void>;
  /** A sessão continua assistindo; devolve o total da janela, em bytes. */
  presenca(sessao: string): Promise<number>;
  total(): Promise<number>;
}

export interface ArmazenamentoDeUso {
  vistoEm(sessao: string): Promise<number | undefined>;
  marcarVisto(sessao: string, quando: number): Promise<void>;
  somarNoDia(dia: string, bytes: number): Promise<void>;
  dias(): Promise<Map<string, number>>;
  apagarDias(dias: string[]): Promise<void>;
}

/** Dia em UTC, no formato AAAA-MM-DD (ordena como texto). */
export const diaDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function bytesEstimados(intervaloMs: number, taxaBps = TAXA_ESTIMADA_BPS): number {
  const contado = Math.min(Math.max(intervaloMs, 0), MAX_INTERVALO_MS);
  return Math.round((contado / 1000) * (taxaBps / 8));
}

export class ContadorDeUso implements MedidorDeUso {
  constructor(
    private readonly armazenamento: ArmazenamentoDeUso,
    private readonly agora: () => number = Date.now,
  ) {}

  async iniciar(sessao: string): Promise<void> {
    await this.armazenamento.marcarVisto(sessao, this.agora());
  }

  async presenca(sessao: string): Promise<number> {
    const agora = this.agora();
    const visto = await this.armazenamento.vistoEm(sessao);
    await this.armazenamento.marcarVisto(sessao, agora);
    // Sessão desconhecida só começa a contar a partir de agora
    if (visto !== undefined) await this.armazenamento.somarNoDia(diaDe(agora), bytesEstimados(agora - visto));
    return this.total();
  }

  async total(): Promise<number> {
    const primeiroDia = diaDe(this.agora() - (JANELA_DIAS - 1) * DIA_MS);
    let total = 0;
    const antigos: string[] = [];
    for (const [dia, bytes] of await this.armazenamento.dias()) {
      if (dia < primeiroDia) antigos.push(dia);
      else total += bytes;
    }
    if (antigos.length > 0) await this.armazenamento.apagarDias(antigos);
    return total;
  }
}

export const GB = 1_000_000_000;
export const LIMITE_PADRAO_GB = 900;
/** Cota grátis do Realtime por mês. A trava nunca passa disso. */
export const COTA_GRATIS_GB = 1_000;

/** Lê o limite configurado (em GB) e garante que fique dentro da cota grátis. */
export function limiteEmBytes(configurado: string | undefined): number {
  const gb = Number(configurado);
  const valido = Number.isFinite(gb) && gb > 0 ? gb : LIMITE_PADRAO_GB;
  return Math.min(valido, COTA_GRATIS_GB) * GB;
}

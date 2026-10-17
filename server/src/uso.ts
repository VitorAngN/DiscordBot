// Trava de uso: estima quanto os espectadores já receberam e bloqueia antes de passar da cota grátis.
// O Realtime só cobra o que sai da Cloudflare para quem assiste; quem transmite envia de graça.

/** A cota grátis vale por mês de cobrança, que pode não começar no dia 1: somar 31 dias cobre qualquer mês. */
export const JANELA_DIAS = 31;
export const DIA_MS = 86_400_000;

/** Pior caso quando não se sabe a qualidade: 1080p a 60 fps, som e sobrecarga. */
export const TAXA_ESTIMADA_BPS = 6_500_000;

/** Maior intervalo contado entre dois sinais de presença (cobre abas em segundo plano, que atrasam timers). */
export const MAX_INTERVALO_MS = 70_000;

/** Usado pela API; quem implementa é o Durable Object `Uso`. */
export interface MedidorDeUso {
  /** Começa a contar uma sessão de quem assiste, que recebe no máximo `taxaBps`. */
  iniciar(sessao: string, taxaBps: number): Promise<void>;
  /** A sessão continua assistindo; devolve o total da janela, em bytes. */
  presenca(sessao: string): Promise<number>;
  total(): Promise<number>;
}

export interface SessaoDeUso {
  visto: number;
  taxa: number;
}

export interface ArmazenamentoDeUso {
  sessao(id: string): Promise<SessaoDeUso | undefined>;
  salvarSessao(id: string, sessao: SessaoDeUso): Promise<void>;
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

  async iniciar(sessao: string, taxaBps: number): Promise<void> {
    await this.armazenamento.salvarSessao(sessao, { visto: this.agora(), taxa: taxaBps });
  }

  async presenca(sessao: string): Promise<number> {
    const agora = this.agora();
    const anterior = await this.armazenamento.sessao(sessao);
    await this.armazenamento.salvarSessao(sessao, { visto: agora, taxa: anterior?.taxa ?? TAXA_ESTIMADA_BPS });
    // Sessão desconhecida só começa a contar a partir de agora (no pior caso de qualidade)
    if (anterior) {
      await this.armazenamento.somarNoDia(diaDe(agora), bytesEstimados(agora - anterior.visto, anterior.taxa));
    }
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

import { describe, expect, it } from 'vitest';
import {
  bytesEstimados,
  ContadorDeUso,
  DIA_MS,
  GB,
  MAX_INTERVALO_MS,
  limiteEmBytes,
  TAXA_ESTIMADA_BPS,
  type ArmazenamentoDeUso,
  type SessaoDeUso,
} from '../src/uso';

const TAXA = TAXA_ESTIMADA_BPS;

function armazenamentoEmMemoria(): ArmazenamentoDeUso & { diasGuardados: Map<string, number> } {
  const sessoes = new Map<string, SessaoDeUso>();
  const diasGuardados = new Map<string, number>();
  return {
    diasGuardados,
    sessao: async (id) => sessoes.get(id),
    salvarSessao: async (id, s) => void sessoes.set(id, s),
    somarNoDia: async (d, b) => void diasGuardados.set(d, (diasGuardados.get(d) ?? 0) + b),
    dias: async () => new Map(diasGuardados),
    apagarDias: async (dias) => dias.forEach((d) => diasGuardados.delete(d)),
  };
}

function relogio(inicio = Date.UTC(2026, 9, 17, 12)) {
  let agora = inicio;
  return { agora: () => agora, avancar: (ms: number) => (agora += ms) };
}

describe('bytesEstimados', () => {
  it('conta o pior caso de 6,5 Mbps por espectador', () => {
    expect(bytesEstimados(1_000)).toBe(812_500);
  });

  it('não conta intervalos negativos nem maiores que o máximo', () => {
    expect(bytesEstimados(-5_000)).toBe(0);
    expect(bytesEstimados(10 * 60_000)).toBe(bytesEstimados(MAX_INTERVALO_MS));
  });
});

describe('ContadorDeUso', () => {
  it('soma o tempo entre o início e cada sinal de presença', async () => {
    const r = relogio();
    const contador = new ContadorDeUso(armazenamentoEmMemoria(), r.agora);

    await contador.iniciar('a', TAXA);
    r.avancar(15_000);
    expect(await contador.presenca('a')).toBe(bytesEstimados(15_000));
    r.avancar(15_000);
    expect(await contador.presenca('a')).toBe(2 * bytesEstimados(15_000));
  });

  it('soma vários espectadores ao mesmo tempo', async () => {
    const r = relogio();
    const contador = new ContadorDeUso(armazenamentoEmMemoria(), r.agora);
    await contador.iniciar('a', TAXA);
    await contador.iniciar('b', TAXA);
    r.avancar(10_000);
    await contador.presenca('a');

    expect(await contador.presenca('b')).toBe(2 * bytesEstimados(10_000));
  });

  it('conta cada espectador pela qualidade da sala que ele assiste', async () => {
    const r = relogio();
    const contador = new ContadorDeUso(armazenamentoEmMemoria(), r.agora);
    await contador.iniciar('720p', 3_000_000);
    r.avancar(10_000);

    expect(await contador.presenca('720p')).toBe(bytesEstimados(10_000, 3_000_000));
    expect(bytesEstimados(10_000, 3_000_000)).toBeLessThan(bytesEstimados(10_000));
  });

  it('sessão desconhecida só começa a contar a partir do primeiro sinal', async () => {
    const r = relogio();
    const contador = new ContadorDeUso(armazenamentoEmMemoria(), r.agora);

    expect(await contador.presenca('estranha')).toBe(0);
    r.avancar(15_000);
    expect(await contador.presenca('estranha')).toBe(bytesEstimados(15_000));
  });

  it('considera só os últimos 31 dias e apaga os mais antigos', async () => {
    const r = relogio();
    const armazenamento = armazenamentoEmMemoria();
    const contador = new ContadorDeUso(armazenamento, r.agora);
    await contador.iniciar('a', TAXA);
    r.avancar(15_000);
    await contador.presenca('a');

    r.avancar(30 * DIA_MS);
    expect(await contador.total()).toBe(bytesEstimados(15_000)); // 30 dias depois ainda conta

    r.avancar(DIA_MS);
    expect(await contador.total()).toBe(0);
    expect(armazenamento.diasGuardados.size).toBe(0);
  });
});

describe('limiteEmBytes', () => {
  it('usa 900 GB quando não há configuração válida', () => {
    for (const valor of [undefined, '', 'abc', '-1', '0']) expect(limiteEmBytes(valor)).toBe(900 * GB);
  });

  it('aceita um limite menor e nunca passa da cota grátis', () => {
    expect(limiteEmBytes('500')).toBe(500 * GB);
    expect(limiteEmBytes('5000')).toBe(1_000 * GB);
  });
});

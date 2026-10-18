import { describe, expect, it } from 'vitest';
import {
  BLOQUEIO_MS,
  chaveDoCliente,
  ESTADO_INICIAL,
  estaBloqueado,
  expiraEm,
  JANELA_MS,
  MAX_FALHAS,
  registrarFalha,
  type EstadoDeTentativas,
} from '../src/tentativas';

function errar(vezes: number, inicio = 1_000_000, intervalo = 1_000): { estado: EstadoDeTentativas; agora: number } {
  let estado = ESTADO_INICIAL;
  let agora = inicio;
  for (let i = 0; i < vezes; i++) {
    agora = inicio + i * intervalo;
    estado = registrarFalha(estado, agora);
  }
  return { estado, agora };
}

describe('limite de tentativas', () => {
  it('não bloqueia antes do máximo de senhas erradas', () => {
    const { estado, agora } = errar(MAX_FALHAS - 1);
    expect(estaBloqueado(estado, agora)).toBe(false);
  });

  it('bloqueia ao chegar no máximo, e o bloqueio acaba sozinho', () => {
    const { estado, agora } = errar(MAX_FALHAS);

    expect(estaBloqueado(estado, agora)).toBe(true);
    expect(estaBloqueado(estado, agora + BLOQUEIO_MS - 1)).toBe(true);
    expect(estaBloqueado(estado, agora + BLOQUEIO_MS)).toBe(false);
  });

  it('senhas erradas antigas (fora da janela) não somam', () => {
    // Uma errada a cada "janela inteira": nunca junta o máximo
    const { estado, agora } = errar(MAX_FALHAS * 2, 1_000_000, JANELA_MS);
    expect(estaBloqueado(estado, agora)).toBe(false);
    expect(estado.falhas).toHaveLength(1);
  });

  it('o estado pode ser apagado quando o bloqueio e a janela acabam', () => {
    const bloqueado = errar(MAX_FALHAS);
    expect(expiraEm(bloqueado.estado)).toBe(bloqueado.agora + BLOQUEIO_MS);

    const poucas = errar(2, 1_000_000);
    expect(expiraEm(poucas.estado)).toBe(poucas.agora + JANELA_MS);
  });

  it('identifica quem pediu pelo IP que a Cloudflare informa', () => {
    expect(chaveDoCliente(new Request('https://x.dev', { headers: { 'CF-Connecting-IP': '203.0.113.7' } }))).toBe('203.0.113.7');
    expect(chaveDoCliente(new Request('https://x.dev'))).toBe('desconhecido');
  });
});

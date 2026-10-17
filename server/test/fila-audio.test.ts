import { describe, expect, it } from 'vitest';
import { ALVO_QUADROS, FilaDeAudio, MAXIMO_QUADROS, pcmParaFloat32 } from '../public/js/fila-audio.js';

/** `quadros` quadros estéreo com o valor `v` nos dois canais. */
function blocos(quadros: number, v = 0.5) {
  return new Float32Array(quadros * 2).fill(v);
}

function tirar(fila: FilaDeAudio, n = 128) {
  const esquerda = new Float32Array(n).fill(9);
  const direita = new Float32Array(n).fill(9);
  fila.tirar(esquerda, direita);
  return { esquerda, direita };
}

describe('FilaDeAudio', () => {
  it('fica em silêncio até juntar o alvo, para não engasgar', () => {
    const fila = new FilaDeAudio();
    fila.adicionar(blocos(ALVO_QUADROS - 1));

    expect(tirar(fila).esquerda.every((v) => v === 0)).toBe(true);

    fila.adicionar(blocos(1));
    expect(tirar(fila).esquerda.every((v) => v === 0.5)).toBe(true);
  });

  it('mantém os canais esquerdo e direito separados', () => {
    const fila = new FilaDeAudio();
    const intercalado = new Float32Array(ALVO_QUADROS * 2);
    for (let i = 0; i < ALVO_QUADROS; i++) {
      intercalado[i * 2] = 0.25;
      intercalado[i * 2 + 1] = -0.25;
    }
    fila.adicionar(intercalado);

    const { esquerda, direita } = tirar(fila);
    expect(esquerda.every((v) => v === 0.25)).toBe(true);
    expect(direita.every((v) => v === -0.25)).toBe(true);
  });

  it('quando acaba o som, completa com silêncio e volta a esperar o alvo', () => {
    const fila = new FilaDeAudio();
    fila.adicionar(blocos(ALVO_QUADROS));
    for (let i = 0; i < Math.floor(ALVO_QUADROS / 128); i++) tirar(fila);

    const { esquerda } = tirar(fila); // sobram menos de 128 quadros
    expect(esquerda[0]).toBe(0.5);
    expect(esquerda[127]).toBe(0);

    fila.adicionar(blocos(10));
    expect(tirar(fila).esquerda.every((v) => v === 0)).toBe(true); // esperando juntar de novo
  });

  it('descarta o mais antigo quando acumula demais, para o atraso não crescer', () => {
    const fila = new FilaDeAudio();
    // Valores exatos em float32, para a comparação não falhar por arredondamento
    fila.adicionar(blocos(MAXIMO_QUADROS, 0.125));
    fila.adicionar(blocos(ALVO_QUADROS, 0.75));

    expect(fila.tamanho).toBe(ALVO_QUADROS);
    expect(tirar(fila).esquerda.every((v) => v === 0.75)).toBe(true);
  });
});

describe('pcmParaFloat32', () => {
  it('converte PCM 16 bits little-endian em amostras de -1 a 1', () => {
    const bytes = new Uint8Array(new Int16Array([0, 16384, -32768, 32767]).buffer);
    const base64 = btoa(String.fromCharCode(...bytes));

    expect([...pcmParaFloat32(base64)]).toEqual([0, 0.5, -1, 32767 / 32768]);
  });
});

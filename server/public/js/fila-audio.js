// Fila entre o som que chega do app do Windows e o AudioWorklet que toca na transmissão.
// Absorve a irregularidade da entrega e segura a latência. Sem dependências do navegador, para testar no Node.

const QUADROS_POR_SEGUNDO = 48_000;
/** Junta isso (60 ms) antes de começar a tocar, para não engasgar a cada atraso pequeno. */
export const ALVO_QUADROS = 0.06 * QUADROS_POR_SEGUNDO;
/** Se acumular mais que isso (250 ms), descarta o mais antigo até voltar ao alvo: atraso não cresce. */
export const MAXIMO_QUADROS = 0.25 * QUADROS_POR_SEGUNDO;

/** Fila circular de quadros estéreo (esquerda e direita intercalados). */
export class FilaDeAudio {
  constructor(capacidadeQuadros = QUADROS_POR_SEGUNDO) {
    this.capacidade = capacidadeQuadros;
    this.dados = new Float32Array(capacidadeQuadros * 2);
    this.inicio = 0;
    this.tamanho = 0;
    this.tocando = false;
  }

  /** @param {Float32Array} intercalado E, D, E, D… */
  adicionar(intercalado) {
    const quadros = intercalado.length >> 1;
    for (let i = 0; i < quadros; i++) {
      if (this.tamanho === this.capacidade) this.descartar(1);
      const pos = (this.inicio + this.tamanho) % this.capacidade;
      this.dados[pos * 2] = intercalado[i * 2];
      this.dados[pos * 2 + 1] = intercalado[i * 2 + 1];
      this.tamanho++;
    }
    if (this.tamanho > MAXIMO_QUADROS) this.descartar(this.tamanho - ALVO_QUADROS);
  }

  /**
   * Preenche os canais de saída. Sem som suficiente, entrega silêncio e espera juntar o alvo de novo.
   * @param {Float32Array} esquerda
   * @param {Float32Array} [direita]
   */
  tirar(esquerda, direita) {
    if (!this.tocando) {
      if (this.tamanho < ALVO_QUADROS) {
        esquerda.fill(0);
        direita?.fill(0);
        return;
      }
      this.tocando = true;
    }
    for (let i = 0; i < esquerda.length; i++) {
      if (this.tamanho === 0) {
        esquerda.fill(0, i);
        direita?.fill(0, i);
        this.tocando = false;
        return;
      }
      esquerda[i] = this.dados[this.inicio * 2];
      if (direita) direita[i] = this.dados[this.inicio * 2 + 1];
      this.inicio = (this.inicio + 1) % this.capacidade;
      this.tamanho--;
    }
  }

  descartar(quadros) {
    const n = Math.min(quadros, this.tamanho);
    this.inicio = (this.inicio + n) % this.capacidade;
    this.tamanho -= n;
  }
}

/**
 * PCM 16 bits little-endian (em base64, como o app manda) para amostras de -1 a 1.
 * @param {string} base64
 */
export function pcmParaFloat32(base64) {
  const binario = atob(base64);
  const amostras = new Float32Array(binario.length >> 1);
  for (let i = 0; i < amostras.length; i++) {
    let valor = binario.charCodeAt(2 * i) | (binario.charCodeAt(2 * i + 1) << 8);
    if (valor >= 0x8000) valor -= 0x10000;
    amostras[i] = valor / 32768;
  }
  return amostras;
}

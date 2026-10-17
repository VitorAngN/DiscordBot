// Toca na transmissão o som que o app do Windows capturou (só do jogo).
import { FilaDeAudio } from './fila-audio.js';

class PonteDeAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fila = new FilaDeAudio();
    this.port.onmessage = (evento) => this.fila.adicionar(evento.data);
  }

  process(_entradas, saidas) {
    const [esquerda, direita] = saidas[0];
    this.fila.tirar(esquerda, direita);
    return true; // continua vivo mesmo em silêncio
  }
}

registerProcessor('ponte-de-audio', PonteDeAudio);

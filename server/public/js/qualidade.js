// Qualidades de transmissão, com teto em Full HD. Usado pela página de transmitir e pelo servidor
// (para estimar o uso de cada espectador), então não pode depender do navegador.

/**
 * A taxa é o teto do vídeo: o navegador baixa sozinho se a internet não aguentar.
 * @type {Record<string, { nome: string, largura: number, altura: number, fps: number, taxaVideo: number }>}
 */
export const QUALIDADES = {
  '1080p60': { nome: '1080p · 60 fps', largura: 1920, altura: 1080, fps: 60, taxaVideo: 6_000_000 },
  '1080p30': { nome: '1080p · 30 fps', largura: 1920, altura: 1080, fps: 30, taxaVideo: 4_000_000 },
  '720p60': { nome: '720p · 60 fps', largura: 1280, altura: 720, fps: 60, taxaVideo: 3_500_000 },
  '720p30': { nome: '720p · 30 fps', largura: 1280, altura: 720, fps: 30, taxaVideo: 2_500_000 },
};

/** Boa para jogo e gasta pouco da cota grátis. */
export const QUALIDADE_PADRAO = '720p60';

/** Teto do som (Opus estéreo). */
export const TAXA_AUDIO = 128_000;

/** Qualidade mais alta, usada quando a sala não diz qual é (pior caso para a trava de uso). */
const MAIS_ALTA = '1080p60';

/** @param {string} id */
export const qualidadeValida = (id) => Object.hasOwn(QUALIDADES, id);

/**
 * Bits por segundo que cada espectador recebe no pior caso: vídeo no teto, som e uns 5% de cabeçalhos.
 * @param {string | undefined} id
 */
export function taxaPorEspectador(id) {
  const q = QUALIDADES[id && qualidadeValida(id) ? id : MAIS_ALTA];
  return Math.ceil((q.taxaVideo + TAXA_AUDIO) * 1.05);
}

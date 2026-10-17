import { describe, expect, it } from 'vitest';
import { QUALIDADE_PADRAO, QUALIDADES, qualidadeValida, taxaPorEspectador } from '../public/js/qualidade.js';

describe('qualidades', () => {
  it('nenhuma passa de Full HD a 60 fps nem de 6 Mbps', () => {
    for (const q of Object.values(QUALIDADES)) {
      expect(q.altura).toBeLessThanOrEqual(1080);
      expect(q.fps).toBeLessThanOrEqual(60);
      expect(q.taxaVideo).toBeLessThanOrEqual(6_000_000);
    }
  });

  it('a padrão é uma qualidade válida', () => {
    expect(qualidadeValida(QUALIDADE_PADRAO)).toBe(true);
    expect(qualidadeValida('4k')).toBe(false);
    expect(qualidadeValida('constructor')).toBe(false);
  });

  it('estima vídeo no teto, som e cabeçalhos por espectador', () => {
    expect(taxaPorEspectador('720p60')).toBe(Math.ceil((3_500_000 + 128_000) * 1.05));
  });

  it('sem qualidade conhecida, estima pela mais alta', () => {
    expect(taxaPorEspectador(undefined)).toBe(taxaPorEspectador('1080p60'));
    expect(taxaPorEspectador('8k')).toBe(taxaPorEspectador('1080p60'));
  });
});

// Ajustes no SDP. Sem dependências do navegador, para poder ser testado no Node.

/**
 * Liga o Opus em estéreo e com taxa alta. O padrão dos navegadores é mono,
 * pensado para voz; som de jogo e música precisam de estéreo.
 * @param {string} sdp
 * @param {number} [bitrate] bits por segundo
 * @returns {string}
 */
export function opusEstereo(sdp, bitrate = 128_000) {
  const tipos = [...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000\/2/gim)].map((m) => m[1]);
  let resultado = sdp;
  for (const tipo of tipos) {
    const linha = new RegExp(`^a=fmtp:${tipo} ([^\\r\\n]*)`, 'm');
    resultado = resultado.replace(linha, (_, parametros) => {
      const mapa = new Map(
        parametros
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const i = p.indexOf('=');
            return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
          }),
      );
      mapa.set('stereo', '1');
      mapa.set('sprop-stereo', '1');
      mapa.set('maxaveragebitrate', String(bitrate));
      const novos = [...mapa].map(([chave, valor]) => (valor === '' ? chave : `${chave}=${valor}`)).join(';');
      return `a=fmtp:${tipo} ${novos}`;
    });
  }
  return resultado;
}

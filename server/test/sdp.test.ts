import { describe, expect, it } from 'vitest';
import { opusEstereo } from '../public/js/sdp.js';

const SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=rtpmap:96 VP8/90000',
  '',
].join('\r\n');

describe('opusEstereo', () => {
  it('liga estéreo e taxa alta só na linha do Opus, mantendo o resto', () => {
    const resultado = opusEstereo(SDP);

    expect(resultado).toContain('a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000\r\n');
    expect(resultado).toContain('a=fmtp:63 111/111\r\n');
    expect(resultado.split('\r\n')).toHaveLength(SDP.split('\r\n').length);
  });

  it('substitui valores que já existiam em vez de repetir', () => {
    const resultado = opusEstereo(SDP.replace('useinbandfec=1', 'useinbandfec=1;stereo=0'), 96_000);

    expect(resultado).toContain('a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=96000\r\n');
  });

  it('não mexe em SDP sem Opus', () => {
    const semOpus = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n';
    expect(opusEstereo(semOpus)).toBe(semOpus);
  });
});

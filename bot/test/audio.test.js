import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { createAudioResource, generateDependencyReport } from '@discordjs/voice';
import { gerarSomTeste } from '../scripts/gerar-som-teste.js';
import { pastaTemporaria } from './ajuda.js';

test('bibliotecas de voz estão instaladas', () => {
  const relatorio = generateDependencyReport();
  assert.match(relatorio, /@snazzah\/davey: \d/, 'DAVE (criptografia ponta a ponta)');
  assert.match(relatorio, /opusscript: \d/, 'codificador Opus');
  assert.match(relatorio, /@noble\/ciphers: \d/, 'criptografia de transporte');
  assert.match(relatorio, /libopus: yes/, 'FFmpeg com Opus');
});

test('arquivo de áudio vira pacotes Opus de 20 ms, com volume', { timeout: 30_000 }, async (t) => {
  const arquivo = await gerarSomTeste(path.join(pastaTemporaria(t), 'teste.wav'));

  const recurso = createAudioResource(arquivo, { inlineVolume: true });
  recurso.volume.setVolume(0.5);
  const pacotes = [];
  for await (const pacote of recurso.playStream) pacotes.push(pacote);

  // ~1,4 s de áudio ≈ 70 pacotes
  assert.ok(pacotes.length >= 60 && pacotes.length <= 80, `${pacotes.length} pacotes`);
  assert.ok(pacotes.every((p) => Buffer.isBuffer(p) && p.length > 0));
});

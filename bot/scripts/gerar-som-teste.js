// Gera um arpejo curto (~1,4 s) para testar o bot sem precisar de música.
// Uso: npm run som-teste  →  cria bot/midia/teste.wav
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const NOTAS_HZ = [523.25, 659.25, 783.99, 1046.5]; // Dó, Mi, Sol, Dó

export async function gerarSomTeste(destino) {
  mkdirSync(path.dirname(destino), { recursive: true });
  const entradas = NOTAS_HZ.flatMap((hz) => ['-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=0.35`]);
  const filtro = `${NOTAS_HZ.map((_, i) => `[${i}:a]`).join('')}concat=n=${NOTAS_HZ.length}:v=0:a=1,afade=t=out:st=1.2:d=0.2[a]`;
  await promisify(execFile)(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...entradas,
    '-filter_complex', filtro,
    '-map', '[a]', '-ar', '48000', '-ac', '2',
    destino,
  ]);
  return destino;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destino = fileURLToPath(new URL('../midia/teste.wav', import.meta.url));
  await gerarSomTeste(destino);
  console.log(`Som de teste criado em ${destino}`);
}

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { criarBiblioteca } from '../src/midia.js';
import { pastaTemporaria } from './ajuda.js';

function criarArquivos(pasta, nomes) {
  for (const nome of nomes) writeFileSync(path.join(pasta, nome), '');
}

test('lista só arquivos de mídia, em ordem alfabética', (t) => {
  const pasta = pastaTemporaria(t);
  criarArquivos(pasta, ['b.mp3', 'a.WAV', 'notas.txt']);
  mkdirSync(path.join(pasta, 'subpasta.mp3'));

  assert.deepEqual(criarBiblioteca(pasta).listar(), ['a.WAV', 'b.mp3']);
});

test('pasta inexistente vira lista vazia', () => {
  assert.deepEqual(criarBiblioteca(path.join('nao', 'existe')).listar(), []);
});

test('resolve só nomes de arquivos que estão na pasta', (t) => {
  const pasta = pastaTemporaria(t);
  criarArquivos(pasta, ['musica.mp3', 'notas.txt']);
  const biblioteca = criarBiblioteca(pasta);

  assert.equal(biblioteca.resolver('musica.mp3'), path.join(pasta, 'musica.mp3'));
  const invalidos = [
    '../musica.mp3',
    '..\\musica.mp3',
    path.join(pasta, 'musica.mp3'),
    'inexistente.mp3',
    'notas.txt',
    '',
    undefined,
  ];
  for (const nome of invalidos) assert.equal(biblioteca.resolver(nome), null, `aceitou ${nome}`);
});

test('busca ignora maiúsculas e respeita os limites do Discord', (t) => {
  const pasta = pastaTemporaria(t);
  const faixas = Array.from({ length: 30 }, (_, i) => `faixa-${String(i).padStart(2, '0')}.mp3`);
  criarArquivos(pasta, [...faixas, `${'x'.repeat(101)}.mp3`]);
  const biblioteca = criarBiblioteca(pasta);

  assert.equal(biblioteca.buscar('FAIXA').length, 25);
  assert.deepEqual(biblioteca.buscar('07'), ['faixa-07.mp3']);
  assert.deepEqual(biblioteca.buscar('xxx'), [], 'nomes com mais de 100 caracteres não cabem no menu');
});

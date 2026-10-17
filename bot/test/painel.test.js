import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ID, montarPainel } from '../src/painel.js';
import { VOLUME_MAX } from '../src/player.js';

const PARADO = { conectado: false, canal: null, faixa: null, status: 'parado', volume: 50 };

function abrir(painel) {
  const [menu, controles, ajustes] = painel.components.map((linha) => linha.toJSON().components);
  const botao = (id) => [...controles, ...ajustes].find((c) => c.custom_id === id);
  return { embed: painel.embeds[0].toJSON(), menu: menu[0], botao };
}

test('fora da call e sem arquivos: menu e controles desativados', () => {
  const { menu, botao } = abrir(montarPainel(PARADO, [], 0));

  assert.equal(menu.disabled, true);
  assert.equal(botao(ID.entrar).disabled, undefined);
  for (const id of [ID.pausa, ID.parar, ID.sair]) assert.equal(botao(id).disabled, true, id);
});

test('tocando: mostra a faixa e permite pausar', () => {
  const est = { conectado: true, canal: 'Geral', faixa: 'musica.mp3', status: 'tocando', volume: 50 };
  const { embed, menu, botao } = abrir(montarPainel(est, ['musica.mp3'], 1));

  assert.equal(embed.fields.find((f) => f.name === 'Faixa').value, 'musica.mp3');
  assert.deepEqual(menu.options.map((o) => o.value), ['musica.mp3']);
  assert.equal(botao(ID.pausa).label, 'Pausar');
  assert.equal(botao(ID.pausa).disabled, false);
});

test('pausado: botão vira Continuar', () => {
  const est = { conectado: true, canal: 'Geral', faixa: 'musica.mp3', status: 'pausado', volume: 50 };
  assert.equal(abrir(montarPainel(est, [], 1)).botao(ID.pausa).label, 'Continuar');
});

test('botões de volume travam nos limites', () => {
  assert.equal(abrir(montarPainel({ ...PARADO, volume: 0 }, [], 0)).botao(ID.volumeMenos).disabled, true);
  assert.equal(abrir(montarPainel({ ...PARADO, volume: VOLUME_MAX }, [], 0)).botao(ID.volumeMais).disabled, true);
});

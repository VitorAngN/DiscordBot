import { describe, expect, it } from 'vitest';
import { criarAvisoNoDiscord, duracao, ErroDiscord } from '../src/discord';

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Headers;
  corpo: any; // conferido pelas asserções
}

function fetchFalso(...respostas: Array<{ status?: number; corpo: unknown }>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, metodo: init.method ?? 'GET', cabecalhos: new Headers(init.headers), corpo: JSON.parse(init.body as string) });
    const r = respostas.shift() ?? { corpo: {} };
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const AVISO = {
  nome: 'Vitor',
  titulo: 'Minecraft com a galera',
  qualidade: '720p · 60 fps',
  link: 'https://transmissao.exemplo.workers.dev/s/AbCdEfGhIj',
  inicio: Date.UTC(2026, 9, 17, 20, 0),
};

describe('aviso no Discord', () => {
  it('posta no canal com o token do bot e o botão Assistir', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: { id: 'msg-1' } });
    const discord = criarAvisoNoDiscord('token-do-bot', '123456', buscar);

    expect(await discord.publicar(AVISO)).toBe('msg-1');

    const [chamada] = chamadas;
    expect(chamada).toMatchObject({ url: 'https://discord.com/api/v10/channels/123456/messages', metodo: 'POST' });
    expect(chamada.cabecalhos.get('Authorization')).toBe('Bot token-do-bot');
    expect(chamada.cabecalhos.get('User-Agent')).toMatch(/^DiscordBot \(/);
    expect(chamada.corpo.embeds[0].title).toBe('🔴 Vitor está transmitindo');
    expect(chamada.corpo.embeds[0].description).toBe('Minecraft com a galera');
    expect(chamada.corpo.components[0].components[0]).toMatchObject({ type: 2, style: 5, label: 'Assistir', url: AVISO.link });
  });

  it('ignora BOM, espaço e quebra de linha que vierem junto do token e do canal', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: { id: 'msg-1' } });
    await criarAvisoNoDiscord(' token-do-bot\n', '﻿123456\r\n', buscar).publicar(AVISO);

    expect(chamadas[0].url).toBe('https://discord.com/api/v10/channels/123456/messages');
    expect(chamadas[0].cabecalhos.get('Authorization')).toBe('Bot token-do-bot');
  });

  it('nunca marca ninguém, mesmo com @ no nome ou no título', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: { id: 'msg-1' } });
    await criarAvisoNoDiscord('t', 'c', buscar).publicar({ ...AVISO, nome: '@everyone' });

    expect(chamadas[0].corpo.allowed_mentions).toEqual({ parse: [] });
  });

  it('ao encerrar, troca a mensagem e tira o botão', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: { id: 'msg-1' } });
    const fim = AVISO.inicio + 83 * 60_000;
    await criarAvisoNoDiscord('t', '123456', buscar).encerrar('msg-1', AVISO, fim);

    expect(chamadas[0]).toMatchObject({ url: 'https://discord.com/api/v10/channels/123456/messages/msg-1', metodo: 'PATCH' });
    expect(chamadas[0].corpo.embeds[0].title).toBe('⚫ Vitor encerrou a transmissão');
    expect(chamadas[0].corpo.embeds[0].fields[0]).toMatchObject({ name: 'Duração', value: '1 h 23 min' });
    expect(chamadas[0].corpo.components).toEqual([]);
  });

  it('transforma erro do Discord em ErroDiscord com a mensagem dele', async () => {
    const { buscar } = fetchFalso({ status: 403, corpo: { message: 'Missing Permissions', code: 50013 } });

    await expect(criarAvisoNoDiscord('t', 'c', buscar).publicar(AVISO)).rejects.toThrow(
      new ErroDiscord('O Discord respondeu 403: Missing Permissions'),
    );
  });

  it('no "Invalid Form Body", diz qual campo o Discord recusou', async () => {
    const erros = {
      components: { 0: { components: { 0: { url: { _errors: [{ code: 'URL_TYPE_INVALID_URL', message: 'Not a well formed URL.' }] } } } } },
    };
    const { buscar } = fetchFalso({ status: 400, corpo: { code: 50035, message: 'Invalid Form Body', errors: erros } });

    await expect(criarAvisoNoDiscord('t', 'c', buscar).publicar(AVISO)).rejects.toThrow(
      'O Discord respondeu 400: Invalid Form Body (components.0.components.0.url: Not a well formed URL.)',
    );
  });

  it('formata a duração', () => {
    expect(duracao(10_000)).toBe('1 min');
    expect(duracao(45 * 60_000)).toBe('45 min');
    expect(duracao(65 * 60_000)).toBe('1 h 05 min');
  });
});

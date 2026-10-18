// Aviso no Discord: quando alguém fica ao vivo, o bot posta no canal uma mensagem com o botão
// "Assistir"; quando a transmissão acaba, edita a mensagem. Usa só a API REST: o bot não precisa
// estar ligado em lugar nenhum. https://discord.com/developers/docs/resources/message

const API = 'https://discord.com/api/v10';
// O Discord pede um User-Agent nesse formato para bots
const AGENTE = 'DiscordBot (https://github.com/VitorAngN/DiscordBot, 0.3.0)';

const COR_AO_VIVO = 0xf23f43;
const COR_ENCERRADA = 0x4f545c;

export interface Aviso {
  nome: string;
  titulo: string;
  /** Nome da qualidade, como "720p · 60 fps", ou `null`. */
  qualidade: string | null;
  link: string;
  inicio: number;
}

export interface AvisoNoDiscord {
  /** Posta o aviso de ao vivo e devolve o ID da mensagem. */
  publicar(aviso: Aviso): Promise<string>;
  /** Troca o aviso por "encerrou" e tira o botão. */
  encerrar(mensagemId: string, aviso: Omit<Aviso, 'link'>, fim: number): Promise<void>;
}

export class ErroDiscord extends Error {}

/** Ninguém é marcado pelo aviso, mesmo que o nome ou o título tenham @. */
const SEM_MENCOES = { parse: [] as string[] };

export function mensagemAoVivo(aviso: Aviso) {
  return {
    embeds: [
      {
        title: `🔴 ${aviso.nome} está transmitindo`,
        description: aviso.titulo,
        color: COR_AO_VIVO,
        fields: aviso.qualidade ? [{ name: 'Qualidade', value: aviso.qualidade, inline: true }] : [],
        timestamp: new Date(aviso.inicio).toISOString(),
        footer: { text: 'Clique em Assistir e use a senha para assistir' },
      },
    ],
    components: [
      {
        type: 1, // linha de componentes
        // Botão de link, só com texto: emoji em botão passa por uma validação a mais do Discord
        components: [{ type: 2, style: 5, label: 'Assistir', url: aviso.link }],
      },
    ],
    allowed_mentions: SEM_MENCOES,
  };
}

export function mensagemEncerrada(aviso: Omit<Aviso, 'link'>, fim: number) {
  return {
    embeds: [
      {
        title: `⚫ ${aviso.nome} encerrou a transmissão`,
        description: aviso.titulo,
        color: COR_ENCERRADA,
        fields: [{ name: 'Duração', value: duracao(fim - aviso.inicio), inline: true }],
        timestamp: new Date(fim).toISOString(),
      },
    ],
    components: [],
    allowed_mentions: SEM_MENCOES,
  };
}

/**
 * Em "Invalid Form Body", o Discord diz qual campo deu erro num objeto aninhado que termina em
 * `_errors`. Vira algo legível: "components.0.components.0.url: Not a well formed URL.".
 * https://discord.com/developers/docs/reference#error-messages
 */
export function camposComErro(erros: unknown, caminho: string[] = []): string {
  if (!erros || typeof erros !== 'object') return '';
  const partes: string[] = [];
  for (const [chave, valor] of Object.entries(erros)) {
    if (chave === '_errors' && Array.isArray(valor)) {
      const mensagens = valor.map((e: { message?: string; code?: string }) => e.message ?? e.code).join('; ');
      partes.push(`${caminho.join('.') || 'corpo'}: ${mensagens}`);
    } else {
      const dentro = camposComErro(valor, [...caminho, chave]);
      if (dentro) partes.push(dentro);
    }
  }
  return partes.join(' | ');
}

/** "45 min", "1 h 05 min". */
export function duracao(ms: number): string {
  const minutos = Math.max(1, Math.round(ms / 60_000));
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

export function criarAvisoNoDiscord(token: string, canalId: string, buscar: typeof fetch = fetch): AvisoNoDiscord {
  async function chamar(metodo: string, caminho: string, corpo: unknown): Promise<{ id?: string }> {
    const resposta = await buscar(`${API}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': AGENTE },
      body: JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => ({}))) as { id?: string; message?: string; errors?: unknown };
    if (!resposta.ok) {
      const detalhes = camposComErro(dados.errors);
      throw new ErroDiscord(
        `O Discord respondeu ${resposta.status}: ${dados.message ?? 'erro desconhecido'}${detalhes ? ` (${detalhes})` : ''}`,
      );
    }
    return dados;
  }

  const canal = `/channels/${encodeURIComponent(canalId)}/messages`;
  return {
    async publicar(aviso) {
      const { id } = await chamar('POST', canal, mensagemAoVivo(aviso));
      if (!id) throw new ErroDiscord('O Discord não devolveu o ID da mensagem.');
      return id;
    },
    async encerrar(mensagemId, aviso, fim) {
      await chamar('PATCH', `${canal}/${encodeURIComponent(mensagemId)}`, mensagemEncerrada(aviso, fim));
    },
  };
}

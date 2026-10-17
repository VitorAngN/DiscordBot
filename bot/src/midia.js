import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSOES = new Set(['.mp3', '.wav', '.ogg', '.opus', '.flac', '.m4a', '.aac', '.webm', '.mp4', '.mkv']);

// Limite do Discord para opções de menus e de autocompletar
const MAX_OPCOES = 25;
const MAX_NOME = 100;

const PASTA_PADRAO = fileURLToPath(new URL('../midia/', import.meta.url));

/**
 * Arquivos tocáveis de uma pasta. Só são aceitos arquivos que estão
 * diretamente nela, então nomes vindos do Discord não escapam da pasta.
 */
export function criarBiblioteca(pasta = process.env.MIDIA_DIR || PASTA_PADRAO) {
  const raiz = path.resolve(pasta);

  function listar() {
    let entradas;
    try {
      entradas = readdirSync(raiz, { withFileTypes: true });
    } catch {
      return [];
    }
    return entradas
      .filter((e) => e.isFile() && EXTENSOES.has(path.extname(e.name).toLowerCase()))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /** Caminho absoluto do arquivo, ou `null` se o nome não estiver na pasta. */
  function resolver(nome) {
    return listar().includes(nome) ? path.join(raiz, nome) : null;
  }

  /** Nomes que contêm o termo, no formato aceito pelos menus do Discord. */
  function buscar(termo = '') {
    const t = termo.trim().toLowerCase();
    return listar()
      .filter((n) => n.length <= MAX_NOME && n.toLowerCase().includes(t))
      .slice(0, MAX_OPCOES);
  }

  return { pasta: raiz, listar, resolver, buscar };
}

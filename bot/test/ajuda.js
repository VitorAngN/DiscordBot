import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Pasta temporária apagada ao fim do teste. */
export function pastaTemporaria(t) {
  const pasta = mkdtempSync(path.join(tmpdir(), 'discordbot-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  return pasta;
}

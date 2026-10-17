# Como contribuir

## Fluxo de trabalho

- A `main` é sempre estável e só recebe mudanças por Pull Request.
- Cada mudança nasce numa branch a partir da `main`, com prefixo do tipo:
  `feat/...`, `fix/...`, `docs/...`, `refactor/...`, `chore/...`, `ci/...`.
  Exemplo: `feat/bot-audio`.
- Abra o Pull Request para a `main`. O CI precisa passar antes do merge.
- Use **Squash and merge**, com o título do PR no padrão de commit abaixo.

## Mensagens de commit

O projeto segue o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

```
tipo(escopo): descrição curta no imperativo
```

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Só documentação |
| `refactor` | Mudança de código sem alterar comportamento |
| `test` | Testes |
| `build` | Dependências, empacotamento |
| `ci` | Pipelines do GitHub Actions |
| `chore` | Manutenção geral |

Escopos: `bot`, `app`, `server`, `docs`.

Exemplos:

```
feat(bot): adiciona painel com botões de mídia
fix(bot): reconecta ao canal de voz após queda
docs: atualiza guia de criação do bot
```

Mudança incompatível: use `!` depois do tipo (`feat(bot)!: ...`) e explique no rodapé com `BREAKING CHANGE: ...`.

## Versionamento

O projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`), com uma versão única para o repositório.

- Enquanto estiver em `0.x`, cada fase concluída sobe o MINOR (Fase 1 → `0.1.0`, Fase 2 → `0.2.0`…). Correções sobem o PATCH.
- A `1.0.0` sai quando o app estiver pronto para os amigos instalarem (Fase 5).

### Como lançar uma versão

Como a `main` só recebe mudanças por PR, a preparação da versão entra no PR que fecha a fase (ou num PR `chore/release-vX.Y.Z`):

1. Mova as entradas de `[Unreleased]` no `CHANGELOG.md` para a nova versão, com a data, e atualize os links no fim do arquivo.
2. Atualize a versão do bot: `npm --prefix bot version X.Y.Z --no-git-tag-version`.
3. Faça o commit `chore(release): vX.Y.Z` e, com o CI verde, o merge do PR.
4. Na `main` atualizada, crie e envie a tag anotada: `git tag -a vX.Y.Z -m "vX.Y.Z"` e `git push origin vX.Y.Z`.
5. Publique a Release a partir da tag, com a seção do changelog: `gh release create vX.Y.Z --notes-file notas.md`.

## Segredos

- **Nunca** commite tokens. O arquivo `.env` é ignorado pelo git. Use o `.env.example` como modelo.
- Se um token vazar, gere outro na hora no Discord Developer Portal (**Bot → Reset Token**).

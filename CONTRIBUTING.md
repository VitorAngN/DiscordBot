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
- A `1.0.0` sai quando o app estiver pronto para os amigos instalarem (Fase 6).

### Como lançar uma versão

1. Na `main` atualizada, mova as entradas de `[Unreleased]` no `CHANGELOG.md` para a nova versão, com a data.
2. Atualize o campo `version` nos `package.json`.
3. Faça o commit `chore(release): vX.Y.Z`.
4. Crie a tag anotada `git tag -a vX.Y.Z -m "vX.Y.Z"` e envie com `git push --follow-tags`.
5. Publique a Release no GitHub a partir da tag, colando a seção do changelog.

## Segredos

- **Nunca** commite tokens. O arquivo `.env` é ignorado pelo git. Use o `.env.example` como modelo.
- Se um token vazar, gere outro na hora no Discord Developer Portal (**Bot → Reset Token**).

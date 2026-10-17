# Changelog

Todas as mudanças relevantes do projeto ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-10-17

### Adicionado

- Plano do projeto (`docs/PLANO.md`) e estrutura base do repositório.
- Bot do Discord (`bot/`) que entra no canal de voz e toca arquivos da pasta de mídia, com criptografia DAVE.
- Comandos `/painel`, `/tocar` (com autocompletar), `/entrar`, `/parar` e `/sair`.
- Painel com botões: escolher arquivo, entrar, pausar/continuar, parar, volume e sair; atualiza sozinho.
- Testes automáticos (`npm test`) e CI no GitHub Actions (Windows e Linux).

[Unreleased]: https://github.com/VitorAngN/DiscordBot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/VitorAngN/DiscordBot/releases/tag/v0.1.0

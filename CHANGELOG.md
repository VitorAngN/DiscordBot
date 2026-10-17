# Changelog

Todas as mudanças relevantes do projeto ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado

- App transmissor (`app/`): captura do som de um programa específico (só o jogo, ou tudo menos o Discord), em PCM 48 kHz estéreo, com silêncio preenchido para o áudio acompanhar o relógio.
- Ferramenta `captura-audio` para listar janelas e gravar o som de um programa em WAV ou PCM cru.
- CI do app no Windows e atualizações automáticas dos pacotes NuGet.
- Servidor de transmissão (`server/`) na Cloudflare: salas em Durable Objects, repasse de vídeo e som pelo Realtime SFU e API para o transmissor e para quem assiste.
- Página de assistir (`/s/<sala>`), com reconexão automática, e página de teste para transmitir pelo navegador (`/transmitir`), com som estéreo.
- CI do servidor (tipos e testes).

## [0.1.0] - 2026-10-17

### Adicionado

- Plano do projeto (`docs/PLANO.md`) e estrutura base do repositório.
- Bot do Discord (`bot/`) que entra no canal de voz e toca arquivos da pasta de mídia, com criptografia DAVE.
- Comandos `/painel`, `/tocar` (com autocompletar), `/entrar`, `/parar` e `/sair`.
- Painel com botões: escolher arquivo, entrar, pausar/continuar, parar, volume e sair; atualiza sozinho.
- Testes automáticos (`npm test`) e CI no GitHub Actions (Windows e Linux).

[Unreleased]: https://github.com/VitorAngN/DiscordBot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/VitorAngN/DiscordBot/releases/tag/v0.1.0

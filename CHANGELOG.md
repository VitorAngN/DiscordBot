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
- Trava de uso no servidor: estima o consumo de quem assiste nos últimos 31 dias e, ao chegar no limite (900 GB, dentro da cota grátis do Realtime), encerra os espectadores e bloqueia novas transmissões.
- Senha para assistir (`ASSISTIR_CHAVE`), para só os amigos verem a transmissão mesmo que o link vaze.
- CI do servidor (tipos e testes).
- Página de assistir com tela cheia (deita a tela no celular) e janela flutuante (Picture-in-Picture), com atalhos F e P.
- Escolha de qualidade ao transmitir, com teto em Full HD (1080p ou 720p, a 60 ou 30 fps). A trava de uso conta cada espectador pela qualidade da sala.
- **App transmissor** (`app/src/Transmissor.App`): abre a página de transmitir do servidor num WebView2, pega a imagem da janela escolhida e envia só o som do programa dono dela, sem a call do Discord. Se não der para saber o dono da janela, pergunta de qual programa é o som.
- Trocar a janela durante a transmissão, sem derrubar a sala (no app, o som troca junto), e mudar o modo de som ao vivo.
- Tela cheia e janela flutuante também na prévia de quem transmite.
- Comando `captura-audio sessoes`, que lista quem tem som aberto e confere que todo o som do Discord fica de fora.
- `Transmissor.exe` para os amigos: um arquivo só, com o .NET dentro, gerado e anexado automaticamente a cada Release. Inclui o [guia para os amigos](docs/AMIGOS.md).

### Corrigido

- O som do Discord nunca entra na transmissão. No app, "tudo menos o Discord" passa a ser o padrão, e um modo desconhecido ou a janela do próprio Discord também caem nele. No navegador, a página não pega mais o som do PC inteiro, só o de uma aba.

## [0.1.0] - 2026-10-17

### Adicionado

- Plano do projeto (`docs/PLANO.md`) e estrutura base do repositório.
- Bot do Discord (`bot/`) que entra no canal de voz e toca arquivos da pasta de mídia, com criptografia DAVE.
- Comandos `/painel`, `/tocar` (com autocompletar), `/entrar`, `/parar` e `/sair`.
- Painel com botões: escolher arquivo, entrar, pausar/continuar, parar, volume e sair; atualiza sozinho.
- Testes automáticos (`npm test`) e CI no GitHub Actions (Windows e Linux).

[Unreleased]: https://github.com/VitorAngN/DiscordBot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/VitorAngN/DiscordBot/releases/tag/v0.1.0

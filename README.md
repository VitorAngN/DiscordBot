# DiscordBot — transmissor de jogos para Discord

Transmita a janela do seu jogo (vídeo + áudio) para os amigos, usando o Discord como ponto de encontro e sem depender de outros aplicativos.

> **Status:** em desenvolvimento. A Fase 1 (bot de som) está pronta na v0.1.0; agora vem a Fase 2 (transmissão). Veja o [plano completo](docs/PLANO.md).

## Por que existe

Desde agosto de 2026, o Go Live, o compartilhamento de tela e as chamadas de vídeo do Discord estão suspensos no Brasil (ordem da ANPD). E bots do Discord só conseguem transmitir áudio.

Por isso o vídeo e o som do jogo vão **juntos, por fora do Discord**, numa página aberta no navegador. Dentro do Discord, um bot avisa que a transmissão começou e também toca música na call.

## Como vai funcionar

1. Você abre o app, escolhe a janela do jogo e clica em **Transmitir**.
2. Seu bot, que roda escondido dentro do app, posta no canal um aviso com o botão **Assistir**.
3. Os amigos assistem no navegador, com vídeo e som sincronizados, enquanto conversam no canal de voz.

Só o som do jogo é capturado, então a voz da call não volta para a transmissão.

## Para os amigos

- **Assistir:** basta abrir o link e digitar a senha para assistir.
- **Transmitir:** baixe o `Transmissor.exe` na [página de downloads](https://github.com/VitorAngN/DiscordBot/releases/latest). É um arquivo só, sem instalação. Peça ao dono do servidor o endereço e a senha de transmitir.

O passo a passo está no [guia para os amigos](docs/AMIGOS.md).

## Estrutura

| Pasta | O que é | Estado |
|---|---|---|
| [`bot/`](bot/README.md) | Bot do Discord (Node.js + discord.js) | Toca áudio na call |
| [`app/`](app/README.md) | App transmissor para Windows (C# + WebView2) | Transmite a janela do jogo, só com o som dele |
| [`server/`](server/README.md) | Servidor de transmissão (Cloudflare Workers) | Salas e página de assistir |
| `docs/` | Plano e documentação | — |

## Roteiro

- [x] **Fase 1 (v0.1.0):** bot entra na call e toca arquivos de áudio
- [ ] **Fase 2 (v0.2.0):** transmissão da janela e do som do jogo para uma página no navegador
- [ ] **Fase 3 (v0.3.0):** botão Transmitir faz o bot postar o link
- [ ] **Fase 4 (v0.4.0):** interface final do app
- [ ] **Fase 5 (v1.0.0):** pacote para os amigos instalarem

## Contribuindo

O fluxo de branches, o padrão de commits e o versionamento estão em [CONTRIBUTING.md](CONTRIBUTING.md). As mudanças de cada versão ficam no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)

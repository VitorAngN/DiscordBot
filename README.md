# DiscordBot — transmissor de jogos para Discord

Transmita a janela do seu jogo (vídeo + áudio) para os amigos, usando o Discord como ponto de encontro e sem depender de outros aplicativos.

> **Status:** em desenvolvimento, na Fase 1 (bot de áudio). Veja o [plano completo](docs/PLANO.md).

## Por que existe

Desde agosto de 2026, o Go Live, o compartilhamento de tela e as chamadas de vídeo do Discord estão suspensos no Brasil (ordem da ANPD). E bots do Discord só conseguem transmitir áudio.

Por isso o vídeo vai **por fora do Discord**, numa página aberta no navegador. Dentro do Discord, um bot avisa que a transmissão começou, toca mídia e leva áudio para a call.

## Como vai funcionar

1. Você abre o app, escolhe a janela do jogo e clica em **Transmitir**.
2. Seu bot posta no canal um aviso com o botão **Assistir**.
3. Os amigos assistem no navegador, com vídeo e som sincronizados, enquanto conversam no canal de voz.

O áudio é capturado só do jogo (ou de tudo menos o Discord), então a voz da call não volta para a transmissão.

## Estrutura

| Pasta | O que é | Estado |
|---|---|---|
| [`bot/`](bot/README.md) | Motor do bot (Node.js + discord.js) | Toca áudio na call |
| `app/` | App transmissor para Windows (C# + WebView2) | Planejado |
| `server/` | Servidor de transmissão (Cloudflare Workers) | Planejado |
| `docs/` | Plano e documentação | — |

## Roteiro

- [ ] **Fase 1:** bot entra na call e toca arquivos de áudio
- [ ] **Fase 2:** captura de áudio por programa, sem retorno do Discord
- [ ] **Fase 3:** transmissão de vídeo da janela e página de assistir
- [ ] **Fase 4:** botão Transmitir integrado ao aviso do bot
- [ ] **Fase 5:** interface final do app
- [ ] **Fase 6:** pacote para os amigos instalarem

## Contribuindo

O fluxo de branches, o padrão de commits e o versionamento estão em [CONTRIBUTING.md](CONTRIBUTING.md). As mudanças de cada versão ficam no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)

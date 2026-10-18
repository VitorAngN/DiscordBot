# DiscordBot — transmissor de jogos para Discord

Transmita a janela do seu jogo (vídeo + áudio) para os amigos, usando o Discord como ponto de encontro e sem depender de outros aplicativos.

> **Status:** a transmissão do jogo já funciona (v0.2.0): baixe o [Transmissor.exe](https://github.com/VitorAngN/DiscordBot/releases/latest). Agora vem a Fase 3, em que o bot posta o link no Discord sozinho. Veja o [plano completo](docs/PLANO.md).

## Por que existe

Desde agosto de 2026, o Go Live, o compartilhamento de tela e as chamadas de vídeo do Discord estão suspensos no Brasil (ordem da ANPD). E bots do Discord só conseguem transmitir áudio.

Por isso o vídeo e o som do jogo vão **juntos, por fora do Discord**, numa página aberta no navegador. Dentro do Discord fica a conversa de sempre, e um bot opcional toca música na call.

## Como funciona

1. Você abre o **Transmissor.exe**, escolhe a janela do jogo e começa a transmitir.
2. O app envia a imagem da janela e o som do PC **sem o Discord**, então a voz da call nunca volta para quem assiste.
3. O seu bot posta no canal do Discord `🔴 Fulano está transmitindo`, com o botão **▶ Assistir** (ou você manda o link). Os amigos assistem no navegador, no celular ou no PC, com a senha para assistir, enquanto conversam no canal de voz.
4. Quando a transmissão acaba, o bot atualiza a mensagem para "encerrou".

## Por onde começar

| Você quer… | Precisa de | Guia |
|---|---|---|
| **Assistir** a transmissão de um amigo | Só o link e a senha para assistir | [Guia para os amigos](docs/AMIGOS.md#só-quero-assistir) |
| **Transmitir** usando o servidor de um amigo | O [Transmissor.exe](https://github.com/VitorAngN/DiscordBot/releases/latest), o endereço do servidor e a senha de transmitir | [Guia para os amigos](docs/AMIGOS.md#quero-transmitir-o-meu-jogo) |
| Ter o **próprio servidor**, com as suas senhas e a sua cota grátis | Conta na Cloudflare e o Node.js (uns 20 minutos) | [Monte o seu próprio servidor](docs/SERVIDOR-PROPRIO.md) |
| Ter o **bot** que toca música na call | Um bot no Discord Developer Portal e o Node.js | [Guia do bot](bot/README.md) |

## Estrutura

| Pasta | O que é | Estado |
|---|---|---|
| [`bot/`](bot/README.md) | Bot do Discord (Node.js + discord.js) | Toca áudio na call |
| [`app/`](app/README.md) | App transmissor para Windows (C# + WebView2) | Transmite a janela do jogo, só com o som dele |
| [`server/`](server/README.md) | Servidor de transmissão (Cloudflare Workers) | Salas e página de assistir |
| [`docs/`](docs/) | Plano e guias (amigos, servidor próprio) | — |

## Roteiro

- [x] **Fase 1 (v0.1.0):** bot entra na call e toca arquivos de áudio
- [x] **Fase 2 (v0.2.0):** transmissão da janela e do som do jogo (sem o Discord) para uma página no navegador
- [x] **Fase 3 (v0.3.0):** ao ficar ao vivo, o bot posta o aviso com o botão Assistir
- [ ] **Fase 4 (v0.4.0):** interface final do app
- [ ] **Fase 5 (v1.0.0):** pacote para os amigos instalarem

## Contribuindo

O fluxo de branches, o padrão de commits e o versionamento estão em [CONTRIBUTING.md](CONTRIBUTING.md). As mudanças de cada versão ficam no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)

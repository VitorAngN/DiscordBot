# Plano — Transmissor de jogos para Discord

## Objetivo

Transmitir a janela de um jogo (vídeo + áudio) para amigos usando o Discord como "porta de entrada", sem depender de Teams, Classroom etc.

- Quem **transmite**: instala o app e usa o próprio bot.
- Quem **assiste**: só precisa do Discord e de um navegador.

## Restrições (levantadas em out/2026)

- **Go Live, compartilhamento de tela e chamadas de vídeo do Discord estão suspensos no Brasil** (ordem da ANPD, ago/2026). Canais de voz, mensagens e servidores continuam funcionando.
- **Bots oficiais não transmitem vídeo**, só áudio no canal de voz.
- Desde mar/2026, toda chamada de voz exige **DAVE** (criptografia ponta a ponta). O discord.js (`@discordjs/voice` + `@snazzah/davey`) suporta; nas bibliotecas .NET isso não está confirmado.
- Muitos PCs domésticos no Brasil ficam atrás de **CGNAT**. O vídeo precisa de um ponto de encontro na internet para chegar nos amigos.

**Conclusão:** o vídeo **e o som do jogo** vão juntos, por fora do Discord, num link aberto no navegador. No Discord ficam a conversa (a call de sempre) e o bot, que posta o botão "Assistir" e toca música.

## Como funciona (visão de quem usa)

1. Abro o app, escolho a janela do jogo e clico em **Transmitir**.
2. O bot, que roda escondido dentro do app, posta no canal: `🔴 Vitor está transmitindo — [Assistir]`.
3. Os amigos clicam e assistem no navegador, com vídeo e som do jogo sincronizados, enquanto todos conversam normalmente no canal de voz.
4. Só o som do jogo é capturado, então a voz da call não volta na transmissão.
5. Extra: o bot também toca música e arquivos na call (pronto na v0.1.0).
6. Várias pessoas podem transmitir ao mesmo tempo (cada uma com sua sala e seu bot).

## Arquitetura

Para quem transmite é **um programa só**. Por dentro, ele tem as partes abaixo.

```
 PC de quem transmite                                 Internet                  Amigos
┌──────────────────────────────────────────┐
│ App transmissor                          │
│  ├ Interface com botões                  │
│  ├ Vídeo da janela (WebView2/Edge) ──┐   │   WebRTC   ┌───────────────────┐  navegador
│  ├ Som só do jogo (WASAPI) ──────────┴───┼───────────►│ Cloudflare        │─────────► vídeo + som
│  │                                       │  envia 1x  │  página, salas,   │           juntos
│  └ Bot (Node, escondido) ────────────────┼──► Discord │  SFU + TURN       │
│     posta [Assistir] e toca música       │   texto e  └───────────────────┘
└──────────────────────────────────────────┘   voz
```

| Componente | Tecnologia | Função |
|---|---|---|
| App transmissor (cada PC) | C# .NET 10, WinForms + WebView2 | Janela com botões; captura da janela + WebRTC pelo motor do Edge; captura do som por processo (sem o Discord) |
| Bot (cada PC, dentro do app) | Node 24, discord.js, @discordjs/voice | Bot próprio de cada pessoa; aviso com botão "Assistir"; música na call |
| Servidor de transmissão (um só, compartilhado) | Cloudflare Workers + Realtime SFU | Página de assistir, salas, repasse do vídeo + som para N amigos, TURN |

**Por que assim**

- **WebView2** (motor do Edge, já vem no Windows 11): captura de janela, codificação por hardware e WebRTC já prontos. É leve e dispensa o Electron.
- **C#** cuida do que o navegador não faz: capturar o áudio de um programa específico, sem o Discord.
- **Node** fica só com o bot de voz, porque é onde o DAVE é garantido.
- **SFU**: o PC de quem transmite envia o vídeo uma vez só. O ping do jogo não piora com vários amigos assistindo.

**Custo do servidor:** Cloudflare Realtime tem 1.000 GB/mês grátis (SFU + TURN somados) e depois cobra US$ 0,05/GB. Só conta o tráfego que sai para quem assiste.

| Qualidade | Taxa aprox. | Por espectador | Grátis/mês |
|---|---|---|---|
| 1080p 60 fps | ~6 Mbps | ~2,7 GB/h | ~370 horas-espectador |
| 720p 60 fps | ~3,5 Mbps | ~1,6 GB/h | ~630 horas-espectador |

## Fases

| Fase | Versão | Entrega |
|---|---|---|
| 1. **Bot de som** ✅ | v0.1.0 | Bot entra na call e toca arquivos, com painel de botões. Valida o DAVE. |
| 2. **Transmissão** | v0.2.0 | O app captura a janela e o som só do jogo e transmite para uma página no navegador. |
| 3. **Integração** | v0.3.0 | O botão Transmitir cria a sala e o bot posta o link com o botão Assistir; o bot passa a rodar dentro do app. |
| 4. **Interface** | v0.4.0 | Layout simples, token salvo no PC (protegido pelo Windows/DPAPI), escolha de qualidade, música pelo app. |
| 5. **Pacote** | v1.0.0 | Zip para os amigos e um guia de 5 minutos para criar o próprio bot. |

A Fase 2 é dividida em partes, cada uma num PR:

- **2a. Som do jogo:** captura por processo em C#, com os modos "só o jogo" e "tudo menos o Discord". Teste gravando WAV.
- **2b. Servidor:** Cloudflare Worker com a página de assistir, as salas e o Realtime SFU. Precisa de uma conta Cloudflare grátis.
- **2c. Vídeo:** WebView2 captura a janela, junta o som da 2a e transmite por WebRTC até o servidor da 2b.

## Riscos a validar cedo

- **Captura de janela no WebView2**: o evento `ScreenCaptureStarting` existe, mas é preciso testar na Fase 2c. Plano B: captura nativa com Windows.Graphics.Capture.
- **Jogo em tela cheia exclusiva** pode sair preto na captura de janela. Usar "janela sem bordas" ou capturar o monitor.
- **Captura por processo** exclui só uma árvore de processos por vez; confirmar que todo o áudio do Discord sai da árvore do `Discord.exe` principal.
- **A suspensão da ANPD pode ser revista.** Mesmo com a volta do Go Live, o projeto continua útil (várias transmissões, sem limite de Nitro, bot livre na call).

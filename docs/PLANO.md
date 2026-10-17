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

**Conclusão:** o vídeo vai **por fora do Discord** (página no navegador). O Discord fica com o bot: aviso com botão "Assistir", mídia e áudio na call.

## Como funciona (visão de quem usa)

1. Abro o app, escolho a janela do jogo e clico em **Transmitir**.
2. Meu bot posta no canal: `🔴 Vitor está transmitindo — [Assistir]`.
3. Os amigos clicam e assistem no navegador, com vídeo e som do jogo sincronizados, enquanto todos conversam normalmente no canal de voz.
4. Opcional: o bot toca música/arquivos, ou o som do jogo, direto na call.
5. Várias pessoas podem transmitir ao mesmo tempo (cada uma com sua sala e seu bot).

## Arquitetura

```
 PC de quem transmite                                    Internet                 Amigos
┌───────────────────────────────────────────┐
│ App transmissor (C# + WebView2)           │
│  ├ Interface com botões                   │
│  ├ Vídeo da janela (getDisplayMedia,      │   WebRTC    ┌───────────────────┐  navegador
│  │  codificação por hardware do Edge) ────┼────────────►│ Cloudflare        │─────────► página
│  └ Áudio por processo (WASAPI):           │  envia 1x   │  Worker: página,  │  vídeo+som "Assistir"
│     só o jogo  /  tudo menos o Discord ───┤             │  salas            │
│                                           │             │  Realtime SFU +   │
│ Motor do bot (Node + discord.js + DAVE) ──┼──► Discord  │  TURN (CGNAT)     │
│  ├ posta aviso + botão "Assistir"         │   canal de  └───────────────────┘
│  └ toca mídia / som do jogo na call       │   voz/texto
└───────────────────────────────────────────┘
```

| Componente | Tecnologia | Função |
|---|---|---|
| App transmissor (cada PC) | C# .NET 10, WinForms + WebView2 | Janela com botões; captura da janela + WebRTC pelo motor do Edge; captura de áudio por processo (sem retorno do Discord) |
| Motor do bot (cada PC) | Node 24, discord.js, @discordjs/voice | Bot próprio de cada pessoa; aviso com botão; mídia e áudio na call |
| Servidor de transmissão (um só, compartilhado) | Cloudflare Workers + Realtime SFU | Página de assistir, salas, repasse do vídeo para N amigos, TURN |

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

0. **Preparação**: cada pessoa cria seu bot no Discord Developer Portal; você cria uma conta Cloudflare (só na Fase 3); esqueleto do projeto.
1. **Bot base**: bot online, comando e botões, entra na call e toca um arquivo de áudio. Valida o DAVE. Já entrega o "tocar mídia pra galera".
2. **Áudio sem retorno**: componente C# de captura por processo, com os modos "só o jogo" e "tudo menos o Discord". Teste gravando WAV; depois o áudio vai para a call pelo bot.
3. **Vídeo**: WebView2 captura a janela e junta o áudio do componente C#; transmissão WebRTC até a Cloudflare; página de assistir.
4. **Integração**: o botão Transmitir cria a sala e o bot posta o link com o botão Assistir. Cada transmissor tem a própria sala.
5. **Interface final**: layout simples, token salvo no PC (protegido pelo Windows/DPAPI), escolha de qualidade.
6. **Pacote**: zip para os amigos e um guia de 5 minutos para criar o próprio bot.

## Riscos a validar cedo

- **Captura de janela no WebView2**: o evento `ScreenCaptureStarting` existe, mas é preciso testar na Fase 3. Plano B: captura nativa com Windows.Graphics.Capture.
- **Jogo em tela cheia exclusiva** pode sair preto na captura de janela. Usar "janela sem bordas" ou capturar o monitor.
- **Captura por processo** exclui só uma árvore de processos por vez; confirmar que todo o áudio do Discord sai da árvore do `Discord.exe` principal.
- **A suspensão da ANPD pode ser revista.** Mesmo com a volta do Go Live, o projeto continua útil (várias transmissões, sem limite de Nitro, bot livre na call).

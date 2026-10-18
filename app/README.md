# App transmissor (Windows)

Programa que transmite a **janela do jogo** com **só o som do jogo** para os amigos. A voz da call do Discord não entra. Ele foi construído por partes, conforme o [plano](../docs/PLANO.md).

| Parte | Estado |
|---|---|
| **2a. Som do jogo:** captura do som de um programa, sem o Discord | ✅ Pronto |
| **2b. Servidor de transmissão** (Cloudflare), em [`server/`](../server/README.md) | ✅ Pronto |
| **2c. App:** imagem da janela + som da 2a, enviados para o servidor | ✅ Pronto |

## Como funciona

1. O app abre a página de transmitir do **seu servidor** dentro dele (WebView2, o motor do Edge que já vem no Windows).
2. Você escolhe a **janela do jogo**. Dessa janela, a página pega **só a imagem**.
3. O app descobre qual programa é o dono da janela e captura o **som só desse programa**, direto do Windows. Ele manda esse som para a página em blocos de 20 ms.
4. A página envia imagem e som juntos para o servidor, e os amigos assistem pelo link de sempre.

Durante a transmissão dá para **trocar de janela** (o som troca junto) e **mudar o modo do som** sem derrubar nada: quem assiste nem precisa recarregar.

Para descobrir o dono da janela, o app usa o rótulo que o motor do Chromium dá para a captura (`window:<janela>:0`). Se esse rótulo vier diferente, o app mostra a lista de programas abertos para você escolher de qual sai o som.

## Requisitos

- Windows 10 versão 2004 ou mais novo (Windows 11 recomendado)
- Para usar: nada além do `Transmissor.exe` (veja abaixo). Para compilar: [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- O servidor publicado (veja [`server/`](../server/README.md))

## Usar

Na raiz do repositório:

```bash
dotnet run --project app/src/Transmissor.App
```

Na primeira vez, o app pede o **endereço do seu servidor** (o que apareceu no `npm run deploy`). Depois é só:

1. Digitar a chave de transmissão, o título e a qualidade.
2. Em **Som**, deixar **Todo o som do PC, menos o Discord** (o padrão).
3. Clicar em **Escolher a janela do jogo** e escolher a janela.

> Para o Discord ficar de fora, transmita **pelo app**. A página aberta num navegador comum só consegue o som de uma aba.

O menu do app tem **Servidor…** (trocar o endereço), **Recarregar** (F5) e **Abrir registro**, um arquivo com o que o app fez. Ele ajuda a entender problemas e fica em `%LocalAppData%\DiscordBot\transmissor.log`.

## Gerar o `.exe` para os amigos

```bash
dotnet publish app/src/Transmissor.App -p:PublishProfile=Pacote
```

Sai um `artefatos/Transmissor.exe` de uns 50 MB, que já leva o .NET dentro: quem recebe só abre, sem instalar nada. Ao publicar uma Release no GitHub, o workflow `release.yml` gera esse mesmo `.exe` e anexa na Release. As instruções para quem recebe estão no [guia para os amigos](../docs/AMIGOS.md).

O `.exe` não tem assinatura digital, então o Windows mostra "O Windows protegeu o computador" na primeira vez (**Mais informações → Executar assim mesmo**).

## Compilar e testar

```bash
dotnet build app/Transmissor.slnx
```

```bash
dotnet test app/Transmissor.slnx
```

Os testes da categoria `Integracao` tocam um tom num processo separado e conferem a captura nos dois modos. Por isso precisam de uma saída de som, e o CI pula esses testes (`--filter "Categoria!=Integracao"`).

## Testar só a captura de som (`captura-audio`)

Ferramenta de linha de comando para conferir a captura sem transmitir:

```bash
dotnet run --project app/src/Transmissor.Audio.Cli -- janelas
```

```bash
dotnet run --project app/src/Transmissor.Audio.Cli -- gravar --janela "Minecraft" --segundos 10
```

| Alvo | O que grava |
|---|---|
| `--janela "texto"` | Só o som do programa cuja janela tem esse texto no título (e dos processos filhos dele) |
| `--pid N` | Só o som do processo N (e dos filhos) |
| `--sem-discord` | Todo o som do PC, menos o do Discord |

Outras opções: `--segundos N` (padrão: até apertar Ctrl+C) e `--saida arquivo.wav` (padrão: `captura.wav`). Com `--saida -`, o áudio sai cru no stdout.

O áudio sai sempre em PCM 16 bits, 48 kHz, estéreo, o formato usado pelo Opus e pelo WebRTC. Enquanto o programa está calado, a captura entrega silêncio, para o áudio acompanhar o relógio e não perder a sincronia com o vídeo.

### Qual modo de som usar

A regra do app é: **o som do Discord nunca entra**.

- **Tudo menos o Discord** (padrão): entra qualquer som do PC, do jogo ou de outros programas, menos o do Discord. Ele exclui o processo principal do Discord e todos os processos filhos, que são de onde sai o som da call. Funciona com o app do Discord; se você usa o Discord **pelo navegador**, a call sai do navegador e entra na captura. Nesse caso, use "só o programa".
- **Só o programa da janela:** entra só o som do programa da janela escolhida. Se essa janela for do próprio Discord, o app volta para "tudo menos o Discord".
- Na **tela inteira**, o app sempre usa "tudo menos o Discord".

Para conferir no seu PC que o som do Discord fica de fora, entre numa call e rode:

```bash
dotnet run --project app/src/Transmissor.Audio.Cli -- sessoes
```

Ele lista quem tem som aberto e mostra "OK" quando todo o som do Discord fica de fora.

## Estrutura

| Pasta | O que é |
|---|---|
| `src/Transmissor.App` | O app: janela com WebView2 (`JanelaPrincipal`), ponte de som com a página (`PonteDeAudio`), configuração e janelinhas |
| `src/Transmissor.Audio` | Biblioteca de captura: `CapturaDeAudio`, `Processos` (janelas, processos, dono da janela), `PreenchedorDeSilencio` |
| `src/Transmissor.Audio.Cli` | Ferramenta `captura-audio` |
| `tests/Transmissor.Audio.Tests` | Testes (xUnit) |

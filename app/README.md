# App transmissor (Windows)

Programa que vai capturar a janela e o som do jogo e transmitir para os amigos. Ele está sendo construído por partes, conforme o [plano](../docs/PLANO.md).

| Parte | Estado |
|---|---|
| **2a. Som do jogo:** captura do som de um programa, sem o Discord | ✅ Pronto |
| 2b. Servidor de transmissão (Cloudflare), em [`server/`](../server/README.md) | ✅ Pronto |
| 2c. Vídeo da janela + envio por WebRTC | Planejado |

## Requisitos

- Windows 10 versão 2004 ou mais novo (Windows 11 recomendado)
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)

## Compilar e testar

Na raiz do repositório:

```bash
dotnet build app/Transmissor.slnx
```

```bash
dotnet test app/Transmissor.slnx
```

Os testes da categoria `Integracao` tocam um tom num processo separado e conferem a captura nos dois modos. Por isso precisam de uma saída de som, e o CI pula esses testes (`--filter "Categoria!=Integracao"`).

## Testar a captura de som (`captura-audio`)

Ferramenta de linha de comando para conferir a captura antes de ela entrar no app:

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

### Qual modo usar

- **Só o jogo** (`--janela` / `--pid`) é o recomendado: nada além do jogo entra na transmissão.
- **Tudo menos o Discord** (`--sem-discord`) serve para transmitir vários programas juntos. Ele só exclui o app do Discord: se você usa o Discord pelo navegador, a call entra na captura. Nesse caso, use "só o jogo".

## Estrutura

| Pasta | O que é |
|---|---|
| `src/Transmissor.Audio` | Biblioteca de captura: `CapturaDeAudio`, `Processos` (janelas e processos), `PreenchedorDeSilencio` |
| `src/Transmissor.Audio.Cli` | Ferramenta `captura-audio` |
| `tests/Transmissor.Audio.Tests` | Testes (xUnit) |

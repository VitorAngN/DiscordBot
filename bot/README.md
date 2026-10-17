# Bot (motor do Discord)

Bot que entra no seu canal de voz e toca arquivos de áudio, controlado por comandos e por um painel com botões.

Cada pessoa usa **o próprio bot**: assim várias pessoas podem usar ao mesmo tempo, e ninguém precisa compartilhar token.

## Requisitos

- Windows 10/11 (também roda em Linux e macOS)
- [Node.js 24](https://nodejs.org/) ou mais recente

## 1. Criar o seu bot (uns 5 minutos)

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications) e clique em **New Application**. Dê um nome, por exemplo "Bot do Vitor".
2. No menu **Bot**, clique em **Reset Token** e copie o token. Ele só aparece uma vez.
3. Ainda em **Bot**, desmarque **Public Bot** se quiser que só você possa adicionar o bot a servidores.

Nenhuma "Privileged Gateway Intent" precisa ser ativada.

> O token é a senha do bot. Não mande para ninguém e não coloque no código.

## 2. Configurar e iniciar

Dentro da pasta `bot`:

```bash
npm install
```

Copie `.env.example` para `.env` e cole o token em `DISCORD_TOKEN=`.

```bash
npm start
```

O terminal mostra `Bot online` e um **link para convidar o bot**. Abra o link, escolha o servidor e confirme.

## 3. Usar

1. Coloque arquivos de áudio na pasta `bot/midia`: mp3, wav, ogg, opus, flac, m4a, aac ou o áudio de webm, mp4 e mkv. Para um teste rápido, `npm run som-teste` cria um `teste.wav`.
2. Entre num canal de voz e use os comandos:

| Comando | O que faz |
|---|---|
| `/painel` | Mostra o painel com botões: escolher arquivo, entrar, pausar, parar, volume, sair |
| `/tocar arquivo:` | Toca um arquivo da pasta (o nome é autocompletado) |
| `/entrar` | Coloca o bot no seu canal de voz |
| `/parar` | Para o que está tocando |
| `/sair` | Tira o bot da call |

O painel se atualiza sozinho quando uma faixa termina ou o bot sai da call.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `Token inválido` | Gere outro token em **Bot → Reset Token** e atualize o `.env` |
| Os comandos não aparecem | Confira se o bot foi convidado pelo link do terminal; reinicie o Discord (Ctrl+R) |
| O bot entra, mas não toca | Rode `npm run verificar`: Opus, criptografia, DAVE e FFmpeg precisam aparecer como encontrados |
| "Não tenho permissão para entrar" | Dê ao bot as permissões **Conectar** e **Falar** naquele canal |

## Desenvolvimento

```bash
npm test
```

| Arquivo | Responsabilidade |
|---|---|
| `src/index.js` | Inicia o cliente, registra comandos, encerramento |
| `src/comandos.js` | Comandos de barra, autocompletar e botões do painel |
| `src/player.js` | Conexão de voz e reprodução por servidor |
| `src/painel.js` | Monta a mensagem do painel |
| `src/midia.js` | Lista e valida arquivos da pasta de mídia |

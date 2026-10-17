# Servidor de transmissão (Cloudflare)

Worker da Cloudflare que leva o vídeo e o som de quem transmite até os amigos. Ele:

- cria as **salas** (uma por transmissão), guardadas num Durable Object;
- serve a **página de assistir** (`/s/<sala>`), o link que vai para o Discord;
- conversa com o **Cloudflare Realtime SFU**, que recebe o vídeo uma vez e repassa para cada espectador;
- tem uma **página de teste** (`/transmitir`) para transmitir pelo navegador antes de o app ficar pronto.

O segredo do Realtime fica só no servidor e nunca vai para o navegador. Criar sala exige a **chave de transmissão**; para assistir basta o link.

## 1. Criar a app do Realtime

1. No [painel da Cloudflare](https://dash.cloudflare.com/), abra **Realtime → Serverless SFU** e clique em **Create**.
2. Dê um nome (por exemplo `discordbot`) e guarde o **App ID** e o **App Secret**. O App Secret é uma senha: não mande para ninguém.

## 2. Publicar o servidor

Na pasta `server`:

```bash
npm install
```

Conecte o Wrangler à sua conta (abre o navegador para você autorizar):

```bash
npx wrangler login
```

Publique. Na primeira vez, o Wrangler pode pedir para você escolher um subdomínio `workers.dev`:

```bash
npm run deploy
```

Cadastre os três segredos. Cada comando pede o valor, que você cola ou digita no terminal:

```bash
npx wrangler secret put REALTIME_APP_ID
```

```bash
npx wrangler secret put REALTIME_APP_SECRET
```

```bash
npx wrangler secret put TRANSMISSAO_CHAVE
```

O `TRANSMISSAO_CHAVE` é uma senha que você inventa. Quem for transmitir precisa dela; quem só assiste, não.

Pronto: abra `https://discordbot-transmissao.<seu-subdominio>.workers.dev/transmitir` para testar.

## 3. Testar uma transmissão

1. Abra `/transmitir`, digite a chave e um título e clique em **Escolher o que transmitir**.
2. Escolha uma **aba** com som (um vídeo do YouTube, por exemplo). Pelo navegador, compartilhar a tela inteira com som também pega a voz da call do Discord; o app do Windows resolve isso capturando só o jogo.
3. Copie o link e abra em outro aparelho (ou mande para um amigo). Clique em **▶ Assistir**.

## Rodar no seu PC (desenvolvimento)

Copie o arquivo de exemplo de segredos locais:

```bash
cp .dev.vars.example .dev.vars
```

Preencha o `.dev.vars` (o git ignora esse arquivo) e rode:

```bash
npm run dev
```

O servidor abre em `http://localhost:8787`. Para assistir de outro aparelho, use o servidor publicado.

```bash
npm test
```

```bash
npm run tipos
```

## API

Usada pela página de transmitir e, na parte 2c, pelo app do Windows.

| Método e rota | Quem | O que faz |
|---|---|---|
| `POST /api/salas` | Chave de transmissão | Cria a sala. Devolve `sala`, `link` e o `token` do transmissor |
| `GET /api/salas/:sala` | Qualquer um | Título, estado (`aguardando`, `ao-vivo`, `encerrada`) e número da publicação |
| `POST /api/salas/:sala/publicar` | Token | Recebe a oferta WebRTC e as faixas; devolve a resposta do SFU |
| `POST /api/salas/:sala/ao-vivo` | Token | Confirma que a conexão subiu; a sala passa a aparecer como ao vivo |
| `DELETE /api/salas/:sala` | Token | Encerra a sala |
| `POST /api/salas/:sala/assistir` | Qualquer um | Cria a sessão de quem assiste; devolve a oferta do SFU |
| `POST /api/salas/:sala/assistir/:sessao/resposta` | Qualquer um | Envia a resposta WebRTC de quem assiste |

Os erros vêm como `{ "erro": "mensagem" }`. Uma sala sem atividade por 24 horas é apagada sozinha.

## Custos

O Cloudflare Realtime tem 1.000 GB grátis por mês (SFU + TURN somados). Só conta o que sai para quem assiste. Em 1080p a 60 fps, isso dá umas 370 horas-espectador por mês; veja a conta no [plano](../docs/PLANO.md). Workers e Durable Objects também cabem no plano grátis para esse uso.

## Estrutura

| Arquivo | Responsabilidade |
|---|---|
| `src/index.ts` | Entrada do Worker, rotas de página e o Durable Object `Sala` |
| `src/api.ts` | Rotas `/api/*`, validação e permissões |
| `src/salas.ts` | Regras das salas, IDs, tokens |
| `src/sfu.ts` | Cliente da API do Realtime SFU |
| `public/` | Páginas de assistir e de transmitir |
| `test/` | Testes (Vitest) |

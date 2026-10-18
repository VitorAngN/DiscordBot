# Servidor de transmissão (Cloudflare)

Worker da Cloudflare que leva o vídeo e o som de quem transmite até os amigos. Ele:

- cria as **salas** (uma por transmissão), guardadas num Durable Object;
- serve a **página de assistir** (`/s/<sala>`), o link que vai para o Discord;
- conversa com o **Cloudflare Realtime SFU**, que recebe o vídeo uma vez e repassa para cada espectador;
- tem uma **página de teste** (`/transmitir`) para transmitir pelo navegador antes de o app ficar pronto.

> Nunca mexeu com terminal? Siga o [guia "Monte o seu próprio servidor"](../docs/SERVIDOR-PROPRIO.md), com os pré-requisitos e cada passo explicado. Este README é a referência técnica.

O segredo do Realtime fica só no servidor e nunca vai para o navegador. Criar sala exige a **chave de transmissão**. Para assistir, com a **senha para assistir** configurada, só entra quem tem a senha, mesmo que o link vaze. Uma **trava de uso** garante que o servidor fique dentro da cota grátis da Cloudflare.

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

Cadastre os segredos. Cada comando pede o valor, que você cola ou digita no terminal:

```bash
npx wrangler secret put REALTIME_APP_ID
```

```bash
npx wrangler secret put REALTIME_APP_SECRET
```

```bash
npx wrangler secret put TRANSMISSAO_CHAVE
```

```bash
npx wrangler secret put ASSISTIR_CHAVE
```

Você inventa as duas últimas senhas:

- `TRANSMISSAO_CHAVE`: para transmitir. Só você e quem for transmitir precisam dela.
- `ASSISTIR_CHAVE`: para assistir. Mande para os amigos; cada um digita uma vez por navegador. Sem ela, qualquer pessoa com o link assiste.

Pronto: abra `https://discordbot-transmissao.<seu-subdominio>.workers.dev/transmitir` para testar.

## 3. Testar uma transmissão

1. Abra `/transmitir`, digite a chave e um título, escolha a **qualidade** e clique em **Escolher o que transmitir**.
2. Escolha uma **aba** com som (um vídeo do YouTube, por exemplo). Pelo navegador, compartilhar a tela inteira com som também pega a voz da call do Discord; o app do Windows resolve isso capturando só o jogo.
3. Copie o link e abra em outro aparelho (ou mande para um amigo). Clique em **▶ Assistir**.

Durante a transmissão, **🔄 Trocar o que transmitir** troca a aba ou janela sem derrubar a sala; quem assiste não precisa recarregar.

Aberta dentro do [app do Windows](../app/README.md), a mesma página entra no **modo app**: ela pega só a imagem da janela, e o som vem do app, só do programa do jogo, sem a call do Discord.

Na página de assistir, use **⛶ Tela cheia** (ou duplo clique, ou a tecla F) e **🗗 Janela flutuante** (ou a tecla P). A janela flutuante fica por cima de tudo e dá para mover e redimensionar. Para ver na TV, use o **Transmitir…** do próprio Chrome (menu ⋮).

### Qualidades

O teto é Full HD. Quem transmite escolhe a qualidade, e a trava de uso conta cada espectador pela qualidade da sala:

| Qualidade | Vídeo até | Cada espectador gasta até | 900 GB rendem |
|---|---|---|---|
| 1080p · 60 fps | 6 Mbps | ~2,9 GB/h | ~310 horas-espectador |
| 1080p · 30 fps | 4 Mbps | ~1,9 GB/h | ~460 h |
| **720p · 60 fps** (padrão) | 3,5 Mbps | ~1,7 GB/h | ~530 h |
| 720p · 30 fps | 2,5 Mbps | ~1,2 GB/h | ~720 h |

Mais qualidade também pede mais upload da internet de quem transmite (o vídeo sai uma vez só, para a Cloudflare).

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
| `POST /api/salas` | Chave de transmissão | Cria a sala (`titulo`, `nome`, `avisar` e `qualidade`: `1080p60`, `1080p30`, `720p60` ou `720p30`). Devolve `sala`, `link` e o `token` do transmissor |
| `GET /api/uso` | Chave de transmissão | Uso estimado dos últimos 31 dias e o limite, em bytes |
| `GET /api/salas/:sala` | Senha para assistir | Título, estado (`aguardando`, `ao-vivo`, `encerrada`) e número da publicação |
| `POST /api/salas/:sala/publicar` | Token | Recebe a oferta WebRTC e as faixas; devolve a resposta do SFU |
| `POST /api/salas/:sala/ao-vivo` | Token | Confirma que a conexão subiu; a sala passa a aparecer como ao vivo e o bot posta o aviso. Devolve `discord`: `publicado`, `ja-publicado`, `desligado`, `nao-configurado` ou `falhou` |
| `POST /api/salas/:sala/sinal` | Token | Sinal de vida de quem transmite (a cada 20 s); responde quantos estão assistindo (`espectadores`), ou `410` se a sala já encerrou |
| `DELETE /api/salas/:sala` | Token | Encerra a sala |
| `POST /api/salas/:sala/assistir` | Senha para assistir | Cria a sessão de quem assiste; devolve a oferta do SFU |
| `POST /api/salas/:sala/assistir/:sessao/resposta` | Senha para assistir | Envia a resposta WebRTC de quem assiste |
| `POST /api/salas/:sala/assistir/:sessao/presenca` | Senha para assistir | "Continuo assistindo" (a cada 15 s); responde se pode continuar (`continuar`, `motivo`). Quem fica 40 s sem mandar deixa de contar como espectador |

As senhas e tokens vão no cabeçalho `Authorization: Bearer ...`. Sem a senha para assistir configurada, as rotas de quem assiste ficam abertas para quem tem o link. Os erros vêm como `{ "erro": "mensagem" }`; o limite de uso e o bloqueio por senhas erradas respondem **429**. Uma sala ao vivo sem sinal por 2 minutos é encerrada; uma sala parada por 24 horas é apagada.

## Aviso no Discord (opcional)

Quando alguém fica ao vivo, o **seu bot** posta no canal escolhido a mensagem `🔴 Fulano está transmitindo`, com o título, a qualidade e o botão **▶ Assistir** (que abre o link da sala). Quando a transmissão acaba, ele troca a mensagem por `⚫ Fulano encerrou a transmissão`, com a duração, e tira o botão. A mensagem nunca marca ninguém.

O servidor posta direto pela API do Discord: o bot **não precisa estar ligado** em lugar nenhum.

Para ligar:

1. No Discord, ative o **Modo desenvolvedor**: **Configurações de Usuário → Avançado → Modo desenvolvedor**.
2. Clique com o botão direito no canal onde os avisos devem aparecer → **Copiar ID do canal**.
3. Garanta que o bot está no servidor e, nesse canal, tem as permissões **Ver canal**, **Enviar mensagens** e **Inserir links** (o link de convite do bot já pede essas).
4. Na pasta `server`, cadastre os dois segredos:

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
```
↑ o **token do bot**, o mesmo do `bot/.env` (Developer Portal → Bot → Reset Token, se precisar de um novo)

```bash
npx wrangler secret put DISCORD_CANAL_AVISOS
```
↑ o **ID do canal** copiado no passo 2

Na página de transmitir, cada um escolhe o **nome** que aparece no aviso e pode desmarcar **Avisar no Discord**. Sem os dois segredos, a transmissão funciona normal e a página avisa para mandar o link manualmente. Se o Discord falhar (por exemplo, sem permissão no canal), a transmissão segue do mesmo jeito.

**Sinal de vida:** a página de transmitir avisa o servidor a cada 20 s que continua no ar. Se ela some por **2 minutos** (o app foi fechado sem encerrar, o PC desligou ou a internet caiu), o servidor encerra a sala sozinho e atualiza o aviso do Discord. Assim a mensagem não fica "ao vivo" para sempre.

## Segurança

O servidor é **particular**: só usa quem tem as senhas.

- **Senhas:** criar sala e ver o uso pedem a chave de transmissão; tudo de quem assiste (até o título da sala) pede a senha para assistir. A comparação é feita pelo hash, em tempo constante. O token de cada sala é guardado só como hash.
- **Limite de tentativas:** **8 senhas erradas** em 10 minutos bloqueiam aquele IP por **15 minutos**, mesmo que depois ele acerte. Pedido sem senha (abrir o link pela primeira vez) não conta. Fica num Durable Object `Tentativas` por IP, que se apaga sozinho quando o bloqueio e a janela acabam.
- **Buscadores:** `robots.txt` pede para não listar nada, e toda resposta leva `X-Robots-Tag: noindex, nofollow`.
- **Páginas:** `Content-Security-Policy` só deixa rodar script e estilo do próprio servidor, `frame-ancestors 'none'` e `X-Frame-Options: DENY` impedem embutir as páginas em outro site, e `Referrer-Policy: no-referrer` não deixa o link da sala vazar para sites externos (em `public/_headers` e, para `/s/<sala>`, no Worker).
- **Segredos** só no servidor (Workers Secrets): o App Secret do Realtime nunca vai para o navegador.

Use senhas fortes (por exemplo, 3 palavras aleatórias) e troque com `npx wrangler secret put` se alguma vazar.

## Custos e trava de uso

O Cloudflare Realtime tem **1.000 GB grátis por mês** (SFU + TURN somados) e cobra US$ 0,05 por GB acima disso. Só conta o que sai para quem assiste; quem transmite envia de graça. Workers e Durable Objects também cabem no plano grátis para esse uso.

A trava de uso mantém o servidor dentro da cota grátis:

- A página de assistir avisa o servidor a cada 15 segundos que continua assistindo. O servidor conta esse tempo como se o espectador recebesse o **teto da qualidade da sala** (vídeo + som + cabeçalhos; veja a tabela de qualidades). É uma estimativa de pior caso: o uso real fica abaixo.
- Ele soma os **últimos 31 dias**, porque o mês de cobrança pode não começar no dia 1.
- Ao chegar em **900 GB** (`LIMITE_GB_MES` no `wrangler.jsonc`, que nunca passa de 1.000), ele encerra quem está assistindo e recusa novas salas, novas publicações e novos espectadores. Quando o uso dos últimos 31 dias baixar, tudo volta sozinho.
- A página de transmitir mostra o uso estimado.

Por exemplo, 4 amigos assistindo 3 horas por dia, todo fim de semana, gastam por volta de 180 GB em 720p · 60 fps, ou 300 GB em 1080p · 60 fps.

A contagem depende da página de assistir do próprio servidor. Uma página modificada de propósito poderia não avisar, e por isso a senha para assistir também protege a cota.

## Estrutura

| Arquivo | Responsabilidade |
|---|---|
| `src/index.ts` | Entrada do Worker, rotas de página e os Durable Objects `Sala` e `Uso` |
| `src/api.ts` | Rotas `/api/*`, validação e permissões |
| `src/salas.ts` | Regras das salas, IDs, tokens |
| `src/sfu.ts` | Cliente da API do Realtime SFU |
| `src/uso.ts` | Trava de uso: estimativa por presença e soma dos últimos 31 dias |
| `src/tentativas.ts` | Limite de tentativas de senha por IP |
| `src/discord.ts` | Aviso no Discord: posta e edita a mensagem pelo bot |
| `public/_headers`, `public/robots.txt` | Cabeçalhos de segurança e bloqueio de buscadores |
| `public/js/qualidade.js` | Qualidades de transmissão, usadas pela página e pelo servidor |
| `public/js/tela.js` | Tela cheia e janela flutuante (páginas de assistir e de transmitir) |
| `public/js/ponte-app.js` | Modo app: recebe do app do Windows o som só do jogo |
| `public/js/fila-audio.js`, `ponte-audio.worklet.js` | Fila e AudioWorklet que tocam esse som na transmissão |
| `public/` | Páginas de assistir e de transmitir |
| `test/` | Testes (Vitest) |

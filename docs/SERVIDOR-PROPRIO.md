# Monte o seu próprio servidor

Este guia é para quem quer o **próprio** servidor de transmissão, com as **próprias** senhas e a **própria** cota grátis. Leva uns 20 minutos e não precisa saber programar.

> Vai usar o servidor de um amigo? Então você não precisa de nada disto: veja o [guia para os amigos](AMIGOS.md).

## O que você vai ter no fim

- Um servidor na Cloudflare, num endereço como `https://discordbot-transmissao.seunome.workers.dev`.
- Duas senhas suas: uma para **transmitir** e outra para **assistir**.
- O `Transmissor.exe` conectado nesse servidor, pronto para transmitir para os seus amigos.

Tudo no plano grátis. A trava de uso para antes de passar da cota grátis.

## 1. O que instalar antes

| O quê | Para quê | Onde |
|---|---|---|
| **Conta na Cloudflare** (grátis) | Onde o servidor vai rodar | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). Confirme o e-mail que eles mandarem |
| **Node.js** (versão LTS) | Para publicar o servidor | [nodejs.org](https://nodejs.org/): baixe o instalador **LTS** e clique em "Next" até o fim |
| **O projeto** | Os arquivos do servidor | Na [página do projeto](https://github.com/VitorAngN/DiscordBot), clique no botão verde **Code → Download ZIP**. Depois clique com o botão direito no ZIP → **Extrair tudo** |

Para conferir se o Node.js instalou, abra um terminal (veja o passo 3) e rode o comando abaixo. Ele deve mostrar um número, como `v24.x.x`:

```bash
node --version
```

## 2. Criar a app do Realtime

1. No [painel da Cloudflare](https://dash.cloudflare.com/), clique em **Realtime** no menu da esquerda e depois em **Serverless SFU**.
2. Clique em **Create**, dê um nome (por exemplo `transmissao`) e confirme.
3. Vão aparecer o **App ID** e o **App Secret**. Copie os dois para um Bloco de Notas. **Não mande o App Secret para ninguém.**

## 3. Abrir o terminal na pasta do servidor

1. Abra a pasta do projeto que você extraiu e entre na pasta **`server`**.
2. Clique na **barra de endereço** do Explorador de Arquivos (onde aparece o caminho da pasta), apague o que estiver lá, digite `cmd` e aperte **Enter**.

Abre uma tela preta (o terminal) já dentro da pasta `server`. Os próximos comandos são todos digitados ali: cole o comando e aperte **Enter**.

## 4. Instalar e conectar

Baixe o que o servidor precisa (leva um ou dois minutos):

```bash
npm install
```

Conecte o terminal à sua conta da Cloudflare. O navegador vai abrir: confira se é o site `dash.cloudflare.com` e clique em **Allow**.

```bash
npx wrangler login
```

## 5. Publicar o servidor

```bash
npm run deploy
```

Na primeira vez, ele pergunta se você quer registrar um subdomínio `workers.dev`. Digite `y`, depois um nome curto (só letras minúsculas e números) e aperte **Enter**.

No fim aparece o **endereço do seu servidor**, algo como `https://discordbot-transmissao.seunome.workers.dev`. **Guarde esse endereço.** Nos primeiros minutos ele pode ainda não abrir no navegador: o certificado de segurança de um subdomínio novo leva até uns 15 minutos para ficar pronto.

## 6. Cadastrar as 4 senhas

Cada comando pede um valor. Cole ou digite e aperte **Enter**. **Na tela não aparece nada enquanto você digita**, é de propósito.

```bash
npx wrangler secret put REALTIME_APP_ID
```
↑ cole o **App ID** do passo 2

```bash
npx wrangler secret put REALTIME_APP_SECRET
```
↑ cole o **App Secret** do passo 2

```bash
npx wrangler secret put TRANSMISSAO_CHAVE
```
↑ invente a **senha para transmitir**

```bash
npx wrangler secret put ASSISTIR_CHAVE
```
↑ invente a **senha para assistir** (diferente da outra)

Use senhas fortes, como 3 palavras aleatórias juntas (`cavalo-lanterna-pipoca`), e anote no Bloco de Notas. Ninguém consegue ver essas senhas depois, nem você; se esquecer, é só rodar o comando de novo com uma nova.

## 7. Testar

1. Baixe o **`Transmissor.exe`** na [página de downloads](https://github.com/VitorAngN/DiscordBot/releases/latest) e abra. Se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.
2. Cole o **endereço do seu servidor** e clique em **Salvar**.
3. Digite a senha de transmitir, deixe o **Som** em **"Todo o som do PC, menos o Discord"** e clique em **Escolher a janela do jogo**.
4. Quando aparecer **● AO VIVO**, copie o link, abra no celular, digite a senha de assistir e toque em **▶ Assistir**.

## 8. Passar para os seus amigos

- **Para todo mundo:** o link de cada transmissão (aparece no app) e a **senha de assistir**.
- **Para quem também vai transmitir:** o link de download do [Transmissor.exe](https://github.com/VitorAngN/DiscordBot/releases/latest), o **endereço do seu servidor** e a **senha de transmitir**. Mande no privado.

Mostre para eles o [guia para os amigos](AMIGOS.md). Eles **não** precisam de conta na Cloudflare.

## Quando sair uma versão nova

1. Baixe o projeto de novo (**Code → Download ZIP**) e extraia.
2. Abra o terminal na nova pasta `server` (passo 3) e rode `npm install` e depois `npm run deploy`.

As senhas continuam guardadas na Cloudflare: não precisa cadastrar de novo. Os amigos que transmitem só baixam o `Transmissor.exe` novo.

## Custos

A Cloudflare dá **1.000 GB grátis por mês** de vídeo saindo para quem assiste. Transmitir é de graça. A **trava de uso** encerra quem assiste e bloqueia novas transmissões ao chegar em **900 GB** nos últimos 31 dias, então a conta não chega a ser cobrada. Em 720p · 60 fps, isso dá mais de 500 horas de amigos assistindo. Os detalhes estão em [server/README.md](../server/README.md#custos-e-trava-de-uso).

## Se algo der errado

| Mensagem ou problema | O que fazer |
|---|---|
| `'npm' não é reconhecido…` | O Node.js não está instalado, ou o terminal foi aberto antes da instalação: instale e abra um terminal novo |
| `Could not read package.json` | O terminal não está na pasta `server`: refaça o passo 3 |
| Erro de autenticação ao publicar | Rode `npx wrangler login` de novo |
| O endereço não abre logo depois de publicar | Espere uns 15 minutos (certificado do subdomínio novo) |
| No app: "ainda não tem as credenciais do Cloudflare Realtime" | Faltou cadastrar `REALTIME_APP_ID` ou `REALTIME_APP_SECRET` (passo 6) |
| No app: "ainda não tem a chave de transmissão configurada" | Faltou cadastrar `TRANSMISSAO_CHAVE` (passo 6) |
| "Chave de transmissão inválida" | A senha digitada no app não é a do passo 6; rode o comando de novo se esqueceu |

Quer também o bot do Discord, que toca música na call? Ele é opcional e tem um guia próprio em [bot/README.md](../bot/README.md).

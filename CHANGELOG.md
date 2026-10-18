# Changelog

Todas as mudanças relevantes do projeto ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Corrigido

- O rodapé do aviso no Discord só fala em senha quando o servidor pede a senha para assistir.

## [1.0.0] - 2026-10-18

Fase 5: **pronto para os amigos**. Um `Transmissor.exe` só, que avisa quando sai versão nova.

### Adicionado

- **Aviso de versão nova**: ao abrir, o app confere no GitHub a última Release e, se ela for mais nova, mostra **⬆ Baixar a versão X** no alto da janela e um aviso perto do relógio. Ele só lê a página pública da Release: não manda nada sobre quem usa e não baixa nada sozinho.
- A versão do app aparece no título da janela e no registro.

## [0.4.0] - 2026-10-18

Fase 4: a **interface do app**. Tela mais limpa, chave protegida pelo Windows, quantos estão assistindo, ícone na bandeja e atalho para encerrar de dentro do jogo.

### Adicionado

- **Quantos estão assistindo**: ao vivo, a tela de transmitir mostra "👀 2 pessoas assistindo", atualizado a cada 20 s.
- **Chave de transmissão protegida pelo Windows**: o app guarda a chave neste PC com DPAPI (só o seu usuário do Windows abre) depois que ela funciona, e não pede de novo. A que versões antigas guardavam no navegador, sem proteção, passa para o app. Chave errada é esquecida, e trocar de servidor também apaga a chave.
- **Tela do app mais limpa**: formulário em duas colunas, botão grande para começar e prévia só durante a transmissão, para caber tudo na janela sem rolar.
- **Ícone na bandeja**: ao vivo, minimizar esconde a janela perto do relógio. O ícone fica vermelho, mostra quantos assistem e tem menu para encerrar ou voltar para trocar a janela.
- **Atalho Ctrl+Shift+F10**: encerra a transmissão de qualquer programa, inclusive de dentro do jogo.
- Ícone do app (roxo parado, vermelho ao vivo) e confirmação antes de fechar o app ao vivo.

### Corrigido

- O campo "Som" e o seletor de som ao vivo apareciam na página de transmitir pelo navegador, onde não valem.

## [0.3.0] - 2026-10-18

Fase 3: o bot **avisa no Discord** quando alguém fica ao vivo, e o servidor ficou mais protegido.

### Adicionado

- Guia [Monte o seu próprio servidor](docs/SERVIDOR-PROPRIO.md), com os pré-requisitos e cada passo para quem nunca usou terminal, e a tabela "Por onde começar" no README.
- Limite de tentativas de senha: 8 senhas erradas em 10 minutos bloqueiam o IP por 15 minutos (chave de transmissão e senha para assistir).
- Servidor escondido dos buscadores (`robots.txt` e `X-Robots-Tag`) e cabeçalhos de segurança nas páginas: política de conteúdo, proibição de embutir em outros sites e sem vazar o link da sala para sites externos.
- **Aviso no Discord** (Fase 3): ao ficar ao vivo, o servidor usa o seu bot para postar no canal `🔴 Fulano está transmitindo` com o botão Assistir, e troca por "encerrou", com a duração, quando acaba. Configurável com `DISCORD_BOT_TOKEN` e `DISCORD_CANAL_AVISOS`; o bot não precisa estar ligado.
- O registro do servidor (`wrangler tail`) mostra o que houve com cada aviso: postado (com o ID da mensagem), desligado ou, se o Discord recusar, qual campo ele recusou.
- Campo "Seu nome" e opção "Avisar no Discord" na página de transmitir.
- Sinal de vida de quem transmite: sem sinal por 2 minutos (app fechado, PC desligado), a sala encerra sozinha e o aviso é atualizado.

## [0.2.0] - 2026-10-17

Fase 2: transmissão do jogo para os amigos, com vídeo e som, **sem a call do Discord**.

### Adicionado

- **App transmissor para Windows** (`Transmissor.exe`): você escolhe a janela do jogo, e ele envia a imagem dela e o som do PC **menos o Discord** (padrão) ou só o som do programa da janela. Descobre sozinho de qual programa é a janela e, se não conseguir, pergunta.
- `Transmissor.exe` em um arquivo só, com o .NET dentro, anexado automaticamente a cada Release, mais o [guia para os amigos](docs/AMIGOS.md).
- Trocar de janela durante a transmissão sem derrubar a sala (o som troca junto) e mudar o modo de som ao vivo.
- **Servidor de transmissão** na Cloudflare (`server/`): salas em Durable Objects e repasse de vídeo e som pelo Realtime SFU.
- **Página de assistir** (`/s/<sala>`): reconexão automática, tela cheia (deita a tela no celular) e janela flutuante, com atalhos F e P.
- **Senha para assistir** (`ASSISTIR_CHAVE`): só os amigos veem, mesmo que o link vaze.
- **Trava de uso**: estima o consumo dos últimos 31 dias e, ao chegar em 900 GB (dentro da cota grátis de 1.000 GB do Realtime), encerra quem assiste e bloqueia novas transmissões.
- Escolha de qualidade com teto em Full HD (1080p ou 720p, a 60 ou 30 fps); a trava conta cada espectador pela qualidade da sala.
- Página de transmitir pelo navegador, para testes: só pega o som de uma aba, nunca o do PC inteiro.
- Captura de som por programa (`Transmissor.Audio`) e a ferramenta `captura-audio` (`janelas`, `gravar`, `sessoes`), que confere no PC que todo o som do Discord fica de fora.
- CI do app e do servidor, e atualizações automáticas de dependências (npm, NuGet e GitHub Actions).

## [0.1.0] - 2026-10-17

### Adicionado

- Plano do projeto (`docs/PLANO.md`) e estrutura base do repositório.
- Bot do Discord (`bot/`) que entra no canal de voz e toca arquivos da pasta de mídia, com criptografia DAVE.
- Comandos `/painel`, `/tocar` (com autocompletar), `/entrar`, `/parar` e `/sair`.
- Painel com botões: escolher arquivo, entrar, pausar/continuar, parar, volume e sair; atualiza sozinho.
- Testes automáticos (`npm test`) e CI no GitHub Actions (Windows e Linux).

[Unreleased]: https://github.com/VitorAngN/DiscordBot/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/VitorAngN/DiscordBot/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/VitorAngN/DiscordBot/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/VitorAngN/DiscordBot/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/VitorAngN/DiscordBot/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/VitorAngN/DiscordBot/releases/tag/v0.1.0

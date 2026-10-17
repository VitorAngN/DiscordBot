// Tela cheia e janela flutuante (Picture-in-Picture) da página de assistir.
// Usa as APIs padrão e cai para as do Safari (iPhone/iPad) quando elas não existem.

const emTelaCheia = () => Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);

async function sairDaTelaCheia() {
  if (document.exitFullscreen) await document.exitFullscreen();
  else document.webkitExitFullscreen?.();
}

/**
 * Liga os botões, o duplo clique e os atalhos de teclado (F e P).
 * @param {{ palco: HTMLElement, video: HTMLVideoElement, telaCheia: HTMLButtonElement, flutuante: HTMLButtonElement }} elementos
 */
export function configurarTela({ palco, video, telaCheia, flutuante }) {
  const suportaFlutuante =
    (document.pictureInPictureEnabled && !video.disablePictureInPicture) ||
    video.webkitSupportsPresentationMode?.('picture-in-picture') === true;
  flutuante.hidden = !suportaFlutuante;

  const emFlutuante = () => Boolean(document.pictureInPictureElement) || video.webkitPresentationMode === 'picture-in-picture';

  async function alternarTelaCheia() {
    if (emTelaCheia()) return sairDaTelaCheia();
    if (palco.requestFullscreen) {
      // O palco inteiro, para os avisos (ex.: "a transmissão terminou") aparecerem também
      await palco.requestFullscreen({ navigationUI: 'hide' });
      try {
        await screen.orientation?.lock?.('landscape'); // no celular, deita a tela
      } catch {
        // Nem todo navegador deixa girar; segue em pé
      }
    } else {
      video.webkitEnterFullscreen?.(); // iPhone: só o próprio vídeo entra em tela cheia
    }
  }

  async function alternarFlutuante() {
    if (emFlutuante()) {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else video.webkitSetPresentationMode?.('inline');
      return;
    }
    if (emTelaCheia()) await sairDaTelaCheia();
    if (video.requestPictureInPicture) await video.requestPictureInPicture();
    else video.webkitSetPresentationMode?.('picture-in-picture');
  }

  function atualizar() {
    // Só faz sentido quando já tem imagem chegando
    const temImagem = Boolean(video.srcObject) && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    telaCheia.disabled = !temImagem;
    flutuante.disabled = !temImagem;
    telaCheia.textContent = emTelaCheia() ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    flutuante.textContent = emFlutuante() ? '🗗 Voltar para a página' : '🗗 Janela flutuante';
  }

  const executar = (acao) => () => {
    acao()
      .catch(() => {}) // o navegador recusou (ex.: sem clique do usuário); o botão continua lá
      .finally(atualizar);
  };

  telaCheia.addEventListener('click', executar(alternarTelaCheia));
  flutuante.addEventListener('click', executar(alternarFlutuante));
  video.addEventListener('dblclick', executar(alternarTelaCheia));
  document.addEventListener('keydown', (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.target instanceof HTMLInputElement) return;
    const tecla = evento.key.toLowerCase();
    if (tecla === 'f' && !telaCheia.disabled) executar(alternarTelaCheia)();
    else if (tecla === 'p' && !flutuante.disabled && !flutuante.hidden) executar(alternarFlutuante)();
  });

  for (const nome of ['loadeddata', 'playing', 'emptied', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) {
    video.addEventListener(nome, atualizar);
  }
  document.addEventListener('fullscreenchange', atualizar);
  document.addEventListener('webkitfullscreenchange', atualizar);
  atualizar();

  return {
    /** Fecha a janela flutuante, para ela não ficar preta quando a transmissão acaba. */
    async fecharJanelaFlutuante() {
      if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => {});
      else if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode('inline');
    },
  };
}

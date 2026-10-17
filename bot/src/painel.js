import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { VOLUME_MAX } from './player.js';

export const ID = {
  arquivo: 'painel:arquivo',
  entrar: 'painel:entrar',
  pausa: 'painel:pausa',
  parar: 'painel:parar',
  sair: 'painel:sair',
  volumeMenos: 'painel:volume-menos',
  volumeMais: 'painel:volume-mais',
  atualizar: 'painel:atualizar',
};

const ROTULO_STATUS = {
  tocando: '▶️ Tocando',
  pausado: '⏸️ Pausado',
  parado: '⏹️ Parado',
};

/**
 * Mensagem do painel de mídia.
 * @param {ReturnType<import('./player.js').estado>} est
 * @param {string[]} opcoes arquivos que cabem no menu (até 25)
 * @param {number} total quantidade de arquivos na pasta
 */
export function montarPainel(est, opcoes, total) {
  const parado = est.status === 'parado';
  const pausado = est.status === 'pausado';

  const embed = new EmbedBuilder()
    .setColor(est.status === 'tocando' ? 0x57f287 : 0x5865f2)
    .setTitle('🎵 Painel de mídia')
    .addFields(
      { name: 'Canal', value: est.conectado ? `🔊 ${est.canal}` : 'Fora da call', inline: true },
      { name: 'Estado', value: ROTULO_STATUS[est.status], inline: true },
      { name: 'Volume', value: `${est.volume}%`, inline: true },
      { name: 'Faixa', value: est.faixa ?? '—' },
    )
    .setFooter({
      text: total
        ? `${total} arquivo(s) na pasta de mídia${total > opcoes.length ? ` — use /tocar para ver todos` : ''}`
        : 'Coloque arquivos de áudio na pasta bot/midia e clique em Atualizar',
    });

  const menu = new StringSelectMenuBuilder().setCustomId(ID.arquivo);
  if (opcoes.length) {
    menu.setPlaceholder('Escolha um arquivo para tocar').addOptions(opcoes.map((n) => ({ label: n, value: n })));
  } else {
    // O Discord exige ao menos uma opção, mesmo com o menu desativado
    menu.setPlaceholder('Nenhum arquivo na pasta de mídia').setDisabled(true).addOptions({ label: '—', value: '-' });
  }

  const controles = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ID.entrar)
      .setLabel(est.conectado ? 'Vir pro meu canal' : 'Entrar na call')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ID.pausa)
      .setLabel(pausado ? 'Continuar' : 'Pausar')
      .setEmoji(pausado ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(parado),
    new ButtonBuilder()
      .setCustomId(ID.parar)
      .setLabel('Parar')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(parado),
    new ButtonBuilder()
      .setCustomId(ID.sair)
      .setLabel('Sair')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!est.conectado),
  );

  const ajustes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ID.volumeMenos)
      .setLabel('Volume −')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(est.volume <= 0),
    new ButtonBuilder()
      .setCustomId(ID.volumeMais)
      .setLabel('Volume +')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(est.volume >= VOLUME_MAX),
    new ButtonBuilder()
      .setCustomId(ID.atualizar)
      .setLabel('Atualizar lista')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), controles, ajustes] };
}

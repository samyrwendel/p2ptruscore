import { Injectable } from '@nestjs/common';
import { TelegramKeyboardService } from '../../shared/telegram-keyboard.service';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class HelpCommandHandler implements ITextCommandHandler {
  // Aceita: /help, /comandos
  command = /^\/(help|comandos)$/;

  constructor(private readonly keyboardService: TelegramKeyboardService) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const keyboard = this.keyboardService.getGroupWebAppKeyboard(ctx.chat);

    const extra: ExtraReplyMessage = {};
    extra.parse_mode = 'Markdown';
    if (keyboard) {
      extra.reply_markup = keyboard.reply_markup;
    }

    const helpMessage = `
Olá! Eu sou o P2P Score Bot. Veja como você pode interagir comigo:

*Score Básico:*
  • Responda a uma mensagem com \`+1\` para dar pontos positivos.
  • Responda a uma mensagem com \`-1\` para dar pontos negativos.
  *(Cooldown: 1 minuto entre dar pontos)*

*Verificar Score:*
  • \`/me\` ou \`/meuscore\`: Mostra sua reputação atual, pontos dados e recebidos.
  • \`/getkarma\` ou \`/score <nome ou @usuario>\`: Mostra os detalhes de score de um usuário específico.

*Rankings:*
  • \`/top\` ou \`/melhorscore\`: Top 10 usuários com mais reputação.
  • \`/hate\` ou \`/piorscore\`: Top 10 usuários com menos reputação.
  • \`/mostgivers\` ou \`/doadorscore\`: Top 10 usuários que mais deram reputação.
  • \`/today\` ou \`/hoje\`: Top 10 usuários que receberam mais pontos nas últimas 24 horas.
  • \`/month\` ou \`/mes\`: Top 10 usuários que receberam mais pontos nos últimos 30 dias.
  • \`/year\` ou \`/ano\`: Top 10 usuários que receberam mais pontos nos últimos 365 dias.

*Histórico:*
  • \`/history\` ou \`/meuhistorico\`: Mostra suas últimas 10 mudanças de score.
  • \`/gethistory\` ou \`/verhistorico <nome ou @usuario>\`: Mostra as últimas 10 mudanças de score de um usuário.

*Transferir Pontos:*
  • \`/send\` ou \`/transferir <quantidade>\`: Responda a mensagem de um usuário para enviar uma quantidade específica dos seus pontos. (ex: \`/transferir 5\`)

*Comandos P2P:*
  • \`/avaliar positiva [comentário]\`: Responda a uma mensagem para dar avaliação positiva (+2 pontos)
  • \`/avaliar negativa [comentário]\`: Responda a uma mensagem para dar avaliação negativa (-1 ponto)
  • \`/reputacao [usuário]\`: Ver reputação P2P detalhada de um usuário
  • \`/confianca\`: Ver ranking de confiança P2P do grupo

*Operações P2P:*
  • \`/criaroperacao\`: Criar nova operação de compra/venda
  • \`/minhasoperacoes\`: Ver suas operações ativas
  • \`/operacoesdisponiveis\`: Ver operações disponíveis no grupo
  • \`/aceitaroperacao [ID]\`: Aceitar uma operação específica
  • \`/cancelaroperacao [ID]\`: Cancelar uma operação específica
  • \`/cancelarordem [ID]\`: Cancelar e deletar ordem do grupo (teste)
  • \`/concluiroperacao [ID]\`: Concluir uma operação
  • \`/reverteroperacao [ID]\`: Reverter uma operação
  • \`/fecharoperacao [ID]\`: Fechar uma operação
  • \`/apagaroperacoespendentes\`: Apagar operações pendentes antigas

*Outros:*
  • \`/help\` ou \`/comandos\`: Mostra esta mensagem de ajuda.
  • \`/start\`: Iniciar interação com o bot
  • \`/hello\`: Saudação do bot
`;
    await ctx.reply(helpMessage.trim(), extra);
  }
}

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
🤖 **Bem-vindo ao P2P Score Bot!**

*📊 Sistema de Reputação:*
  • \`/me\` ou \`/meuscore\`: Sua reputação atual e estatísticas
  • \`/reputacao [usuário]\`: Ver reputação detalhada de um usuário
  • \`/confianca\`: Ranking de confiança P2P do grupo

*🏆 Rankings:*
  • \`/top\` ou \`/melhorscore\`: Top 10 usuários com mais reputação
  • \`/hate\` ou \`/piorscore\`: Top 10 usuários com menos reputação
  • \`/mostgivers\` ou \`/doadorscore\`: Top 10 usuários que mais deram reputação
  • \`/today\` ou \`/hoje\`: Top usuários das últimas 24 horas
  • \`/month\` ou \`/mes\`: Top usuários dos últimos 30 dias
  • \`/year\` ou \`/ano\`: Top usuários dos últimos 365 dias

*💰 Operações P2P:*
  • \`/criaroperacao\`: Criar nova operação de compra/venda
  • \`/minhasoperacoes\`: Ver suas operações ativas
  • \`/operacoes\`: Ver operações disponíveis no grupo

*⭐ Avaliações:*
  • \`/avaliar [1-5] [comentário]\`: Avaliar usuário (responda a mensagem)
  • Exemplo: \`/avaliar 5 Excelente negociação!\`

*📈 Pontos Básicos:*
  • Responda mensagem com \`+1\` para dar pontos positivos
  • Responda mensagem com \`-1\` para dar pontos negativos
  • \`/send\` ou \`/transferir <quantidade>\`: Transferir seus pontos

*📋 Histórico:*
  • \`/history\` ou \`/meuhistorico\`: Suas últimas mudanças de score
  • \`/gethistory [usuário]\`: Histórico de um usuário específico

*💱 Cotações:*
  • \`/cotacoes\`: Ver cotações atuais de criptomoedas

*🔧 Outros:*
  • \`/start\`: Menu principal interativo
  • \`/termos\`: Aceitar termos de uso
  • \`/help\`: Esta mensagem de ajuda

*💡 Dica:* Use \`/start\` para acessar o menu interativo com botões!
`;
    await ctx.reply(helpMessage.trim(), extra);
  }
}

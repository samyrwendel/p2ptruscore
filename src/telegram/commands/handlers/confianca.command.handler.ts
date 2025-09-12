import { Injectable } from '@nestjs/common';
import { KarmaService } from '../../../karma/karma.service';
import { getReputationInfoAlt } from '../../../shared/reputation.utils';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class ConfiancaCommandHandler implements ITextCommandHandler {
  command = 'confianca';

  constructor(private readonly karmaService: KarmaService) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const topUsers = await this.karmaService.getTopKarma(ctx.chat.id, false, 10);
    
    if (topUsers.length === 0) {
      await ctx.reply('📊 Ainda não há dados de confiança neste grupo.');
      return;
    }

    let message = '■ **Ranking de Confiança P2P**\n\n';
    
    topUsers.forEach((userKarma, index) => {
      const nome = userKarma.user.userName 
        ? `@${userKarma.user.userName}` 
        : userKarma.user.firstName;
      
      const reputationInfo = getReputationInfoAlt(userKarma);
       const nivel = reputationInfo.nivel;
       const emoji = reputationInfo.emoji;
      
      message += `${emoji} **${index + 1}.** ${nome}\n`;
      message += `   📊 Score: ${reputationInfo.score} | 🏆 ${nivel}\n\n`;
    });
    
    message += '💡 *Quanto maior o score, maior a confiança na comunidade P2P*';
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
  }
}
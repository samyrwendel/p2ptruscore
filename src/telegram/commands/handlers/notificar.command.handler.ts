import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../../../users/users.service';
import {
  ITextCommandHandler,
  TextCommandContext,
} from 'src/telegram/telegram.types';

@Injectable()
export class NotificarCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(NotificarCommandHandler.name);
  command = /^\/(notificar|silenciar)(?:@\w+)?$/;

  constructor(
    private readonly usersService: UsersService,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const text = ctx.message?.text?.toLowerCase() || '';
    const isNotificar = text.startsWith('/notificar');

    try {
      const userData = {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      };

      const user = await this.usersService.findOrCreate(userData);
      await this.usersService.setNotifyOperations(ctx.from.id, isNotificar);

      if (isNotificar) {
        await ctx.reply(
          '🔔 **Notificações ativadas!**\n\n' +
          'Você será mencionado quando novas operações forem criadas.\n\n' +
          'Para desativar: /silenciar',
          { parse_mode: 'Markdown' }
        );
        this.logger.log(`User ${ctx.from.id} opted-in to operation notifications`);
      } else {
        await ctx.reply(
          '🔕 **Notificações desativadas!**\n\n' +
          'Você não será mais mencionado quando novas operações forem criadas.\n\n' +
          'Para reativar: /notificar',
          { parse_mode: 'Markdown' }
        );
        this.logger.log(`User ${ctx.from.id} opted-out of operation notifications`);
      }
    } catch (error) {
      this.logger.error('Error handling notification toggle:', error);
      await ctx.reply('❌ Erro ao alterar configuração de notificações. Tente novamente.');
    }
  }

  async handleCallback(ctx: any): Promise<boolean> {
    return false;
  }
}

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { Update } from 'telegraf/types';
import { InjectBot } from 'nestjs-telegraf';
import { ICommandHandler } from './commands/command.interface';
import { MeCommandHandler } from './commands/handlers/me.command.handler';
import { TopCommandHandler } from './commands/handlers/top.command.handler';
import { HateCommandHandler } from './commands/handlers/hate.command.handler';
import { MostGiversCommandHandler } from './commands/handlers/mostgivers.command.handler';
import { HelpCommandHandler } from './commands/handlers/help.command.handler';
import { GetKarmaCommandHandler } from './commands/handlers/getkarma.command.handler';
import { SendCommandHandler } from './commands/handlers/send.command.handler';
import { HistoryCommandHandler } from './commands/handlers/history.command.handler';
import { GetHistoryCommandHandler } from './commands/handlers/gethistory.command.handler';
import { TopReceivedCommandHandler } from './commands/handlers/top-received.command.handler';
import { AvaliarCommandHandler } from './commands/handlers/avaliar.command.handler';
import { ReputacaoCommandHandler } from './commands/handlers/reputacao.command.handler';
import { ConfiancaCommandHandler } from './commands/handlers/confianca.command.handler';
import { CriarOperacaoCommandHandler } from './commands/handlers/criar-operacao.command.handler';
import { AceitarOperacaoCommandHandler } from './commands/handlers/aceitar-operacao.command.handler';
import { MinhasOperacoesCommandHandler } from './commands/handlers/minhas-operacoes.command.handler';
import { CancelarOperacaoCommandHandler } from './commands/handlers/cancelar-operacao.command.handler';
import { CancelarOrdemCommandHandler } from './commands/handlers/cancelar-ordem.command.handler';
import { ReverterOperacaoCommandHandler } from './commands/handlers/reverter-operacao.command.handler';
import { ConcluirOperacaoCommandHandler } from './commands/handlers/concluir-operacao.command.handler';
import { OperacoesDisponiveisCommandHandler } from './commands/handlers/operacoes-disponiveis.command.handler';
import { HelloCommandHandler } from './commands/handlers/hello.command.handler';
import { ApagarOperacoesPendentesCommandHandler } from './commands/handlers/apagar-operacoes-pendentes.command.handler';
import { FecharOperacaoCommandHandler } from './commands/handlers/fechar-operacao.command.handler';
import { StartCommandHandler } from './commands/handlers/start.command.handler';
import { CotacoesCommandHandler } from './commands/handlers/cotacoes.command.handler';
import { TermosCommandHandler } from './commands/handlers/termos.command.handler';
import { KarmaMessageHandler } from './handlers/karma-message.handler';
import { NewMemberHandler } from './handlers/new-member.handler';
import { isTextCommandHandler, TextCommandContext } from './telegram.types';

@Injectable()
export class TelegramService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);

  private readonly commandHandlers = new Map<
    string | RegExp,
    ICommandHandler<any>
  >();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
    private readonly configService: ConfigService,
    private readonly karmaMessageHandler: KarmaMessageHandler,
    private readonly meHandler: MeCommandHandler,
    private readonly topHandler: TopCommandHandler,
    private readonly hateHandler: HateCommandHandler,
    private readonly mostGiversHandler: MostGiversCommandHandler,
    private readonly helpHandler: HelpCommandHandler,
    private readonly getKarmaHandler: GetKarmaCommandHandler,
    private readonly sendHandler: SendCommandHandler,
    private readonly historyHandler: HistoryCommandHandler,
    private readonly getHistoryHandler: GetHistoryCommandHandler,
    private readonly topReceivedHandler: TopReceivedCommandHandler,
    private readonly avaliarHandler: AvaliarCommandHandler,
    private readonly reputacaoHandler: ReputacaoCommandHandler,
    private readonly confiancaHandler: ConfiancaCommandHandler,
    private readonly criarOperacaoHandler: CriarOperacaoCommandHandler,
    private readonly aceitarOperacaoHandler: AceitarOperacaoCommandHandler,
    private readonly minhasOperacoesHandler: MinhasOperacoesCommandHandler,
    private readonly cancelarOperacaoHandler: CancelarOperacaoCommandHandler,
    private readonly cancelarOrdemHandler: CancelarOrdemCommandHandler,
    private readonly reverterOperacaoHandler: ReverterOperacaoCommandHandler,
    private readonly concluirOperacaoHandler: ConcluirOperacaoCommandHandler,
    private readonly operacoesDisponiveisHandler: OperacoesDisponiveisCommandHandler,
    private readonly helloHandler: HelloCommandHandler,
    private readonly apagarOperacoesPendentesHandler: ApagarOperacoesPendentesCommandHandler,
    private readonly fecharOperacaoHandler: FecharOperacaoCommandHandler,
    private readonly startHandler: StartCommandHandler,
    private readonly cotacoesHandler: CotacoesCommandHandler,
    private readonly termosHandler: TermosCommandHandler,
    private readonly newMemberHandler: NewMemberHandler,
  ) {
    // Registrar todos os command handlers
    this.registerCommand(meHandler);
    this.registerCommand(topHandler);
    this.registerCommand(hateHandler);
    this.registerCommand(mostGiversHandler);
    this.registerCommand(helpHandler);
    this.registerCommand(getKarmaHandler);
    this.registerCommand(sendHandler);
    this.registerCommand(historyHandler);
    this.registerCommand(getHistoryHandler);
    this.registerCommand(topReceivedHandler);
    this.registerCommand(avaliarHandler);
    this.registerCommand(reputacaoHandler);
    this.registerCommand(confiancaHandler);
    this.registerCommand(criarOperacaoHandler);
    this.registerCommand(aceitarOperacaoHandler);
    this.registerCommand(minhasOperacoesHandler);
    this.registerCommand(cancelarOperacaoHandler);
    this.registerCommand(cancelarOrdemHandler);
    this.registerCommand(reverterOperacaoHandler);
    this.registerCommand(concluirOperacaoHandler);
    this.registerCommand(operacoesDisponiveisHandler);
    this.registerCommand(helloHandler);
    this.registerCommand(apagarOperacoesPendentesHandler);
    this.registerCommand(fecharOperacaoHandler);
    this.registerCommand(startHandler);
    this.registerCommand(cotacoesHandler);
    this.registerCommand(termosHandler);
  }

  async onModuleInit() {
    this.registerListeners();
    this.logger.log('✅ Telegram Bot initialized successfully via NestJS injection.');
  }

  private registerListeners() {
    this.bot.on(message('text'), async (ctx) => {
      try {
        await this.handleTextInput(ctx);
      } catch (error) {
        this.logger.error('Error handling text input:', error);
      }
    });

    this.bot.on('callback_query', async (ctx) => {
      try {
        await this.handleCallbackQuery(ctx);
      } catch (error) {
        this.logger.error('Error handling callback query:', error);
      }
    });

    // Listener para novos membros
    this.bot.on('new_chat_members', async (ctx) => {
      try {
        await this.newMemberHandler.handleNewChatMembers(ctx);
      } catch (error) {
        this.logger.error('Error handling new chat members:', error);
      }
    });
  }

  private async handleCommand(ctx: TextCommandContext) {
    for (const handler of this.commandHandlers.values()) {
      const command = this.getCommandHandler(handler);

      if (ctx.message.text.match(command) && isTextCommandHandler(handler)) {
        await handler.handle(ctx);
        return;
      }
    }
  }

  private async handleTextInput(ctx: TextCommandContext) {
    try {
      this.logger.log(`📝 Entrada de texto recebida: ${ctx.message.text}`);

      // Procurar handler que tem sessão ativa e pode processar entrada de texto
      for (const handler of this.commandHandlers.values()) {
        if (handler && typeof handler.handleTextInput === 'function') {
          const sessionKey = `${ctx.from.id}_${ctx.chat.id}`;
          
          // Verificar se o handler tem uma sessão ativa
          if (typeof handler.hasActiveSession === 'function' && handler.hasActiveSession(sessionKey)) {
            await handler.handleTextInput(ctx);
            return;
          }
        }
      }

      // Se nenhum handler processou a entrada de texto, não fazer nada
      // (pode ser uma mensagem normal no chat)
    } catch (error) {
      this.logger.error('❌ Erro ao processar entrada de texto:', error);
    }
  }

  private async handleCallbackQuery(ctx: any) {
    try {
      // Tentar processar com cada handler que suporta callbacks
      const handlers = [
        this.avaliarHandler,
        this.criarOperacaoHandler,
        this.aceitarOperacaoHandler,
        this.minhasOperacoesHandler,
        this.cancelarOperacaoHandler,
        this.cancelarOrdemHandler,
        this.reverterOperacaoHandler,
        this.concluirOperacaoHandler,
        this.operacoesDisponiveisHandler,
        this.apagarOperacoesPendentesHandler,
        this.fecharOperacaoHandler,
        this.startHandler,
        this.termosHandler,
        this.newMemberHandler,
      ];

      for (const handler of handlers) {
        if ('handleCallback' in handler && typeof handler.handleCallback === 'function') {
          const handled = await handler.handleCallback(ctx);
          if (handled) {
            this.logger.log(`📞 Callback ${ctx.callbackQuery?.data} processado por: ${handler.constructor.name}`);
            return;
          }
        }
      }

      this.logger.warn(`⚠️ Callback não processado: ${ctx.callbackQuery?.data}`);
    } catch (error) {
      this.logger.error('Erro ao processar callback query:', error);
    }
  }

  private registerCommand(handler: ICommandHandler<any>) {
    this.commandHandlers.set(handler.command, handler);
    this.logger.log(`Command registered: ${handler.command}`);
  }

  private getCommandHandler(handler: ICommandHandler<any>) {
    return typeof handler.command === 'string'
      ? `/${handler.command}`
      : handler.command;
  }

  async onApplicationShutdown(signal: string) {
    this.logger.log(`🛑 Application shutting down (${signal})`);
    this.logger.log('🛑 Telegram Bot managed by NestJS will be stopped automatically.');
  }
}

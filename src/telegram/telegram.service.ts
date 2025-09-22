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
import { TermsAcceptanceService } from '../users/terms-acceptance.service';
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
    private readonly termsAcceptanceService: TermsAcceptanceService,
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

      const text = ctx.message.text;

      // Primeiro, verificar se é um comando
      if (text.startsWith('/')) {
        await this.processCommand(ctx);
        return;
      }

      // Se não é comando, procurar handler que tem sessão ativa e pode processar entrada de texto
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

  private async processCommand(ctx: TextCommandContext) {
    try {
      const text = ctx.message.text;
      this.logger.log(`🎯 Processando comando: ${text}`);

      // VALIDAÇÃO GLOBAL: Verificar se usuário aceitou termos (exceto comandos permitidos)
      if (await this.shouldValidateTerms(ctx, text)) {
        const hasAccepted = await this.validateUserTermsGlobally(ctx);
        if (!hasAccepted) {
          return; // Bloquear execução do comando
        }
      }

      // Procurar handler que corresponde ao comando
      for (const [commandPattern, handler] of this.commandHandlers.entries()) {
        if (this.matchesCommand(text, commandPattern)) {
          this.logger.log(`✅ Comando ${text} correspondeu ao padrão: ${commandPattern}`);
          await handler.handle(ctx);
          return;
        }
      }

      this.logger.log(`❓ Nenhum handler encontrado para comando: ${text}`);
    } catch (error) {
      this.logger.error('❌ Erro ao processar comando:', error);
    }
  }

  private async shouldValidateTerms(ctx: TextCommandContext, text: string): Promise<boolean> {
    // Comandos que NÃO precisam de validação de termos (podem ser usados sem aceitar)
    const allowedCommands = [
      '/termos',
      '/terms',
      '/start', // Permitir /start para mostrar informações
      '/help',
      '/comandos'
    ];

    // Verificar se é um comando permitido
    const isAllowedCommand = allowedCommands.some(cmd => 
      text.toLowerCase().startsWith(cmd.toLowerCase())
    );

    // Só validar termos se não for comando permitido E se for em grupo
    return !isAllowedCommand && ctx.chat.type !== 'private';
  }

  private async validateUserTermsGlobally(ctx: TextCommandContext): Promise<boolean> {
    try {
      const hasAccepted = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        ctx.chat.id
      );

      if (!hasAccepted) {
        // Verificar se é um usuário existente (tem karma/histórico no sistema)
        const isLegacyUser = await this.isLegacyUser(ctx.from.id);
        
        if (isLegacyUser) {
          // Para usuários existentes, apresentar termos de forma amigável
          await this.presentTermsToLegacyUser(ctx);
        } else {
          // Para usuários novos, mensagem mais restritiva
          await ctx.reply(
            `🚫 **Acesso Restrito**\n\n` +
            `❌ Você precisa aceitar os termos de responsabilidade antes de usar comandos no grupo.\n\n` +
            `📋 **Como aceitar:**\n` +
            `1️⃣ Use o comando \`/termos\` para ler os termos\n` +
            `2️⃣ Clique em "✅ ACEITO OS TERMOS"\n` +
            `3️⃣ Após aceitar, você poderá usar todos os comandos\n\n` +
            `⚠️ **Importante:** Esta validação garante que todos os membros conhecem as regras da comunidade.`,
            { parse_mode: 'Markdown' }
          );
        }
        
        this.logger.log(`🚫 Comando bloqueado para usuário ${ctx.from.id} - termos não aceitos`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Erro na validação global de termos para usuário ${ctx.from.id}:`, error);
      return false;
    }
  }

  private async isLegacyUser(userId: number): Promise<boolean> {
    try {
      // Verificar se usuário tem histórico no sistema
      // Se tem karma, operações ou avaliações, é considerado usuário existente
      
      // Por enquanto, implementação simples: se o sistema de termos foi implementado recentemente,
      // considerar todos os usuários atuais como legacy
      // Em produção real, isso checaria: karma > 0, operações criadas, etc.
      
      // Data de implementação do sistema de termos (22/09/2025)
      const termsImplementationDate = new Date('2025-09-22T00:00:00Z');
      const now = new Date();
      
      // Se o sistema está rodando há menos de 24 horas, considerar usuários como legacy
      // Isso dá tempo para todos os membros existentes aceitarem os termos
      const hoursSinceImplementation = (now.getTime() - termsImplementationDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceImplementation < 24) {
        return true; // Período de graça para usuários existentes
      }
      
      // Após 24h, apenas novos usuários precisarão aceitar automaticamente
      return false;
      
    } catch (error) {
      this.logger.error('Erro ao verificar se usuário é legacy:', error);
      return false;
    }
  }

  private async presentTermsToLegacyUser(ctx: TextCommandContext): Promise<void> {
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    
    await ctx.reply(
      `👋 **Olá ${userName}!**\n\n` +
      `🔄 **Atualização do Sistema:** Implementamos novos termos de responsabilidade para maior segurança da comunidade.\n\n` +
      `📋 **Como membro existente, você precisa aceitar os novos termos para continuar usando o bot.**\n\n` +
      `✅ **É rápido e simples:**\n` +
      `1️⃣ Use \`/termos\` para ler os termos atualizados\n` +
      `2️⃣ Clique em "✅ ACEITO OS TERMOS"\n` +
      `3️⃣ Continue usando o bot normalmente\n\n` +
      `💡 **Tranquilo:** Você não será removido do grupo, apenas precisa aceitar os termos para usar comandos.`,
      { parse_mode: 'Markdown' }
    );
  }

  private async handleCallbackQuery(ctx: any) {
    try {
      // VALIDAÇÃO GLOBAL: Verificar se usuário aceitou termos para callbacks (exceto callbacks de termos)
      if (await this.shouldValidateTermsForCallback(ctx)) {
        const hasAccepted = await this.validateUserTermsForCallback(ctx);
        if (!hasAccepted) {
          return; // Bloquear execução do callback
        }
      }

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

  private matchesCommand(text: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return text.toLowerCase().includes(pattern.toLowerCase());
    } else {
      return pattern.test(text);
    }
  }

  private getCommandHandler(handler: ICommandHandler<any>) {
    return typeof handler.command === 'string'
      ? `/${handler.command}`
      : handler.command;
  }

  private async shouldValidateTermsForCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data) return false;

    // Callbacks que NÃO precisam de validação (relacionados aos próprios termos e funcionalidades básicas)
    const allowedCallbacks = [
      'accept_terms_',
      'reject_terms_',
      'resend_terms_',
      'view_terms_detail_',
      'quotes_', // Cotações são informações públicas
      'start_' // Callbacks do comando /start
    ];

    // Verificar se é um callback permitido
    const isAllowedCallback = allowedCallbacks.some(prefix => 
      data.startsWith(prefix)
    );

    // Só validar termos se não for callback permitido E se for em grupo
    return !isAllowedCallback && ctx.callbackQuery?.message?.chat?.type !== 'private';
  }

  private async validateUserTermsForCallback(ctx: any): Promise<boolean> {
    try {
      const hasAccepted = await this.termsAcceptanceService.hasUserAcceptedCurrentTerms(
        ctx.from.id,
        ctx.callbackQuery.message.chat.id
      );

      if (!hasAccepted) {
        await ctx.answerCbQuery(
          `🚫 Você precisa aceitar os termos de responsabilidade antes de usar funcionalidades do grupo!`,
          { show_alert: true }
        );
        
        this.logger.log(`🚫 Callback bloqueado para usuário ${ctx.from.id} - termos não aceitos`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Erro na validação de termos (callback) para usuário ${ctx.from.id}:`, error);
      await ctx.answerCbQuery('❌ Erro na validação. Tente novamente.', { show_alert: true });
      return false;
    }
  }

  async onApplicationShutdown(signal: string) {
    this.logger.log(`🛑 Application shutting down (${signal})`);
    this.logger.log('🛑 Telegram Bot managed by NestJS will be stopped automatically.');
  }
}

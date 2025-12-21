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
import { ConfirmAcceptOperationCommandHandler } from './commands/handlers/confirm-accept-operation.command.handler';
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
import { AdminCommandHandler } from './commands/handlers/admin.command.handler';
import { DesbloquearUsuarioCommandHandler } from './commands/handlers/desbloquear-usuario.command.handler';
import { DisputarOperacaoCallbackCommandHandler } from './commands/handlers/disputar-operacao-callback.command.handler';
import { NotificarTermosCommandHandler } from './commands/handlers/notificar-termos.command.handler';
import { KarmaMessageHandler } from './handlers/karma-message.handler';
import { NewMemberHandler } from './handlers/new-member.handler';
import { JoinRequestHandler } from './handlers/join-request.handler';
import { PendingEvaluationNotificationService } from './handlers/pending-evaluation-notification.service';
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
    private readonly confirmAcceptOperationHandler: ConfirmAcceptOperationCommandHandler,
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
    private readonly adminHandler: AdminCommandHandler,
    private readonly desbloquearUsuarioHandler: DesbloquearUsuarioCommandHandler,
    private readonly disputarOperacaoCallbackHandler: DisputarOperacaoCallbackCommandHandler,
    private readonly notificarTermosHandler: NotificarTermosCommandHandler,
    private readonly newMemberHandler: NewMemberHandler,
    private readonly joinRequestHandler: JoinRequestHandler,
    private readonly pendingEvaluationNotificationService: PendingEvaluationNotificationService,
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
    this.registerCommand(this.desbloquearUsuarioHandler);
    this.registerCommand(startHandler);
    this.registerCommand(cotacoesHandler);
    this.registerCommand(termosHandler);
    this.registerCommand(adminHandler);
    this.registerCommand(notificarTermosHandler);
  }

  async onModuleInit() {
    this.registerListeners();
    
    // Configurar comandos e menu button automaticamente
    try {
      // Configurar lista de comandos do bot
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: '🚀 Menu Principal' },
        { command: 'iniciar', description: '🚀 Inicia Operações' },
        { command: 'termos', description: '📋 Aceitar Termos de Responsabilidade' },
        { command: 'criaroperacao', description: '💼 Criar Nova Operação' },
        { command: 'minhasoperacoes', description: '📋 Minhas Operações' },
        { command: 'reputacao', description: '⭐ Ver Reputação' },
        { command: 'help', description: '❓ Ajuda' }
      ]);
      
      // Configurar menu button para mostrar comandos
      await this.bot.telegram.setChatMenuButton({
        menuButton: {
          type: 'commands'
        }
      });
      
      this.logger.log('✅ Comandos e menu button configurados automaticamente');
    } catch (error) {
      this.logger.warn('⚠️ Erro ao configurar comandos e menu button:', error);
    }
    
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
            // Apagar mensagem de entrada do usuário
            await this.deleteSystemMessage(ctx);
          } catch (error) {
            this.logger.error('Error handling new chat members:', error);
          }
        });

        this.bot.on('left_chat_member', async (ctx) => {
          try {
            // Apagar mensagem de saída do usuário
            await this.deleteSystemMessage(ctx);
          } catch (error) {
            this.logger.error('Error handling left chat member:', error);
          }
        });

        // === LIMPEZA DE MENSAGENS DE SERVIÇO (estilo Group Help) ===
        // Apagar mensagens de mudança de foto do grupo
        this.bot.on('new_chat_photo', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'nova foto do grupo');
          } catch (error) {
            this.logger.error('Error deleting new_chat_photo message:', error);
          }
        });

        // Apagar mensagens de remoção de foto do grupo
        this.bot.on('delete_chat_photo', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'foto do grupo removida');
          } catch (error) {
            this.logger.error('Error deleting delete_chat_photo message:', error);
          }
        });

        // Apagar mensagens de mudança de título do grupo
        this.bot.on('new_chat_title', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'título do grupo alterado');
          } catch (error) {
            this.logger.error('Error deleting new_chat_title message:', error);
          }
        });

        // Apagar mensagens de fixação de mensagem
        this.bot.on('pinned_message', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'mensagem fixada');
          } catch (error) {
            this.logger.error('Error deleting pinned_message notification:', error);
          }
        });

        // Apagar mensagens de criação de tópico em supergrupos
        this.bot.on('forum_topic_created', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'tópico criado');
          } catch (error) {
            this.logger.error('Error deleting forum_topic_created message:', error);
          }
        });

        // Apagar mensagens de edição de tópico
        this.bot.on('forum_topic_edited', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'tópico editado');
          } catch (error) {
            this.logger.error('Error deleting forum_topic_edited message:', error);
          }
        });

        // Apagar mensagens de fechamento de tópico
        this.bot.on('forum_topic_closed', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'tópico fechado');
          } catch (error) {
            this.logger.error('Error deleting forum_topic_closed message:', error);
          }
        });

        // Apagar mensagens de reabertura de tópico
        this.bot.on('forum_topic_reopened', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'tópico reaberto');
          } catch (error) {
            this.logger.error('Error deleting forum_topic_reopened message:', error);
          }
        });

        // Apagar mensagens de tópico geral escondido
        this.bot.on('general_forum_topic_hidden', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'tópico geral escondido');
          } catch (error) {
            this.logger.error('Error deleting general_forum_topic_hidden message:', error);
          }
        });

        // Apagar mensagens de tópico geral revelado
        this.bot.on('general_forum_topic_unhidden', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'tópico geral revelado');
          } catch (error) {
            this.logger.error('Error deleting general_forum_topic_unhidden message:', error);
          }
        });

        // Apagar mensagens de chat de vídeo iniciado
        this.bot.on('video_chat_started', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'chat de vídeo iniciado');
          } catch (error) {
            this.logger.error('Error deleting video_chat_started message:', error);
          }
        });

        // Apagar mensagens de chat de vídeo encerrado
        this.bot.on('video_chat_ended', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'chat de vídeo encerrado');
          } catch (error) {
            this.logger.error('Error deleting video_chat_ended message:', error);
          }
        });

        // Apagar mensagens de participantes convidados para chat de vídeo
        this.bot.on('video_chat_participants_invited', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'participantes convidados para chat de vídeo');
          } catch (error) {
            this.logger.error('Error deleting video_chat_participants_invited message:', error);
          }
        });

        // Apagar mensagens de chat de vídeo agendado
        this.bot.on('video_chat_scheduled', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'chat de vídeo agendado');
          } catch (error) {
            this.logger.error('Error deleting video_chat_scheduled message:', error);
          }
        });

        // Apagar mensagens de migração para supergrupo
        this.bot.on('migrate_to_chat_id', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'migração para supergrupo');
          } catch (error) {
            this.logger.error('Error deleting migrate_to_chat_id message:', error);
          }
        });

        // Apagar mensagens de migração de chat
        this.bot.on('migrate_from_chat_id', async (ctx) => {
          try {
            await this.deleteSystemMessage(ctx, 'migração de chat');
          } catch (error) {
            this.logger.error('Error deleting migrate_from_chat_id message:', error);
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

      // VALIDAÇÃO 0: Bloquear comandos em grupos (exceto comandos específicos)
      if (ctx.chat.type !== 'private') {
        const isGroupAllowedCommand = await this.isCommandAllowedInGroup(text);

        if (!isGroupAllowedCommand) {
          this.logger.log(`🚫 Comando ${text} bloqueado no grupo - direcionando para privado`);

          // Apagar o comando do grupo
          await this.deleteCommandMessage(ctx);

          // Enviar mensagem no grupo direcionando para o bot
          const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'p2pscorebot';
          const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

          try {
            const redirectMessage = await ctx.reply(
              `🚫 ${userName}, comandos devem ser executados no privado!\n\n` +
              `👉 Clique no botão abaixo para interagir com o bot:`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: '💬 Abrir Chat com o Bot',
                        url: `https://t.me/${botUsername}`
                      }
                    ]
                  ]
                }
              }
            );

            // Apagar mensagem de redirecionamento após 15 segundos
            setTimeout(async () => {
              try {
                await ctx.telegram.deleteMessage(ctx.chat.id, redirectMessage.message_id);
              } catch (e) {
                // Ignorar erro ao deletar
              }
            }, 15000);

          } catch (replyError) {
            this.logger.warn('Não foi possível enviar mensagem de redirecionamento:', replyError);
          }

          return; // Bloquear execução do comando
        }
      }

      // VALIDAÇÃO GLOBAL 1: Verificar se usuário é membro ativo do grupo (exceto comandos permitidos)
      if (await this.shouldValidateActiveMembership(ctx, text)) {
        const isActiveMember = await this.validateActiveMembershipGlobally(ctx);
        this.logger.log(`🔍 Resultado validação de membro ativo para ${ctx.from.id}: ${isActiveMember ? 'APROVADO' : 'NEGADO'}`);
        if (!isActiveMember) {
          this.logger.warn(`❌ COMANDO BLOQUEADO - Usuário ${ctx.from.id} (@${ctx.from.username || 'sem_username'}) não é membro ativo - Comando: ${text}`);
          
          // Enviar notificação para usuário não-membro usando o método dedicado
          try {
            await this.sendNonMemberNotification(ctx);
          } catch (error) {
            this.logger.error('Erro ao enviar notificação de não-membro:', error);
          }
          
          return; // Bloquear execução do comando
        }
      }

      // VALIDAÇÃO GLOBAL 2: Verificar se usuário aceitou termos (exceto comandos permitidos)
      if (await this.shouldValidateTerms(ctx, text)) {
        const { validateUserTermsForOperation } = await import('../shared/terms-validation.utils');
        const hasAccepted = await validateUserTermsForOperation(ctx, this.termsAcceptanceService, 'participar');
        this.logger.log(`🔍 Resultado validação de termos para ${ctx.from.id}: ${hasAccepted ? 'APROVADO' : 'NEGADO'}`);
        if (!hasAccepted) {
          this.logger.warn(`❌ COMANDO BLOQUEADO - Usuário ${ctx.from.id} (@${ctx.from.username || 'sem_username'}) não aceitou termos - Comando: ${text}`);
          return;
        }
      }

      // Procurar handler que corresponde ao comando
      for (const [commandPattern, handler] of this.commandHandlers.entries()) {
        if (this.matchesCommand(text, commandPattern)) {
          this.logger.log(`✅ Comando ${text} correspondeu ao padrão: ${commandPattern}`);
          
          // Executar o handler
          await handler.handle(ctx);
          
          // Apagar o comando após execução (manter chat limpo) - SEMPRE apagar comandos em grupos
          await this.deleteCommandMessage(ctx);
          return;
        }
      }

      this.logger.log(`❓ Nenhum handler encontrado para comando: ${text}`);
    } catch (error) {
      this.logger.error('❌ Erro ao processar comando:', error);
    }
  }

  private async shouldValidateActiveMembership(ctx: TextCommandContext, text: string): Promise<boolean> {
    // Comandos que NÃO precisam de validação de membro ativo (podem ser usados por qualquer um)
    const allowedCommands = [
      '/termos',
      '/terms',
      '/start', // Permitir /start para mostrar informações
      '/help',
      '/comandos',
      '/cotacoes' // Cotações são informações públicas
    ];

    // Verificar se é um comando permitido
    const isAllowedCommand = allowedCommands.some(cmd => 
      text.toLowerCase().startsWith(cmd.toLowerCase())
    );

    // Log detalhado para debug
    this.logger.log(`🔍 Validação de membro ativo - Usuário: ${ctx.from.id} (@${ctx.from.username || 'sem_username'}), Comando: ${text}, Permitido: ${isAllowedCommand}`);

    // Só validar membro ativo se não for comando permitido E se for em grupo OU chat privado
    return !isAllowedCommand;
  }

  private async validateActiveMembershipGlobally(ctx: TextCommandContext): Promise<boolean> {
    try {
      this.logger.log(`🔐 Iniciando validação global de membro ativo - Usuário: ${ctx.from.id} (@${ctx.from.username || 'sem_username'}), Chat: ${ctx.chat.type}`);
      
      // Para comandos em grupos, verificar se usuário está ativo no próprio grupo
      if (ctx.chat.type !== 'private') {
        const isActiveMember = await this.checkMembershipInGroup(ctx.from.id, ctx.chat.id, ctx);
        this.logger.log(`📊 Resultado validação em grupo ${ctx.chat.id}: ${isActiveMember ? 'APROVADO' : 'NEGADO'}`);
        return isActiveMember;
      } else {
        // Para comandos privados, verificar em grupos configurados
        // Primeiro tentar TELEGRAM_GROUP_ID (novo formato)
        let configuredGroups: number[] = [];
        
        if (process.env.TELEGRAM_GROUP_ID) {
          configuredGroups.push(parseInt(process.env.TELEGRAM_GROUP_ID));
        }
        
        // Depois tentar TELEGRAM_GROUPS (formato antigo)
        if (process.env.TELEGRAM_GROUPS) {
          const additionalGroups = process.env.TELEGRAM_GROUPS.split(',').map(id => parseInt(id.trim()));
          configuredGroups = [...configuredGroups, ...additionalGroups];
        }
        
        // Remover duplicatas
        configuredGroups = [...new Set(configuredGroups)];
        
        this.logger.log(`🔍 Verificando membro em ${configuredGroups.length} grupos configurados: ${configuredGroups.join(', ')}`);
        
        for (const groupId of configuredGroups) {
          const isActiveMember = await this.checkMembershipInGroup(ctx.from.id, groupId, ctx);
          this.logger.log(`📊 Grupo ${groupId}: ${isActiveMember ? 'MEMBRO ATIVO' : 'NÃO MEMBRO/INATIVO'}`);
          if (isActiveMember) {
            this.logger.log(`✅ Usuário ${ctx.from.id} aprovado - é membro ativo do grupo ${groupId}`);
            return true; // Se é membro ativo em pelo menos um grupo configurado
          }
        }

        // Se não é membro ativo em nenhum grupo configurado - BLOQUEIO SILENCIOSO
        this.logger.warn(`❌ ACESSO NEGADO - Usuário ${ctx.from.id} (@${ctx.from.username || 'sem_username'}) não é membro ativo de nenhum grupo configurado`);
        this.logger.warn(`Usuário ${ctx.from.id} não é membro ativo - comando bloqueado silenciosamente`);
        
        return false;
      }
    } catch (error) {
      this.logger.error(`Erro na validação global de membro ativo para usuário ${ctx.from.id}:`, error);
      return false;
    }
  }

  private async checkMembershipInGroup(userId: number, groupId: number, ctx: TextCommandContext): Promise<boolean> {
    try {
      const memberInfo = await this.bot.telegram.getChatMember(groupId, userId);
      const activeMemberStatuses = ['member', 'administrator', 'creator'];
      
      const isActiveMember = activeMemberStatuses.includes(memberInfo.status);
      
      if (!isActiveMember) {
        this.logger.warn(`Usuário ${userId} não é membro ativo do grupo ${groupId}. Status: ${memberInfo.status}`);
        
        // Enviar notificação visual para usuário não-membro
        try {
          await this.sendNonMemberNotification(ctx);
        } catch (error) {
          this.logger.error('Erro ao enviar notificação de não-membro:', error);
        }
        
        return false;
      }

      this.logger.log(`✅ Usuário ${userId} é membro ativo do grupo ${groupId} (Status: ${memberInfo.status})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Erro ao verificar membro ${userId} no grupo ${groupId}:`, error);
      
      // Se o erro for "member not found", "user not found" ou similar, considerar como não-membro
      if (error.message?.includes('member not found') || 
          error.message?.includes('user not found') || 
          error.message?.includes('chat not found') ||
          error.response?.description?.includes('member not found')) {
        this.logger.log(`❌ Usuário ${userId} não é membro do grupo ${groupId}`);
        
        // Enviar notificação visual para usuário não-membro
        try {
          await this.sendNonMemberNotification(ctx);
        } catch (error) {
          this.logger.error('Erro ao enviar notificação de não-membro:', error);
        }
        
        return false;
      }
      
      // Para outros erros, assumir que é membro (fallback seguro)
      this.logger.warn(`Assumindo que usuário ${userId} é membro devido a erro na verificação`);
      return true;
    }
  }

  private async shouldValidateTerms(ctx: TextCommandContext, text: string): Promise<boolean> {
    // Comandos que NÃO precisam de validação de termos (podem ser usados sem aceitar)
    const allowedCommands = [
      '/termos',
      '/terms',
      '/start', // Permitir /start para mostrar informações
      '/help',
      '/comandos',
      '/notificar_termos' // Permitir comando de notificação para admins
    ];

    // Verificar se é um comando permitido
    const isAllowedCommand = allowedCommands.some(cmd =>
      text.toLowerCase().startsWith(cmd.toLowerCase())
    );

    // Só validar termos se não for comando permitido (tanto em grupos quanto em chat privado)
    return !isAllowedCommand;
  }

  private async isCommandAllowedInGroup(text: string): Promise<boolean> {
    // Comandos que PODEM ser executados em grupos (muito poucos)
    // A maioria dos comandos deve ser executada apenas no privado
    const groupAllowedCommands = [
      // Comandos permitidos apenas para admin verificar configurações
      '/admin', // Admin pode precisar verificar status
      '/notificar_termos', // Admin notifica termos (apenas admin)
    ];

    // Verificar se é um comando permitido no grupo
    const isAllowed = groupAllowedCommands.some(cmd =>
      text.toLowerCase().startsWith(cmd.toLowerCase())
    );

    return isAllowed;
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

  private async sendNonMemberNotification(ctx: TextCommandContext): Promise<void> {
    // APENAS para callbacks - usar popup nativo do Telegram
    if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
      try {
        await ctx.answerCbQuery(
          `🚫 ACESSO NEGADO\n\n` +
          `❌ Entre no grupo e aceite os termos!`,
          { show_alert: true }
        );
      } catch (error) {
        this.logger.error('Erro ao enviar popup de não-membro:', error);
      }
      return;
    }

    // Para comandos de texto - usar o comando /termos existente que já funciona
    await this.termosHandler.handle(ctx);
  }

  private async sendTermsNotification(ctx: TextCommandContext, isLegacyUser: boolean): Promise<void> {
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    
    const introMessage = isLegacyUser 
      ? `👋 **Olá ${userName}!**\n\n🔄 **NOSSOS TERMOS MUDARAM!** Novos termos implementados para maior segurança.\n\n`
      : `🎉 **Bem-vindo(a) ${userName}!**\n\n`;
    
    const message = (
      introMessage +
      `🔄 *Por que estou recebendo esta mensagem?*\n` +
      `Nossos termos foram modificados para melhor proteger você e a comunidade. Como usuário ativo, você precisa aceitar as novas condições.\n\n` +
      `⚠️ **IMPORTANTE:** Você precisa aceitar os termos de responsabilidade antes de poder interagir ou abrir operações no P2P.\n\n` +
      `📋 **Para continuar:**\n` +
      `1️⃣ Leia os termos de responsabilidade\n` +
      `2️⃣ Aceite os termos clicando no botão abaixo\n` +
      `3️⃣ Após aceitar, você poderá usar todos os comandos\n\n` +
      `👤 **Usuário:** ${userName}\n` +
      `🆔 **ID:** \`${ctx.from.id}\`\n` +
      `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📋 Ver e Aceitar Termos',
            callback_data: `view_accept_terms_${ctx.from.id}_${ctx.chat.id}`
          }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
   }

   private async handleNotificationCallbacks(ctx: any): Promise<boolean> {
     const callbackData = ctx.callbackQuery?.data;
     
     if (!callbackData) {
       return false;
     }

     // Callbacks de notificação de não-membro
     if (callbackData.startsWith('acknowledge_non_member_')) {
       await ctx.answerCbQuery('✅ Mensagem confirmada!');
       await ctx.editMessageText(
         '✅ **Confirmado**\n\n' +
         'Você confirmou que entendeu os requisitos para usar o bot.\n\n' +
         '📋 **Lembre-se:**\n' +
         '• Entre no grupo do TrustScore P2P\n' +
         '• Aceite os termos de responsabilidade\n' +
         '• Volte aqui para usar o bot\n\n' +
         '💡 Use `/start` para ver os comandos disponíveis.',
         { parse_mode: 'Markdown' }
       );
       return true;
     }

     // Callback para ver e aceitar termos
     if (callbackData.startsWith('view_accept_terms_')) {
       const parts = callbackData.split('_');
       const userId = parseInt(parts[3]);
       const chatId = parseInt(parts[4]);
       
       if (userId === ctx.from.id) {
         await ctx.answerCbQuery('📋 Redirecionando para os termos...');
         
         // Verificar se é usuário legacy
         const isLegacyUser = await this.isLegacyUser(ctx.from.id);
         
         // Apresentar os termos completos para aceite
         await this.presentTermsForAcceptance(ctx, isLegacyUser);
         
         // Remover a mensagem original ao invés de editá-la
         try {
           await ctx.deleteMessage();
         } catch (error) {
           this.logger.warn('Could not delete original message:', error);
         }
       } else {
         await ctx.answerCbQuery('❌ Este botão não é para você!', { show_alert: true });
       }
       return true;
     }

     return false;
   }

   private async presentTermsForAcceptance(ctx: TextCommandContext, isLegacyUser: boolean): Promise<void> {
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const termsText = this.termsAcceptanceService.getTermsText();
    
    const introMessage = isLegacyUser 
      ? `👋 **Olá ${userName}!**\n\n🔄 **NOSSOS TERMOS MUDARAM!** Novos termos implementados para maior segurança.\n\n🔄 *Por que estou recebendo esta mensagem?*\nNossos termos foram modificados para melhor proteger você e a comunidade. Como usuário ativo, você precisa aceitar as novas condições.\n\n`
      : `🎉 **Bem-vindo(a) ${userName}!**\n\n`;
    
    const message = (
      introMessage +
      termsText + `\n\n` +
      `👤 **Usuário:** ${userName}\n` +
      `🆔 **ID:** \`${ctx.from.id}\`\n` +
      `📅 **Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
      `⚠️ **IMPORTANTE:** Você precisa aceitar estes termos para usar comandos no grupo.`
    );

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ ACEITO OS TERMOS',
            callback_data: `accept_terms_${ctx.from.id}_${ctx.chat.id}`
          },
          {
            text: '❌ NÃO ACEITO',
            callback_data: `reject_terms_${ctx.from.id}_${ctx.chat.id}`
          }
        ],
        [
          {
            text: '📋 Ver Termos Detalhados',
            callback_data: `view_terms_detail_${ctx.from.id}_${ctx.chat.id}`
          }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleCallbackQuery(ctx: any) {
    try {
      this.logger.log(`📞 Callback recebido: ${ctx.callbackQuery?.data} de usuário ${ctx.from?.id}`);

      // Verificar se é um callback de notificação (não precisa de validação)
      if (await this.handleNotificationCallbacks(ctx)) {
        return;
      }

      // Verificar callbacks de revisão de avaliação automática
      const data = ctx.callbackQuery?.data;
      if (data?.startsWith('eval_review_')) {
        const operationId = data.replace('eval_review_', '');
        const handled = await this.pendingEvaluationNotificationService.handleReviewCallback(ctx, operationId);
        if (handled) return;
      }
      if (data?.startsWith('eval_revise_')) {
        const handled = await this.pendingEvaluationNotificationService.handleReviseCallback(ctx, data);
        if (handled) return;
      }

      // Validar termos apenas para callbacks que não são de notificação
      if (await this.shouldValidateTermsForCallback(ctx)) {
        const { validateUserTermsForCallback } = await import('../shared/terms-validation.utils');
        const hasAccepted = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'participar');
        if (!hasAccepted) {
          return;
        }
      }

      // Tentar processar com cada handler que suporta callbacks
      const handlers = [
        this.joinRequestHandler, // PRIMEIRO: processar callbacks de solicitação de entrada
        this.avaliarHandler,
        this.disputarOperacaoCallbackHandler, // ADICIONADO ANTES para processar dispute_operation_ callbacks
        this.confirmAcceptOperationHandler, // ADICIONADO para processar confirm_accept_ callbacks
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
        this.cotacoesHandler, // MOVIDO ANTES do startHandler para processar quotes_back corretamente
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
      'join_accept_terms_', // Solicitação de entrada - aceitar termos
      'join_reject_terms_', // Solicitação de entrada - rejeitar termos
      'admin_approve_join_', // Admin aprova entrada
      'admin_reject_join_', // Admin recusa entrada
      'quotes_', // Cotações são informações públicas
      'start_', // Callbacks do comando /start
      'back_to_start_menu', // Navegação
      'my_ops_', // Navegação de operações
      'my_ops_next_', // Próxima página de operações
      'my_ops_prev_', // Página anterior de operações
      'my_ops_page_info', // Informação de página
      'reputation_close_', // Fechar reputação
      'start_operation_flow', // Fluxo de operação
      'op_cancel' // Cancelar operação
    ];

    // Verificar se é um callback permitido
    const isAllowedCallback = allowedCallbacks.some(prefix => 
      data.startsWith(prefix)
    );

    // Só validar termos se não for callback permitido E se for em grupo
    return !isAllowedCallback && ctx.callbackQuery?.message?.chat?.type !== 'private';
  }



  private async deleteCommandMessage(ctx: TextCommandContext): Promise<void> {
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Silencioso
    }
  }

  private async deleteSystemMessage(ctx: any, description: string = ''): Promise<void> {
    try {
      const cleanupEnabled = this.configService.get<string>('CLEANUP_SERVICE_MESSAGES', 'true') === 'true';
      if (!cleanupEnabled) return;

      if (ctx.chat.type !== 'private') {
        await ctx.deleteMessage();
      }
    } catch (error) {
      // Silencioso
    }
  }

  async onApplicationShutdown(signal: string) {
    this.logger.log(`🛑 Application shutting down (${signal})`);
    this.logger.log('🛑 Telegram Bot managed by NestJS will be stopped automatically.');
  }
}

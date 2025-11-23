import { Injectable, Logger } from '@nestjs/common'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf, Context } from 'telegraf'
import { Update } from 'telegraf/types'
import { Types } from 'mongoose'
import { OperationsService } from '../../../operations/operations.service'
import { OperationsRepository } from '../../../operations/operations.repository'
import { UsersService } from '../../../users/users.service'
import { GroupsService } from '../../../groups/groups.service'
import { OperationStatus } from '../../../operations/schemas/operation.schema'
import { validateActiveMembershipForCallback } from '../../../shared/group-membership.utils'
import { ITextCommandHandler, TextCommandContext } from 'src/telegram/telegram.types'

@Injectable()
export class AdminDisputeCommandHandler implements ITextCommandHandler {
  private readonly logger = new Logger(AdminDisputeCommandHandler.name)
  command = /^\/start\s+admin_dispute_(\w{24})$/

  constructor(
    private readonly operationsService: OperationsService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    @InjectBot() private readonly bot: Telegraf<Context<Update>>,
  ) {}

  async handle(ctx: TextCommandContext): Promise<void> {
    const match = ctx.message?.text?.match(this.command)
    if (!match) return
    const opId = match[1]
    if (!Types.ObjectId.isValid(opId)) {
      await ctx.reply('❌ ID de operação inválido.')
      return
    }

    const adminIdsEnv = process.env.TELEGRAM_ADMINS || ''
    const admins = adminIdsEnv.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (!admins.includes(ctx.from.id)) {
      await ctx.reply('🚫 Apenas administradores podem analisar disputas aqui.')
      return
    }

    const operation = await this.operationsService.getOperationById(new Types.ObjectId(opId))
    if (!operation) {
      await ctx.reply('❌ Operação não encontrada.')
      return
    }

    const creator = await this.usersService.findById(operation.creator.toString())
    const acceptor = operation.acceptor ? await this.usersService.findById(operation.acceptor.toString()) : null

    const typeEmoji = operation.type === 'buy' ? '🟢' : '🔴'
    const typeText = operation.type === 'buy' ? 'COMPRA' : 'VENDA'
    const assetsText = operation.assets.join(', ')
    const networksText = operation.networks.map(n => n.toUpperCase()).join(', ')

    const message = (
      `⚖️ **Análise de Disputa**\n\n` +
      `${typeEmoji} **${typeText} ${assetsText}**\n` +
      `Redes: ${networksText}\n` +
      `Quantidade: ${operation.amount} (total)\n\n` +
      `👤 Criador: ${creator?.userName ? '@' + creator.userName : creator?.firstName}\n` +
      `👤 Negociador: ${acceptor ? (acceptor.userName ? '@' + acceptor.userName : acceptor.firstName) : '—'}\n` +
      `🆔 ID: \`${operation._id}\`\n\n` +
      `Escolha uma ação administrativa:`
    )

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Remover Disputa', callback_data: `admin_resolve_clear_${operation._id}` },
            { text: '🛑 Cancelar Operação', callback_data: `admin_resolve_cancel_${operation._id}` }
          ],
          [
            { text: '🚨 Marcar Fraude', callback_data: `admin_resolve_flag_${operation._id}` }
          ]
        ]
      }
    })
  }

  async handleCallback(ctx: any): Promise<boolean> {
    const data = ctx.callbackQuery?.data
    if (!data) return false

    if (data.startsWith('admin_analyze_dispute_')) {
      const opId = data.replace('admin_analyze_dispute_', '')
      await ctx.answerCbQuery()
      await ctx.reply(`/start admin_dispute_${opId}`)
      return true
    }

    if (data.startsWith('admin_dispute_history_')) {
      await ctx.answerCbQuery()
      try {
        const opId = data.replace('admin_dispute_history_', '')
        if (!Types.ObjectId.isValid(opId)) {
          await ctx.editMessageText('❌ ID inválido para histórico.')
          return true
        }
        const operation = await this.operationsService.getOperationById(new Types.ObjectId(opId))
        const historyService = (this.operationsService as any).operationHistoryService
        if (historyService && historyService.generateConsolidatedMessage) {
          const msg = await historyService.generateConsolidatedMessage(operation)
          await ctx.editMessageText(msg, { parse_mode: 'Markdown' })
        } else {
          await ctx.editMessageText('📊 Histórico indisponível.')
        }
      } catch (e) {
        await ctx.editMessageText('❌ Erro ao obter histórico.')
      }
      return true
    }

    if (data.startsWith('admin_resolve_')) {
      const [_, action, id] = data.split('_resolve_').join('_').split('_')
      if (!Types.ObjectId.isValid(id)) return true
      await ctx.answerCbQuery()

      const adminIdsEnv = process.env.TELEGRAM_ADMINS || ''
      const admins = adminIdsEnv.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      if (!admins.includes(ctx.from.id)) {
        await ctx.answerCbQuery('🚫 Apenas administradores', { show_alert: true })
        return true
      }

      const opObjectId = new Types.ObjectId(id)
      const op = await this.operationsService.getOperationById(opObjectId)
      if (!op) {
        await ctx.editMessageText('❌ Operação não encontrada.')
        return true
      }

      if (action === 'cancel') {
        await this.operationsService.adminCancelOperation(opObjectId, { telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name })
        await ctx.editMessageText('🛑 Operação cancelada por decisão administrativa.')
        return true
      }

      if (action === 'clear') {
        // Remover disputa: voltar ao status aceito
        await this.operationsService.adminClearDispute(opObjectId, { telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name })
        await ctx.editMessageText('✅ Disputa removida. Operação volta ao status Aceita.')
        return true
      }

      if (action === 'flag') {
        await this.operationsService.adminFlagFraud(opObjectId, { telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name })
        await ctx.editMessageText('🚨 Operação marcada como fraude para investigação.')
        return true
      }
      return true
    }
    return false
  }
}

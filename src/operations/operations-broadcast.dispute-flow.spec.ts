import { OperationsBroadcastService } from './operations-broadcast.service'

describe('OperationsBroadcastService dispute flow', () => {
  test('notifyOperationDisputed sends admin message when configured', async () => {
    const bot: any = { telegram: { sendMessage: jest.fn(async () => ({})), editMessageText: jest.fn(async () => ({})) } }
    const cfg: any = { get: (k: string) => (k === 'TELEGRAM_ADMIN_CHANNEL_ID' ? '-100999' : undefined) }
    const service = new OperationsBroadcastService(
      bot,
      { findById: jest.fn(async () => ({ groupId: -100 })) } as any,
      { findById: jest.fn(async (id: string) => ({ userName: id === 'complainant' ? 'alice' : 'bob', firstName: id, userId: id })) } as any,
      { getKarmaForUser: jest.fn(), getTotalKarmaForUser: jest.fn() } as any,
      { updateOperation: jest.fn(async () => ({})) } as any,
      { createPendingEvaluation: jest.fn(), deletePendingEvaluationsByOperation: jest.fn() } as any,
      { getDisputeAnalysis: jest.fn(async () => ({ total: 0, asDefendant: 0, asComplainant: 0 })) } as any,
      cfg
    ) as any

    const op: any = { _id: 'opD', type: 'buy', assets: ['USDT'], networks: ['pix'], amount: 1, price: 1, group: 'g1', messageId: 10 }
    await service.notifyOperationDisputed(op, 'complainant', 'defendant', 'Motivo X')
    const calls = bot.telegram.sendMessage.mock.calls
    const adminCall = calls.find((c: any[]) => c[0] === -100999)
    expect(adminCall).toBeTruthy()
    const payload = adminCall[2]
    expect(payload.parse_mode).toBe('Markdown')
    expect(payload.reply_markup.inline_keyboard[0][0].text).toBe('🔍 Analisar Disputa')
  })

  test('notifyOperationDisputed skips admin when not configured', async () => {
    const bot: any = { telegram: { sendMessage: jest.fn(async () => ({})), editMessageText: jest.fn(async () => ({})) } }
    const cfg: any = { get: () => undefined }
    const service = new OperationsBroadcastService(
      bot,
      { findById: jest.fn(async () => ({ groupId: -100 })) } as any,
      { findById: jest.fn(async (id: string) => ({ userName: id === 'complainant' ? 'alice' : 'bob', firstName: id, userId: id })) } as any,
      { getKarmaForUser: jest.fn(), getTotalKarmaForUser: jest.fn() } as any,
      { updateOperation: jest.fn(async () => ({})) } as any,
      { createPendingEvaluation: jest.fn(), deletePendingEvaluationsByOperation: jest.fn() } as any,
      { getDisputeAnalysis: jest.fn(async () => ({ total: 0, asDefendant: 0, asComplainant: 0 })) } as any,
      cfg
    ) as any

    const op: any = { _id: 'opD2', type: 'sell', assets: ['USDT'], networks: ['pix'], amount: 1, price: 1, group: 'g1', messageId: 11 }
    await service.notifyOperationDisputed(op, 'complainant', 'defendant', 'Motivo Y')
    const adminCalls = bot.telegram.sendMessage.mock.calls.map((c: any[]) => c[0]).filter((id: any) => id === -100999)
    expect(adminCalls.length).toBe(0)
  })
})

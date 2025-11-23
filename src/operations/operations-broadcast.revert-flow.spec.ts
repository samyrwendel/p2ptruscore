import { OperationsBroadcastService } from './operations-broadcast.service'

describe('OperationsBroadcastService revert flow', () => {
  test('revert edits when editMessageText succeeds', async () => {
    const bot: any = {
      telegram: {
        editMessageText: jest.fn(async () => 'edited'),
        sendMessage: jest.fn(async () => ({ message_id: 333 }))
      }
    }
    const cfg: any = { get: () => undefined }
    const service = new OperationsBroadcastService(
      bot,
      { findById: jest.fn(async () => ({ groupId: -100 })) } as any,
      { findById: jest.fn(async () => ({ userName: 'alice', firstName: 'Alice', userId: 1 })) } as any,
      { getKarmaForUser: jest.fn(), getTotalKarmaForUser: jest.fn() } as any,
      { updateOperation: jest.fn(async () => ({})) } as any,
      { createPendingEvaluation: jest.fn(), deletePendingEvaluationsByOperation: jest.fn() } as any,
      { getDisputeAnalysis: jest.fn(async () => ({ total: 0, asDefendant: 0, asComplainant: 0 })) } as any,
      cfg
    ) as any

    const op: any = {
      _id: 'opR',
      type: 'buy',
      assets: ['USDT'],
      networks: ['pix'],
      amount: 10,
      price: 5,
      quotationType: 'manual',
      group: 'g1',
      creator: 'u1',
      messageId: 66,
      description: 'teste'
    }

    await service.notifyOperationReverted(op, 'u1')
    expect(bot.telegram.editMessageText).toHaveBeenCalled()
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
  })

  test('revert falls back to sendMessage when edit fails', async () => {
    const bot: any = {
      telegram: {
        editMessageText: jest.fn(async () => { throw new Error('edit failed') }),
        sendMessage: jest.fn(async () => ({ message_id: 333 }))
      }
    }
    const cfg: any = { get: () => undefined }
    const service = new OperationsBroadcastService(
      bot,
      { findById: jest.fn(async () => ({ groupId: -100 })) } as any,
      { findById: jest.fn(async () => ({ userName: 'alice', firstName: 'Alice', userId: 1 })) } as any,
      { getKarmaForUser: jest.fn(), getTotalKarmaForUser: jest.fn() } as any,
      { updateOperation: jest.fn(async () => ({})) } as any,
      { createPendingEvaluation: jest.fn(), deletePendingEvaluationsByOperation: jest.fn() } as any,
      { getDisputeAnalysis: jest.fn(async () => ({ total: 0, asDefendant: 0, asComplainant: 0 })) } as any,
      cfg
    ) as any

    const op: any = {
      _id: 'opR',
      type: 'buy',
      assets: ['USDT'],
      networks: ['pix'],
      amount: 10,
      price: 5,
      quotationType: 'manual',
      group: 'g1',
      creator: 'u1',
      messageId: 66,
      description: 'teste'
    }

    await service.notifyOperationReverted(op, 'u1')
    expect(bot.telegram.editMessageText).toHaveBeenCalled()
    expect(bot.telegram.sendMessage).toHaveBeenCalled()
  })
})

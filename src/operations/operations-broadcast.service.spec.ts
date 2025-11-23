import { OperationsBroadcastService } from './operations-broadcast.service'

describe('OperationsBroadcastService helpers', () => {
  const dummyConfigService: any = { get: (key: string) => {
    if (key === 'TELEGRAM_BOT_USERNAME') return 'p2pscorebot'
    if (key === 'TELEGRAM_GROUP_ID') return undefined
    if (key === 'TELEGRAM_THREAD_ID') return undefined
    return undefined
  } }

  const service = new OperationsBroadcastService(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    dummyConfigService,
  ) as any

  test('formatPriceAndQuotation BRL manual', () => {
    const operation: any = { assets: ['USDT'], amount: 10, price: 5, quotationType: 'manual' }
    const r = service.formatPriceAndQuotation(operation)
    expect(r.priceFormatted).toBe('R$ 50.00')
    expect(r.quotationFormatted).toBe('R$ 5.00')
  })

  test('formatPriceAndQuotation EUR manual', () => {
    const operation: any = { assets: ['EURO'], amount: 2, price: 3.1234, quotationType: 'manual' }
    const r = service.formatPriceAndQuotation(operation)
    expect(r.priceFormatted).toBe('€ 6.2468')
    expect(r.quotationFormatted).toBe('€ 3.1234')
  })

  test('formatCompletionValues BRL', () => {
    const operation: any = { assets: ['USDT'], price: 5, quotationType: 'manual' }
    const r = service.formatCompletionValues(operation, 100)
    expect(r.priceFormatted).toBe('R$ 5.00')
    expect(r.totalFormatted).toBe('R$ 100.00')
  })

  test('formatCompletionValues EUR', () => {
    const operation: any = { assets: ['EURO'], price: 1.2345, quotationType: 'manual' }
    const r = service.formatCompletionValues(operation, 50)
    expect(r.priceFormatted).toBe('€ 1.2345')
    expect(r.totalFormatted).toBe('€ 50.00')
  })

  test('buildInlineKeyboardByStatus pending_completion', () => {
    const operation: any = { _id: 'op1', status: 'pending_completion' }
    const k = service.buildInlineKeyboardByStatus(operation, { userName: 'alice' }, { userName: 'bob' })
    expect(Array.isArray(k.inline_keyboard)).toBe(true)
    const texts = k.inline_keyboard.flat().map((b: any) => b.text)
    expect(texts).toContain('🔙 Desistir da Operação')
  })

  test('buildInlineKeyboardByStatus accepted', () => {
    const operation: any = { _id: 'op2', status: 'accepted' }
    const k = service.buildInlineKeyboardByStatus(operation, { userName: 'alice' }, { userName: 'bob' })
    const texts = k.inline_keyboard.flat().map((b: any) => b.text)
    expect(texts).toContain('💬 Criador')
    expect(texts).toContain('💬 Negociador')
  })

  test('buildInlineKeyboardByStatus pending (default)', () => {
    const operation: any = { _id: 'op3', status: 'pending' }
    const k = service.buildInlineKeyboardByStatus(operation, { userName: 'alice' }, { userName: 'bob' })
    const texts = k.inline_keyboard.flat().map((b: any) => b.text)
    expect(texts).toContain('✅ Solicitar Conclusão')
    expect(texts).toContain('⚠️ Contestar Operação')
  })

  test('sendWithBackoff retries on 429 then succeeds', async () => {
    let calls = 0
    const fn = jest.fn(async () => {
      calls++
      if (calls < 3) {
        const err: any = new Error('rate limit')
        err.response = { error_code: 429 }
        throw err
      }
      return 'ok'
    })
    const result = await service.sendWithBackoff(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

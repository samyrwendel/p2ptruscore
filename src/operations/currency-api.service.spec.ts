import { CurrencyApiService } from './currency-api.service'
import { HttpService } from '@nestjs/axios'
import { of } from 'rxjs'

describe('CurrencyApiService', () => {
  test('getCurrentRates caches result and respects TTL', async () => {
    const http = { get: jest.fn(() => of({ data: { USDBRL: { bid: '5.00', pctChange: '0', high: '5.10', low: '4.90', name: 'USD/BRL' } } })) } as any as HttpService
    const cfg: any = { get: (k: string) => (k === 'CACHE_TTL' ? '1' : k === 'REQUEST_TIMEOUT' ? '1000' : undefined) }
    const service = new CurrencyApiService(http, cfg)
    const r1 = await service.getCurrentRates()
    expect(http.get).toHaveBeenCalledTimes(1)
    const r2 = await service.getCurrentRates()
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(r1.USDBRL?.bid).toBe('5.00')
    expect(r2.USDBRL?.bid).toBe('5.00')
  })
})


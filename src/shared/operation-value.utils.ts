/**
 * Formatação consistente de VALOR de operação P2P, evitando exibir R$ 0,00 quando o preço ainda não foi
 * materializado. Cotação automática (google/binance) nasce com price 0 e só trava no ACEITE — antes disso,
 * mostrar "a calcular no aceite" em vez de R$ 0,00. Legado auto concluído sem preço → "—".
 * Manual sempre tem price > 0 (definido pelo criador).
 */
interface OpValueLike {
  price?: number;
  amount?: number;
  quotationType?: string;
}

export function isAutoQuote(op: OpValueLike): boolean {
  return op.quotationType === 'google' || op.quotationType === 'binance';
}

export function isPriceLocked(op: OpValueLike): boolean {
  return typeof op.price === 'number' && op.price > 0;
}

/** Preço unitário em R$/un para exibição. Auto sem preço → "a calcular no aceite"; sem preço e não-auto → "—". */
export function formatUnitPriceBRL(op: OpValueLike): string {
  if (isPriceLocked(op)) return `R$ ${(op.price as number).toFixed(2)}/un`;
  return isAutoQuote(op) ? 'a calcular no aceite' : '—';
}

/** Total (amount × price) em R$ para exibição, com o mesmo tratamento de preço não materializado. */
export function formatTotalBRL(op: OpValueLike): string {
  if (isPriceLocked(op)) return `R$ ${((op.amount || 0) * (op.price as number)).toFixed(2)}`;
  return isAutoQuote(op) ? 'a calcular no aceite' : '—';
}

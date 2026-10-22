/**
 * Cuota ilustrativa, del mismo tipo que la de Unidades Chile:
 * pie, plazo y método francés. No es la cuota de una financiera.
 * La tasa es referencial y va declarada en la ficha.
 */
export const ILLUSTRATIVE_MONTHLY_RATE = 0.0321;
export const QUOTE_TERMS = [12, 24, 36, 48] as const;
export const DEFAULT_DOWN_RATIO = 0.2;
export const DEFAULT_TERM_MONTHS = 48;

export function monthlyPayment(principal: number, months: number, monthlyRate = ILLUSTRATIVE_MONTHLY_RATE): number {
  if (!(principal > 0) || !(months > 0)) return 0;
  if (!(monthlyRate > 0)) return Math.round(principal / months);
  const factor = (monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
  return Math.round(principal * factor);
}

export function quoteFromPrice(price: number, downPayment: number, months: number) {
  const safePrice = Math.max(0, Math.round(price) || 0);
  const down = Math.min(safePrice, Math.max(0, Math.round(downPayment) || 0));
  const term = QUOTE_TERMS.includes(months as (typeof QUOTE_TERMS)[number]) ? months : DEFAULT_TERM_MONTHS;
  const financed = Math.max(0, safePrice - down);
  return {
    price: safePrice,
    downPayment: down,
    termMonths: term,
    financed,
    monthlyRate: ILLUSTRATIVE_MONTHLY_RATE,
    monthly: monthlyPayment(financed, term),
  };
}

export const QUOTE_DISCLAIMER =
  "Simulación referencial. No corresponde a la cuota real: en la mayoría de los casos esa cuota puede ser menor, y solo en muy pocos casos igual o superior. La tasa, el pie, el plazo y los gastos los confirma la entidad financiera. RG Motors no otorga el crédito.";

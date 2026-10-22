"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/vehicles";
import { whatsappLink } from "@/lib/company";
import {
  DEFAULT_DOWN_RATIO,
  DEFAULT_TERM_MONTHS,
  ILLUSTRATIVE_MONTHLY_RATE,
  QUOTE_DISCLAIMER,
  QUOTE_TERMS,
  quoteFromPrice,
} from "@/lib/finance/referentialQuote";

export default function ReferentialQuote({
  price,
  name,
}: {
  price: number;
  name: string;
}) {
  const [down, setDown] = useState(() => Math.round(price * DEFAULT_DOWN_RATIO));
  const [term, setTerm] = useState<number>(DEFAULT_TERM_MONTHS);
  const quote = useMemo(() => quoteFromPrice(price, down, term), [price, down, term]);
  const rateLabel = `${(ILLUSTRATIVE_MONTHLY_RATE * 100).toFixed(2).replace(".", ",")}% mensual`;
  const wa = whatsappLink(
    `Hola RG Motors, quiero consultar la cuota referencial del ${name}: pie ${formatCLP(quote.downPayment)} a ${quote.termMonths} meses.`,
  );

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5" aria-labelledby="cuota-referencial">
      <div className="flex items-end justify-between gap-3">
        <h2 id="cuota-referencial" className="text-base font-bold text-white">
          Cuota referencial
        </h2>
        <p className="text-right text-[11px] text-white/60">Tasa ilustrativa {rateLabel}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/70">
          Pie
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={price}
            step={50000}
            value={down}
            onChange={(event) => setDown(Number(event.target.value))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-brand-400"
          />
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/70">
          Plazo
          <select
            value={term}
            onChange={(event) => setTerm(Number(event.target.value))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-brand-400"
          >
            {QUOTE_TERMS.map((months) => (
              <option key={months} value={months} className="bg-ink-900">
                {months} meses
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-wider text-white/60">Cuota mensual ilustrativa</p>
      <p className="text-3xl font-extrabold tracking-tight text-white">{formatCLP(quote.monthly)}</p>
      <p className="mt-1 text-xs text-white/60">
        A financiar {formatCLP(quote.financed)} · {quote.termMonths} meses
      </p>
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex min-h-11 items-center justify-center rounded-full border border-[#25D366]/40 px-4 text-sm font-semibold text-[#7dffb0] transition hover:bg-[#25D366]/10"
      >
        Consultar esta cuota por WhatsApp
      </a>
      <p className="mt-3 text-[12px] leading-relaxed text-white/55">{QUOTE_DISCLAIMER}</p>
      <p className="mt-2 text-[11px] text-white/60">
        <Link href="/aviso-credito" className="underline underline-offset-2 hover:text-white/70">
          Aviso de crédito
        </Link>
      </p>
    </section>
  );
}

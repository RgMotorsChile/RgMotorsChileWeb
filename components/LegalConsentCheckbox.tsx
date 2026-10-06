"use client";

import Link from "next/link";

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  id?: string;
};

export default function LegalConsentCheckbox({
  checked,
  onChange,
  className = "",
  id = "legal-consent",
}: Props) {
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-2.5 text-[11px] leading-relaxed text-white/55 ${className}`}>
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/30 bg-ink-950 text-brand-500 focus:ring-brand-500/40"
      />
      <span>
        Acepto la{" "}
        <Link href="/privacidad" className="text-brand-300 underline-offset-2 hover:underline">
          Política de Privacidad
        </Link>{" "}
        y autorizo a RG Motors a contactarme sobre mi consulta.{" "}
        <Link href="/terminos" className="text-brand-300 underline-offset-2 hover:underline">
          Términos de uso
        </Link>
        .
      </span>
    </label>
  );
}

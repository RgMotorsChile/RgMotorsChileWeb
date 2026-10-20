"use client";

export type CategoryPill = "todos" | "hibridos" | "suv" | "sedan" | "camioneta";

interface QuickCategoryFilterProps {
  activeCategory: CategoryPill;
  onSelectCategory: (cat: CategoryPill) => void;
  counts: Record<CategoryPill, number>;
}

export default function QuickCategoryFilter({
  activeCategory,
  onSelectCategory,
  counts,
}: QuickCategoryFilterProps) {
  const pills: { id: CategoryPill; label: string; icon: string }[] = [
    { id: "todos", label: "Todos", icon: "🚗" },
    { id: "hibridos", label: "Híbridos & Eléctricos", icon: "⚡" },
    { id: "suv", label: "SUVs & Crossovers", icon: "🏔️" },
    { id: "sedan", label: "Sedanes", icon: "💼" },
    { id: "camioneta", label: "Camionetas", icon: "🛻" },
  ];

  return (
    <div className="w-full max-w-full min-w-0">
      <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none select-none snap-x snap-mandatory">
        {pills.map((p) => {
          const active = activeCategory === p.id;
          const count = counts[p.id] || 0;
          return (
            <button
              key={p.id}
              onClick={() => onSelectCategory(p.id)}
              className={`flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold tracking-wide transition-all duration-200 sm:px-4 sm:text-xs ${
                active
                  ? "bg-white text-ink-950 shadow-glow"
                  : "border border-white/12 bg-white/[0.05] text-white/70 hover:border-white/25 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  active ? "bg-ink-900/10 text-ink-950" : "bg-white/10 text-white/50"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

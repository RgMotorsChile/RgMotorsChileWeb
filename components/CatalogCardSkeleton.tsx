export default function CatalogCardSkeleton() {
  return (
    <div
      className="flex overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0e1016] sm:flex-col"
      aria-hidden
    >
      <div className="aspect-[4/3] w-[42%] max-w-[9.5rem] shrink-0 animate-pulse bg-white/[0.06] sm:aspect-[16/10] sm:w-full sm:max-w-none" />
      <div className="flex h-[7.5rem] flex-1 flex-col justify-center gap-2 overflow-hidden border-l border-white/[0.06] p-3 sm:h-[9.5rem] sm:border-l-0 sm:border-t sm:p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-2 h-5 w-2/5 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}

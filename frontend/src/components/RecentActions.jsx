const statusStyle = {
  pending: "bg-white/55 text-forest-500 border-white/70",
  executing: "bg-sky2-100/70 text-sky2-600 border-sky2-300/60",
  success: "bg-plant-100/70 text-plant-700 border-plant-300/60",
  failed: "bg-rose-100/70 text-rose-700 border-rose-300/60",
};

const statusLabel = {
  pending: "QUEUED",
  executing: "RUNNING",
  success: "DONE",
  failed: "FAILED",
};

const typeLabel = {
  water: { emoji: "💧", text: "WATER", accent: "text-sky2-600" },
  fertilizer: { emoji: "🌿", text: "FERTILIZE", accent: "text-sun-500" },
};

export function RecentActions({ items }) {
  if (!items?.length) {
    return (
      <div className="surface rounded-2xl p-8 text-sm text-forest-400 text-center">
        <div className="text-3xl mb-2 opacity-60" aria-hidden>📭</div>
        <div className="label-eyebrow">NO ACTIVITY YET</div>
      </div>
    );
  }
  return (
    <section className="surface rounded-2xl overflow-hidden animate-fade-up">
      <div className="px-5 py-3.5 border-b border-white/70 flex items-center justify-between">
        <h3 className="font-display font-bold text-forest-900 tracking-wider">RECENT ACTIVITY</h3>
        <span className="font-mono text-[10px] text-forest-500 tracking-wider">
          {String(items.length).padStart(2, "0")} EVENTS
        </span>
      </div>
      <ul className="divide-y divide-white/60">
        {items.map((a) => {
          const t = typeLabel[a.actionType] ?? { emoji: "•", text: a.actionType, accent: "text-forest-600" };
          return (
            <li
              key={a.id}
              className="px-5 py-3 flex items-center justify-between gap-3 text-sm hover:bg-white/40 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="h-9 w-9 grid place-items-center rounded-xl surface-flat text-base shrink-0"
                  aria-hidden
                >
                  {t.emoji}
                </span>
                <div className="min-w-0">
                  <div className={`font-bold tracking-wider text-xs ${t.accent}`}>{t.text}</div>
                  <div className="text-[11px] text-forest-500 font-mono mt-0.5">
                    {new Date(a.createdAt).toLocaleString("th-TH")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs font-bold text-point">−{a.pointsDeducted}</span>
                <span className={`chip border ${statusStyle[a.status] ?? "bg-white/40"}`}>
                  {statusLabel[a.status] ?? a.status}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

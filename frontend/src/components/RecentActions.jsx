const statusStyle = {
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  executing: "bg-sky-100 text-sky-700 border-sky-200",
  success: "bg-plant-100 text-plant-800 border-plant-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

const statusLabel = {
  pending: "รอคิว",
  executing: "กำลังทำงาน",
  success: "สำเร็จ",
  failed: "ล้มเหลว",
};

const typeLabel = { water: { emoji: "💧", text: "รดน้ำ" }, fertilizer: { emoji: "🌿", text: "ให้ปุ๋ย" } };

export function RecentActions({ items }) {
  if (!items?.length) {
    return (
      <div className="glass rounded-2xl p-6 text-sm text-plant-800/60 text-center">
        <div className="text-3xl mb-2" aria-hidden>📭</div>
        ยังไม่มีประวัติการสั่งงาน
      </div>
    );
  }
  return (
    <section className="glass rounded-2xl overflow-hidden animate-fade-up">
      <div className="px-5 py-3 border-b border-white/60 flex items-center justify-between">
        <h3 className="font-bold text-plant-900">ประวัติล่าสุด</h3>
        <span className="text-xs text-plant-800/50">{items.length} รายการ</span>
      </div>
      <ul className="divide-y divide-white/50">
        {items.map((a) => {
          const t = typeLabel[a.actionType] ?? { emoji: "•", text: a.actionType };
          return (
            <li key={a.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm hover:bg-white/40 transition">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-9 w-9 grid place-items-center rounded-xl bg-white/70 border border-white/80 text-base shadow-soft" aria-hidden>
                  {t.emoji}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-plant-900">{t.text}</div>
                  <div className="text-[11px] text-plant-800/50">
                    {new Date(a.createdAt).toLocaleString("th-TH")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-point text-xs font-bold">−{a.pointsDeducted}</span>
                <span className={`chip border ${statusStyle[a.status] ?? "bg-gray-100"}`}>
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

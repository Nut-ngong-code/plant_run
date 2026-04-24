const statusStyle = {
  pending: "bg-gray-100 text-gray-600",
  executing: "bg-sky-100 text-sky-700",
  success: "bg-plant-100 text-plant-700",
  failed: "bg-red-100 text-red-700",
};

const typeLabel = { water: "💧 รดน้ำ", fertilizer: "🌿 ให้ปุ๋ย" };

export function RecentActions({ items }) {
  if (!items?.length) {
    return (
      <div className="bg-white rounded-xl border border-plant-100 p-5 text-sm text-gray-500">
        ยังไม่มีประวัติการสั่งงาน
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-plant-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-plant-100 font-semibold">ประวัติล่าสุด</div>
      <ul className="divide-y divide-plant-100">
        {items.map((a) => (
          <li key={a.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{typeLabel[a.actionType] ?? a.actionType}</span>
              <span className="ml-2 text-xs text-gray-400">
                {new Date(a.createdAt).toLocaleString("th-TH")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-point text-xs">-{a.pointsDeducted}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${statusStyle[a.status] ?? "bg-gray-100"}`}>
                {a.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

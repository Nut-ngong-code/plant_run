export function MoistureGauge({ percent }) {
  const value = percent == null ? null : Math.max(0, Math.min(100, percent));
  const status =
    value == null
      ? { label: "ไม่มีข้อมูล", from: "#CBD5E1", to: "#94A3B8", text: "text-gray-500" }
      : value < 25
      ? { label: "แห้งมาก", from: "#FB7185", to: "#C84343", text: "text-rose-600" }
      : value < 50
      ? { label: "เริ่มแห้ง", from: "#FBBF24", to: "#EF9F27", text: "text-amber-600" }
      : value < 75
      ? { label: "ชื้นพอดี", from: "#4DBC83", to: "#1D9E75", text: "text-plant-700" }
      : { label: "ชุ่มชื้น", from: "#38BDF8", to: "#0E7490", text: "text-sky-600" };

  const width = value == null ? 0 : value;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5 text-gray-500">
          <DropIcon />
          <span>ความชื้นในดิน</span>
        </span>
        <span className={`font-mono font-semibold ${status.text}`}>
          {value == null ? "—" : `${value}%`}
          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {status.label}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 bg-gradient-to-r from-cream-100 to-sage-100 rounded-full overflow-hidden ring-1 ring-inset ring-white/60">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${width}%`,
            backgroundImage: `linear-gradient(90deg, ${status.from}, ${status.to})`,
            boxShadow: value != null ? `0 0 14px -2px ${status.to}66` : undefined,
          }}
        />
        {/* shimmer overlay */}
        {value != null && value > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full opacity-60"
            style={{
              width: `${width}%`,
              backgroundImage:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2.4s linear infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}

function DropIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5C8 1.5 3 7 3 10.5C3 13.2614 5.23858 15 8 15C10.7614 15 13 13.2614 13 10.5C13 7 8 1.5 8 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Apple Fitness style circular ring tuned for the light theme.
// Soft inner track, vibrant gradient progress, dark legible label centered below.

export function MoistureGauge({
  percent,
  size = 240,
  stroke = 12,
  showLabel = true,
  children,
}) {
  const value = percent == null ? null : Math.max(0, Math.min(100, percent));
  const status = statusOf(value);
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = value == null ? circumference : circumference * (1 - value / 100);
  const gradId = `gauge-${status.key}`;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={status.from} />
            <stop offset="100%" stopColor={status.to} />
          </linearGradient>
        </defs>
        {/* track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(15,42,30,0.08)"
          strokeWidth={stroke}
        />
        {/* progress */}
        {value != null && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 4px 10px ${status.to}66)`,
              transition: "stroke-dashoffset 700ms ease-out",
            }}
          />
        )}
      </svg>

      {children && (
        <div className="absolute inset-0 grid place-items-center">{children}</div>
      )}

      {showLabel && (
        <div className="absolute left-0 right-0 -bottom-1 flex flex-col items-center text-center pointer-events-none">
          <div
            className="font-display font-bold tabular-nums tracking-tight"
            style={{ fontSize: size * 0.16, color: status.text, lineHeight: 1 }}
          >
            {value == null ? "—" : `${value}`}
            <span style={{ fontSize: size * 0.07, opacity: 0.75 }}>%</span>
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.22em] font-bold mt-1"
            style={{ color: status.text }}
          >
            {status.label}
          </div>
        </div>
      )}
    </div>
  );
}

function statusOf(value) {
  if (value == null)
    return { key: "none", label: "ไม่มีข้อมูล", from: "#9FB8A4", to: "#5E8267", text: "#5E8267" };
  if (value < 25)
    return { key: "dry-bad", label: "แห้งมาก", from: "#FB7185", to: "#C84343", text: "#C84343" };
  if (value < 50)
    return { key: "dry", label: "เริ่มแห้ง", from: "#FBBF24", to: "#E76A00", text: "#B85100" };
  if (value < 75)
    return { key: "ok", label: "ชื้นพอดี", from: "#5FD491", to: "#0EA15A", text: "#076635" };
  return { key: "wet", label: "ชุ่มชื้น", from: "#7DD3FC", to: "#0284C7", text: "#0284C7" };
}

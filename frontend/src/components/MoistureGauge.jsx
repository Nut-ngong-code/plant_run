export function MoistureGauge({ percent }) {
  const value = percent == null ? null : Math.max(0, Math.min(100, percent));
  const color =
    value == null
      ? "#D1D5DB"
      : value < 25
      ? "#C84343"
      : value < 50
      ? "#EF9F27"
      : "#1D9E75";

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>ความชื้นในดิน</span>
        <span className="font-mono text-gray-700">{value == null ? "—" : `${value}%`}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: value == null ? "0%" : `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

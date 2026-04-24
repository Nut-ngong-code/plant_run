// รูปกราฟิกต้นไม้ที่เปลี่ยนตามสถานะความชื้น+แต้ม
// ไม่ได้ใช้ไฟล์ SVG ภายนอก — วาดด้วย inline SVG ง่ายๆ
// mood: "happy" | "neutral" | "sad"

export function PlantGraphic({ mood = "happy", size = 160 }) {
  const palette = {
    happy: { leaf: "#1D9E75", leafDark: "#157554", droop: 0, blush: "#F4B8A7" },
    neutral: { leaf: "#8CB28A", leafDark: "#5D8B60", droop: 6, blush: null },
    sad: { leaf: "#9B8D5E", leafDark: "#6E6541", droop: 14, blush: null },
  }[mood];

  return (
    <svg viewBox="0 0 160 180" width={size} height={(size * 180) / 160} role="img" aria-label={`plant ${mood}`}>
      {/* pot */}
      <path d="M40 140 L120 140 L110 175 L50 175 Z" fill="#BA7517" />
      <rect x="36" y="132" width="88" height="12" rx="3" fill="#A35F10" />

      {/* stem */}
      <path
        d={`M80 135 Q80 ${100 + palette.droop} 80 ${70 + palette.droop}`}
        stroke={palette.leafDark}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />

      {/* left leaf */}
      <ellipse
        cx={50}
        cy={85 + palette.droop}
        rx="22"
        ry="14"
        fill={palette.leaf}
        transform={`rotate(-25 50 ${85 + palette.droop})`}
      />
      {/* right leaf */}
      <ellipse
        cx={110}
        cy={95 + palette.droop}
        rx="22"
        ry="14"
        fill={palette.leaf}
        transform={`rotate(25 110 ${95 + palette.droop})`}
      />
      {/* top leaves */}
      <ellipse cx="80" cy={55 + palette.droop} rx="16" ry="22" fill={palette.leafDark} />
      <ellipse cx="72" cy={45 + palette.droop} rx="10" ry="14" fill={palette.leaf} transform={`rotate(-20 72 ${45 + palette.droop})`} />
      <ellipse cx="88" cy={48 + palette.droop} rx="10" ry="14" fill={palette.leaf} transform={`rotate(20 88 ${48 + palette.droop})`} />

      {/* face */}
      <g transform={`translate(0 ${palette.droop})`}>
        <circle cx="72" cy="110" r="2.2" fill="#333" />
        <circle cx="88" cy="110" r="2.2" fill="#333" />
        {mood === "happy" && <path d="M73 118 Q80 124 87 118" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />}
        {mood === "neutral" && <path d="M73 119 L87 119" stroke="#333" strokeWidth="2" strokeLinecap="round" />}
        {mood === "sad" && <path d="M73 122 Q80 116 87 122" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />}
        {palette.blush && (
          <>
            <circle cx="68" cy="116" r="3" fill={palette.blush} opacity="0.7" />
            <circle cx="92" cy="116" r="3" fill={palette.blush} opacity="0.7" />
          </>
        )}
      </g>
    </svg>
  );
}

export function moodFromStatus({ moisturePercent, totalPoints }) {
  // ง่ายๆ: ดินชื้น + มีแต้มเหลือ → สดใส, ดินแห้ง/ไม่มีแต้ม → เหี่ยว
  const m = moisturePercent ?? 50;
  if (m < 25) return "sad";
  if (m < 50 || (totalPoints ?? 0) < 15) return "neutral";
  return "happy";
}

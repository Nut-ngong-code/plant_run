// Plant SVG tuned for the bright/light theme.
// Saturated leaves with a soft drop shadow that reads on a light glass surface.
// mood: "happy" | "neutral" | "sad"

export function PlantGraphic({ mood = "happy", size = 160, animated = true }) {
  const palette = {
    happy: {
      leaf: "#0EA15A",
      leafLight: "#5FD491",
      leafDark: "#054C26",
      droop: 0,
      blush: "#F4B8A7",
      glow: "#94E9B5",
      glowOpacity: 0.55,
    },
    neutral: {
      leaf: "#5E8267",
      leafLight: "#85A48C",
      leafDark: "#1F3527",
      droop: 6,
      blush: null,
      glow: "#B0C7B5",
      glowOpacity: 0.35,
    },
    sad: {
      leaf: "#7A8460",
      leafLight: "#A7B085",
      leafDark: "#3F3A26",
      droop: 14,
      blush: null,
      glow: "#D5DBC0",
      glowOpacity: 0.25,
    },
  }[mood];

  const id = `pg-${mood}`;
  const breathe = animated ? "animate-breathe" : "";

  return (
    <svg
      viewBox="0 0 180 200"
      width={size}
      height={(size * 200) / 180}
      role="img"
      aria-label={`plant ${mood}`}
      className="drop-shadow-[0_8px_18px_rgba(15,42,30,0.18)]"
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor={palette.glow} stopOpacity={palette.glowOpacity} />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.leafLight} />
          <stop offset="100%" stopColor={palette.leaf} />
        </linearGradient>
        <linearGradient id={`${id}-leafDark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.leaf} />
          <stop offset="100%" stopColor={palette.leafDark} />
        </linearGradient>
        <linearGradient id={`${id}-pot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C98C4D" />
          <stop offset="100%" stopColor="#8C5A24" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D9A266" />
          <stop offset="100%" stopColor="#A36F30" />
        </linearGradient>
        <linearGradient id={`${id}-soil`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3F2A18" />
          <stop offset="100%" stopColor="#5A3D24" />
        </linearGradient>
      </defs>

      {/* glow halo */}
      <ellipse cx="90" cy="100" rx="80" ry="78" fill={`url(#${id}-glow)`} />

      {/* plant cluster (breathing) */}
      <g className={breathe} style={{ transformOrigin: "90px 130px" }}>
        {/* stem */}
        <path
          d={`M90 145 Q90 ${108 + palette.droop} 90 ${78 + palette.droop}`}
          stroke={`url(#${id}-leafDark)`}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />

        {/* left leaf */}
        <ellipse
          cx={56}
          cy={92 + palette.droop}
          rx="26"
          ry="15"
          fill={`url(#${id}-leaf)`}
          transform={`rotate(-25 56 ${92 + palette.droop})`}
        />
        <path
          d={`M40 ${94 + palette.droop} Q56 ${88 + palette.droop} 76 ${92 + palette.droop}`}
          stroke={palette.leafDark}
          strokeWidth="1.2"
          fill="none"
          opacity="0.55"
        />

        {/* right leaf */}
        <ellipse
          cx={124}
          cy={102 + palette.droop}
          rx="26"
          ry="15"
          fill={`url(#${id}-leaf)`}
          transform={`rotate(25 124 ${102 + palette.droop})`}
        />
        <path
          d={`M104 ${100 + palette.droop} Q124 ${106 + palette.droop} 144 ${102 + palette.droop}`}
          stroke={palette.leafDark}
          strokeWidth="1.2"
          fill="none"
          opacity="0.55"
        />

        {/* top cluster */}
        <ellipse cx="90" cy={62 + palette.droop} rx="18" ry="25" fill={`url(#${id}-leafDark)`} />
        <ellipse
          cx="80"
          cy={50 + palette.droop}
          rx="11"
          ry="16"
          fill={`url(#${id}-leaf)`}
          transform={`rotate(-22 80 ${50 + palette.droop})`}
        />
        <ellipse
          cx="100"
          cy={54 + palette.droop}
          rx="11"
          ry="16"
          fill={`url(#${id}-leaf)`}
          transform={`rotate(22 100 ${54 + palette.droop})`}
        />
        <path
          d={`M90 ${42 + palette.droop} L90 ${72 + palette.droop}`}
          stroke={palette.leafDark}
          strokeWidth="1"
          opacity="0.4"
        />

        {/* face on stem */}
        <g transform={`translate(0 ${palette.droop})`}>
          <circle cx="82" cy="118" r="2.4" fill="#1A2A22" />
          <circle cx="98" cy="118" r="2.4" fill="#1A2A22" />
          {mood === "happy" && (
            <path
              d="M83 126 Q90 132 97 126"
              stroke="#1A2A22"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {mood === "neutral" && (
            <path d="M83 127 L97 127" stroke="#1A2A22" strokeWidth="2" strokeLinecap="round" />
          )}
          {mood === "sad" && (
            <path
              d="M83 130 Q90 124 97 130"
              stroke="#1A2A22"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {palette.blush && (
            <>
              <circle cx="78" cy="124" r="3" fill={palette.blush} opacity="0.7" />
              <circle cx="102" cy="124" r="3" fill={palette.blush} opacity="0.7" />
            </>
          )}
        </g>
      </g>

      {/* pot rim + body */}
      <rect x="38" y="142" width="104" height="14" rx="4" fill={`url(#${id}-rim)`} />
      <path d="M44 156 L136 156 L124 192 L56 192 Z" fill={`url(#${id}-pot)`} />
      {/* pot highlight */}
      <path
        d="M52 160 L60 188"
        stroke="#E5B27C"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* soil */}
      <ellipse cx="90" cy="148" rx="48" ry="5" fill={`url(#${id}-soil)`} />
    </svg>
  );
}

export function moodFromStatus({ moisturePercent, totalPoints }) {
  const m = moisturePercent ?? 50;
  if (m < 25) return "sad";
  if (m < 50 || (totalPoints ?? 0) < 15) return "neutral";
  return "happy";
}

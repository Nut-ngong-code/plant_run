export function StatsBar({ user, weekly }) {
  const totalPoints = user?.totalPoints ?? 0;
  const weeklyKm = Number(weekly?.distanceKm ?? 0).toFixed(2);
  const weeklyPts = weekly?.pointsEarned ?? 0;
  const runCount = weekly?.runCount ?? 0;

  // ต่ำกว่า cost ของรดน้ำ (15) = สั่งงานไม่ได้แล้ว — เตือนให้ไปวิ่ง
  const MIN_TO_WATER = 15;
  const lowPoints = totalPoints < MIN_TO_WATER;
  const ptsNeeded = MIN_TO_WATER - totalPoints;

  return (
    <div className="space-y-3 sm:space-y-4">
      {lowPoints && (
        <div className="flex animate-fade-up">
          <span className="chip border bg-sun-100/70 text-sun-800 border-sun-300/60 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-sun-500 shadow-[0_0_6px_rgba(252,138,2,0.6)] animate-pulse" />
            <span>⚡ GO RUN — NEED {ptsNeeded} MORE PTS TO WATER ({(ptsNeeded / 10).toFixed(1)} KM)</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      <Stat
        label="TOTAL POINTS"
        value={totalPoints}
        suffix="PTS"
        accent="plant"
        icon={<CoinIcon />}
      />
      <Stat
        label="THIS WEEK"
        value={weeklyKm}
        suffix="KM"
        accent="strava"
        icon={<RunIcon />}
        hint={`${runCount} runs · +${weeklyPts} pts`}
      />
      <Stat
        label="EXCHANGE RATE"
        value="1KM"
        suffix="= 10 PTS"
        accent="water"
        icon={<ExchangeIcon />}
        hint="WATER −15 · FERT −20"
        isText
        className="col-span-2 sm:col-span-1"
      />
      </div>
    </div>
  );
}

const accentMap = {
  plant: {
    grad: "from-plant-500 to-plant-700",
    glow: "rgba(14,161,90,0.25)",
    iconBg: "bg-plant-100/80 border-plant-300/60 text-plant-700",
  },
  strava: {
    grad: "from-sun-400 to-strava",
    glow: "rgba(252,76,2,0.22)",
    iconBg: "bg-sun-100/80 border-sun-300/60 text-strava",
  },
  water: {
    grad: "from-sky2-400 to-sky2-600",
    glow: "rgba(14,165,233,0.22)",
    iconBg: "bg-sky2-100/80 border-sky2-300/60 text-sky2-600",
  },
};

function Stat({ label, value, suffix, accent, icon, hint, isText, className = "" }) {
  const a = accentMap[accent];
  return (
    <div
      className={`surface relative overflow-hidden rounded-2xl p-4 sm:p-5 animate-fade-up ${className}`}
    >
      {/* corner glow */}
      <div
        className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full blur-2xl"
        style={{ background: a.glow }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="label-eyebrow">{label}</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`stat-num bg-gradient-to-r ${a.grad} bg-clip-text text-transparent ${
                isText ? "text-xl sm:text-2xl" : "text-[2.5rem] sm:text-[3rem] leading-none"
              }`}
            >
              {value}
            </span>
            <span className="text-[11px] font-bold tracking-[0.15em] text-forest-500">
              {suffix}
            </span>
          </div>
          {hint && (
            <div className="mt-2 text-[11px] tracking-wider text-forest-500 font-medium">{hint}</div>
          )}
        </div>
        <div
          className={`h-9 w-9 grid place-items-center rounded-xl border ${a.iconBg} shrink-0`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.5V11.5M5.5 6.5C5.5 5.4 6.4 4.7 7.5 4.7H8.7C9.7 4.7 10.5 5.4 10.5 6.4C10.5 7.3 9.8 8 8.8 8H7.4C6.4 8 5.5 8.7 5.5 9.7C5.5 10.6 6.3 11.3 7.4 11.3H8.5C9.6 11.3 10.5 10.6 10.5 9.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="11" cy="3" r="1.5" fill="currentColor" />
      <path
        d="M5 14L7 10L5.5 8L7.5 5.5L10.5 6.5L12.5 9"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 9.5L5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ExchangeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 5H12L10 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M13 11H4L6 13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

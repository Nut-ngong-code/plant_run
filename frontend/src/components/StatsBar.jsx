export function StatsBar({ user, weekly }) {
  const totalPoints = user?.totalPoints ?? 0;
  const weeklyKm = Number(weekly?.distanceKm ?? 0).toFixed(2);
  const weeklyPts = weekly?.pointsEarned ?? 0;
  const runCount = weekly?.runCount ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      <Stat
        label="แต้มสะสม"
        value={totalPoints}
        suffix="pts"
        gradient="grad-text-sun"
        icon={<CoinIcon />}
        ring="from-sun/40 to-amber-200/40"
      />
      <Stat
        label="วิ่งสัปดาห์นี้"
        value={weeklyKm}
        suffix="กม."
        gradient="grad-text-strava"
        icon={<RunIcon />}
        ring="from-orange-200/50 to-red-200/40"
        hint={`${runCount} ครั้ง · +${weeklyPts} แต้ม`}
      />
      <Stat
        label="อัตราแลก"
        value="1 กม."
        suffix="= 10 pts"
        gradient="grad-text"
        icon={<ExchangeIcon />}
        ring="from-plant-200/60 to-sage-200/50"
        hint="รดน้ำ -15 · ปุ๋ย -20"
        isText
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

function Stat({ label, value, suffix, gradient, icon, ring, hint, isText, className = "" }) {
  return (
    <div
      className={`glass rounded-2xl p-4 sm:p-5 relative overflow-hidden animate-fade-up ${className}`}
    >
      {/* corner glow */}
      <div className={`pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br ${ring} blur-2xl`} />
      <div className="relative flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-plant-800/60">{label}</div>
        <div className="h-8 w-8 grid place-items-center rounded-xl bg-white/70 border border-white/80 text-plant-700 shadow-soft">
          {icon}
        </div>
      </div>
      <div className={`mt-2 flex items-baseline gap-1 ${gradient}`}>
        <span className={isText ? "text-lg sm:text-xl font-bold" : "text-3xl sm:text-4xl font-extrabold tracking-tight"}>
          {value}
        </span>
        <span className="text-xs sm:text-sm font-semibold opacity-80">{suffix}</span>
      </div>
      {hint && <div className="mt-1 text-xs text-plant-800/55">{hint}</div>}
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V11.5M5.5 6.5C5.5 5.4 6.4 4.7 7.5 4.7H8.7C9.7 4.7 10.5 5.4 10.5 6.4C10.5 7.3 9.8 8 8.8 8H7.4C6.4 8 5.5 8.7 5.5 9.7C5.5 10.6 6.3 11.3 7.4 11.3H8.5C9.6 11.3 10.5 10.6 10.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="11" cy="3" r="1.5" fill="currentColor" />
      <path d="M5 14L7 10L5.5 8L7.5 5.5L10.5 6.5L12.5 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9.5L5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ExchangeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 5H12L10 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M13 11H4L6 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

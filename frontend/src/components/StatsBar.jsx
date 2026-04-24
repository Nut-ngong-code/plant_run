export function StatsBar({ user, weekly }) {
  const totalPoints = user?.totalPoints ?? 0;
  const weeklyKm = Number(weekly?.distanceKm ?? 0).toFixed(2);
  const weeklyPts = weekly?.pointsEarned ?? 0;
  const runCount = weekly?.runCount ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
      <Stat label="แต้มสะสม" value={totalPoints} suffix="pts" accent="text-point" />
      <Stat
        label="วิ่งสัปดาห์นี้"
        value={weeklyKm}
        suffix="กม."
        accent="text-strava"
        hint={`${runCount} ครั้ง · +${weeklyPts} แต้ม`}
      />
      <Stat
        label="อัตราแลก"
        value="1 กม."
        suffix="= 10 pts"
        accent="text-plant-700"
        hint="รดน้ำ -15 · ปุ๋ย -20"
        isText
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

function Stat({ label, value, suffix, accent, hint, isText, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-plant-100 p-3 sm:p-4 ${className}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 flex items-baseline gap-1 ${accent}`}>
        <span className={isText ? "text-lg sm:text-xl font-semibold" : "text-2xl sm:text-3xl font-bold"}>
          {value}
        </span>
        <span className="text-xs sm:text-sm font-medium">{suffix}</span>
      </div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

import { useState } from "react";
import { moodFromStatus, PlantGraphic } from "./PlantGraphic.jsx";
import { MoistureGauge } from "./MoistureGauge.jsx";

const COST = { water: 15, fertilizer: 20 };

export function PlantCard({ device, totalPoints, onAction, lastSyncedAt }) {
  const [busyType, setBusyType] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const moisture = device.latestMoisture?.moisturePercent ?? null;
  const mood = moodFromStatus({ moisturePercent: moisture, totalPoints });

  const handle = async (actionType) => {
    setBusyType(actionType);
    setErrorMsg(null);
    try {
      await onAction(device.deviceId, actionType);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div className="glass rounded-3xl p-5 flex flex-col gap-4 relative overflow-hidden animate-fade-up">
      {/* soft corner accent */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-gradient-to-br from-plant-200/45 to-sage-200/40 blur-3xl" />

      <header className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-plant-800/50 font-mono truncate">
            {device.deviceId}
          </div>
          <h3 className="text-lg font-bold text-plant-900 truncate">
            {device.displayName ?? "กระถางของฉัน"}
          </h3>
        </div>
        <span
          className={`chip whitespace-nowrap ${
            device.isOnline
              ? "bg-plant-100/80 text-plant-800 border border-plant-200/60"
              : "bg-gray-100 text-gray-500 border border-gray-200"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${device.isOnline ? "bg-plant-500 animate-pulse" : "bg-gray-400"}`} />
          {device.isOnline ? "ออนไลน์" : "ออฟไลน์"}
        </span>
      </header>

      {/* plant stage */}
      <div className="relative flex items-center justify-center py-2">
        {/* soil dish shadow */}
        <div className="absolute bottom-3 h-3 w-32 rounded-full bg-plant-700/15 blur-md" />
        <PlantGraphic mood={mood} size={148} />
      </div>

      <MoistureGauge percent={moisture} />

      <div className="grid grid-cols-2 gap-2.5">
        <ActionButton
          label="รดน้ำ"
          emoji="💧"
          cost={COST.water}
          disabled={totalPoints < COST.water}
          busy={busyType === "water"}
          onClick={() => handle("water")}
          variant="water"
        />
        <ActionButton
          label="ให้ปุ๋ย"
          emoji="🌿"
          cost={COST.fertilizer}
          disabled={totalPoints < COST.fertilizer}
          busy={busyType === "fertilizer"}
          onClick={() => handle("fertilizer")}
          variant="fertilizer"
        />
      </div>

      {errorMsg && (
        <div className="text-sm text-red-700 bg-red-50/80 backdrop-blur border border-red-200 rounded-lg px-3 py-2">
          {errorMsg}
        </div>
      )}

      {lastSyncedAt && (
        <div className="text-[11px] text-plant-800/50 text-right">
          อัปเดต {new Date(lastSyncedAt).toLocaleTimeString("th-TH")}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, emoji, cost, disabled, busy, onClick, variant }) {
  const palette =
    variant === "water"
      ? "from-sky-400 to-cyan-600 shadow-glow-water"
      : "from-amber-400 to-orange-500 shadow-glow-fert";
  return (
    <button
      disabled={disabled || busy}
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl text-white font-semibold py-2.5 px-3 flex items-center justify-center gap-1.5 text-sm transition-all duration-200
        bg-gradient-to-br ${palette}
        hover:brightness-110 active:scale-[0.97]
        disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:cursor-not-allowed`}
    >
      <span className="text-base" aria-hidden>{emoji}</span>
      <span className="whitespace-nowrap">
        {label} <span className="opacity-85 text-[11px] font-medium">−{cost}</span>
      </span>
      {busy && <span className="ml-0.5 animate-pulse">…</span>}
    </button>
  );
}

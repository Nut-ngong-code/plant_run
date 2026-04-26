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
    <div className="surface relative overflow-hidden rounded-3xl p-5 flex flex-col gap-5 animate-fade-up">
      {/* corner accent follows mood */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full blur-3xl opacity-50"
        style={{
          background:
            mood === "happy"
              ? "radial-gradient(circle, #94E9B5 0%, transparent 70%)"
              : mood === "neutral"
              ? "radial-gradient(circle, #B0C7B5 0%, transparent 70%)"
              : "radial-gradient(circle, #D5DBC0 0%, transparent 70%)",
        }}
      />

      <header className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-forest-500 font-mono truncate">
            {device.deviceId}
          </div>
          <h3 className="text-lg font-bold text-forest-900 truncate font-display tracking-wide">
            {device.displayName ?? "MY POT"}
          </h3>
        </div>
        <span
          className={`chip border ${
            device.isOnline
              ? "bg-plant-100/70 text-plant-700 border-plant-300/50"
              : "bg-white/40 text-forest-400 border-white/60"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              device.isOnline
                ? "bg-plant-500 shadow-[0_0_8px_rgba(14,161,90,0.6)] animate-pulse"
                : "bg-forest-300"
            }`}
          />
          {device.isOnline ? "LIVE" : "OFFLINE"}
        </span>
      </header>

      {/* gauge wraps plant */}
      <div className="relative flex items-center justify-center pb-4 pt-1">
        <MoistureGauge percent={moisture} size={236} stroke={10}>
          <PlantGraphic mood={mood} size={138} />
        </MoistureGauge>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <ActionButton
          label="WATER"
          emoji="💧"
          cost={COST.water}
          disabled={totalPoints < COST.water}
          busy={busyType === "water"}
          onClick={() => handle("water")}
          variant="water"
        />
        <ActionButton
          label="FERTILIZE"
          emoji="🌿"
          cost={COST.fertilizer}
          disabled={totalPoints < COST.fertilizer}
          busy={busyType === "fertilizer"}
          onClick={() => handle("fertilizer")}
          variant="fertilizer"
        />
      </div>

      {errorMsg && (
        <div className="text-xs text-rose-700 bg-rose-50/80 border border-rose-200 rounded-lg px-3 py-2">
          {errorMsg}
        </div>
      )}

      {lastSyncedAt && (
        <div className="text-[10px] text-forest-400 text-right font-mono tracking-wider uppercase">
          SYNC {new Date(lastSyncedAt).toLocaleTimeString("th-TH")}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, emoji, cost, disabled, busy, onClick, variant }) {
  const styles =
    variant === "water"
      ? "from-sky2-400 to-sky2-600 shadow-glow-water hover:from-sky2-300 hover:to-sky2-500"
      : "from-sun-300 to-sun-500 shadow-glow-fert hover:from-sun-200 hover:to-sun-400";
  return (
    <button
      disabled={disabled || busy}
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl text-white font-bold uppercase tracking-[0.15em] py-3 px-3 flex items-center justify-center gap-2 text-xs transition-all duration-200
        bg-gradient-to-br ${styles}
        active:scale-[0.97]
        disabled:from-paper-300 disabled:to-paper-300 disabled:text-forest-400 disabled:shadow-none disabled:cursor-not-allowed`}
    >
      <span className="text-base" aria-hidden>
        {emoji}
      </span>
      <span className="whitespace-nowrap">{label}</span>
      <span className="font-mono text-[10px] opacity-90">−{cost}</span>
      {busy && <span className="ml-0.5 animate-pulse">…</span>}
    </button>
  );
}

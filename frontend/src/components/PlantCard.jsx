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
    <div className="bg-white rounded-2xl border border-plant-100 p-4 sm:p-5 flex flex-col gap-3 sm:gap-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-gray-400 font-mono truncate">{device.deviceId}</div>
          <h3 className="text-base sm:text-lg font-semibold truncate">
            {device.displayName ?? "กระถางของฉัน"}
          </h3>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
            device.isOnline ? "bg-plant-100 text-plant-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {device.isOnline ? "● ออนไลน์" : "○ ออฟไลน์"}
        </span>
      </header>

      <div className="flex items-center justify-center">
        <PlantGraphic mood={mood} size={140} />
      </div>

      <MoistureGauge percent={moisture} />

      <div className="grid grid-cols-2 gap-2">
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
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {errorMsg}
        </div>
      )}

      {lastSyncedAt && (
        <div className="text-xs text-gray-400 text-right">
          อัปเดต {new Date(lastSyncedAt).toLocaleTimeString("th-TH")}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, emoji, cost, disabled, busy, onClick, variant }) {
  const bg = variant === "water" ? "bg-sky-500 hover:bg-sky-600" : "bg-amber-500 hover:bg-amber-600";
  return (
    <button
      disabled={disabled || busy}
      onClick={onClick}
      className={`rounded-lg text-white font-medium py-2.5 px-2 sm:px-3 flex items-center justify-center gap-1 sm:gap-2 transition text-sm ${bg} disabled:bg-gray-300 disabled:cursor-not-allowed`}
    >
      <span>{emoji}</span>
      <span className="whitespace-nowrap">
        {label} <span className="opacity-80 text-xs">-{cost}</span>
      </span>
      {busy && <span className="animate-pulse">…</span>}
    </button>
  );
}

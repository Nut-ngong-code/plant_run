import { useState } from "react";
import { moodFromStatus, PlantGraphic } from "./PlantGraphic.jsx";
import { MoistureGauge } from "./MoistureGauge.jsx";
import { rotateDeviceToken, deleteDevice } from "../api/endpoints.js";

const COST = { water: 15, fertilizer: 20 };

export function PlantCard({ device, totalPoints, onAction, onDelete, lastSyncedAt, userId }) {
  const [busyType, setBusyType] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  // Overlay mode: idle | confirmRotate | rotating | issued | confirmDelete | deleting
  const [mode, setMode] = useState("idle");
  const [issuedToken, setIssuedToken] = useState(null);
  const [copied, setCopied] = useState(false);

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

  const confirmRotate = async () => {
    setMode("rotating");
    setErrorMsg(null);
    try {
      const r = await rotateDeviceToken(userId, device.deviceId);
      setIssuedToken(r.deviceToken);
      setMode("issued");
    } catch (e) {
      setErrorMsg(e.message);
      setMode("idle");
    }
  };

  const confirmDelete = async () => {
    setMode("deleting");
    setErrorMsg(null);
    try {
      const r = await deleteDevice(userId, device.deviceId);
      // refresh dashboard ผ่าน parent — การ์ดจะถูกถอดออกจาก list
      onDelete?.(device.deviceId, r);
    } catch (e) {
      setErrorMsg(e.message);
      setMode("idle");
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(issuedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ปล่อย — ผู้ใช้คัดลอก manual จาก textarea ได้
    }
  };

  const dismissOverlay = () => {
    setMode("idle");
    setIssuedToken(null);
    setCopied(false);
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
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMode("confirmRotate")}
            title="Rotate device token"
            className="h-7 w-7 rounded-full flex items-center justify-center text-forest-500 hover:text-forest-800 hover:bg-white/60 transition"
            aria-label="rotate token"
          >
            <KeyIcon />
          </button>
          <button
            type="button"
            onClick={() => setMode("confirmDelete")}
            title="Remove this pot"
            className="h-7 w-7 rounded-full flex items-center justify-center text-forest-500 hover:text-rose-600 hover:bg-rose-50 transition"
            aria-label="remove pot"
          >
            <TrashIcon />
          </button>
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
        </div>
      </header>

      {mode !== "idle" && (
        <CardOverlay
          mode={mode}
          token={issuedToken}
          copied={copied}
          onRotateConfirm={confirmRotate}
          onDeleteConfirm={confirmDelete}
          onCopy={copyToken}
          onDismiss={dismissOverlay}
        />
      )}

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

function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l8-8M15 8l3 3M14 9l3 3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function CardOverlay({ mode, token, copied, onRotateConfirm, onDeleteConfirm, onCopy, onDismiss }) {
  return (
    <div className="absolute inset-0 z-10 rounded-3xl bg-white/85 backdrop-blur-md flex flex-col p-5 gap-4 animate-fade-up">
      {mode === "confirmRotate" && (
        <>
          <div className="label-eyebrow text-sun-700">⚠ ROTATE DEVICE TOKEN</div>
          <p className="text-sm text-forest-700 leading-relaxed">
            ออก token ใหม่ — token เก่าใช้ไม่ได้ทันที
            <br />
            <span className="text-forest-500 text-xs">
              คุณจะต้อง re-flash firmware ของ ESP32 ด้วย token ใหม่ก่อนถึงใช้งานต่อได้
            </span>
          </p>
          <div className="mt-auto flex gap-2">
            <button onClick={onRotateConfirm} className="btn-primary flex-1">CONFIRM</button>
            <button onClick={onDismiss} className="btn-outline flex-1">CANCEL</button>
          </div>
        </>
      )}
      {mode === "rotating" && (
        <div className="m-auto label-eyebrow text-plant-600 animate-pulse">ROTATING…</div>
      )}
      {mode === "issued" && (
        <>
          <div className="label-eyebrow text-plant-700">✓ NEW TOKEN — SHOWN ONCE</div>
          <textarea
            readOnly
            value={token ?? ""}
            rows={3}
            onFocus={(e) => e.target.select()}
            className="data-input font-mono text-[11px] w-full break-all resize-none"
          />
          <button
            onClick={onCopy}
            className={`btn-outline w-full ${copied ? "text-plant-700 border-plant-400" : ""}`}
          >
            {copied ? "✓ COPIED" : "COPY TOKEN"}
          </button>
          <button onClick={onDismiss} className="btn-primary w-full mt-auto">
            I&apos;VE SAVED IT
          </button>
        </>
      )}
      {mode === "confirmDelete" && (
        <>
          <div className="label-eyebrow text-rose-700">⚠ REMOVE THIS POT</div>
          <p className="text-sm text-forest-700 leading-relaxed">
            ลบกระถางออกจากระบบ — ประวัติความชื้น/รดน้ำของกระถางนี้จะหายไปด้วย
            <br />
            <span className="text-forest-500 text-xs">
              แต้มที่หักไว้ของคำสั่งที่ยังไม่ได้รัน (pending/executing) จะถูกคืนให้
            </span>
          </p>
          <div className="mt-auto flex gap-2">
            <button
              onClick={onDeleteConfirm}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs text-white bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 active:scale-[0.97] transition"
            >
              REMOVE
            </button>
            <button onClick={onDismiss} className="btn-outline flex-1">CANCEL</button>
          </div>
        </>
      )}
      {mode === "deleting" && (
        <div className="m-auto label-eyebrow text-rose-600 animate-pulse">REMOVING…</div>
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

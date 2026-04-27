import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header.jsx";
import { GardenBackdrop } from "../components/GardenBackdrop.jsx";
import { getDashboard, registerDevice } from "../api/endpoints.js";
import { getUserId } from "../lib/session.js";

export function AddDevice() {
  const userId = getUserId();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [deviceId, setDeviceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getDashboard(userId)
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, [userId]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerDevice({
        userId,
        deviceId: deviceId.trim(),
        displayName: displayName.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate("/"), 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const valid = deviceId.trim().length > 0;

  return (
    <>
      <GardenBackdrop />
      <Header user={user} />
      <main className="max-w-xl mx-auto px-4 py-8">
        <div className="animate-fade-up">
          <span className="chip surface-flat text-forest-700">+ NEW DEVICE</span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-forest-900">
            LINK <span className="grad-text">ESP32</span>
          </h1>
          <p className="text-sm text-forest-500 mt-2">
            ดู Device ID ที่ติดบนตัวบอร์ด ESP32 แล้วกรอกลงด้านล่าง
          </p>
        </div>

        <form onSubmit={onSubmit} className="surface rounded-3xl p-6 sm:p-7 space-y-5 mt-6">
          <Field
            label="DEVICE ID"
            hint="เช่น POT-001 หรือ MAC address ของบอร์ด (ห้ามซ้ำกับผู้ใช้อื่น)"
            required
          >
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="POT-001"
              autoFocus
              className="data-input font-mono"
            />
          </Field>

          <Field label="DISPLAY NAME" hint="ตั้งชื่อเล่นก็ได้ เช่น 'กระบองเพชรน้อย'">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ต้นกระบองเพชร"
              className="data-input"
            />
          </Field>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50/70 border border-rose-200 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-plant-700 bg-plant-100/70 border border-plant-300/60 rounded-xl px-3.5 py-2.5 font-mono">
              ✓ DEVICE LINKED · returning to dashboard…
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button type="submit" disabled={!valid || submitting} className="btn-primary flex-1">
              {submitting ? "SAVING…" : "SAVE DEVICE"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-outline flex-1 sm:flex-initial sm:px-6"
            >
              CANCEL
            </button>
          </div>
        </form>

        <div className="mt-6 text-xs text-forest-500 leading-relaxed">
          <strong className="text-forest-700 font-mono uppercase tracking-wider">Note:</strong>{" "}
          ถ้า Device ID นี้เคยถูกผูกไว้ก่อนแล้ว ระบบจะย้ายมาเป็นของคุณแทน (update โดย unique key)
        </div>
      </main>
    </>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-2">
        <span className="label-eyebrow text-forest-700">
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </span>
      </div>
      {children}
      {hint && <p className="mt-2 text-xs text-forest-500">{hint}</p>}
    </label>
  );
}

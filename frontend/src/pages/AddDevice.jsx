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
      <main className="max-w-xl mx-auto px-4 py-7">
        <div className="animate-fade-up">
          <span className="chip bg-white/70 border border-white/70 text-plant-800/70">🪴 เพิ่มกระถางใหม่</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-plant-900 mt-2">
            ผูก<span className="grad-text">ESP32</span>กับสวนของคุณ
          </h1>
          <p className="text-sm text-plant-800/60 mt-1.5">
            ดู Device ID ที่ติดบนตัวบอร์ด ESP32 แล้วกรอกลงด้านล่าง
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass rounded-3xl p-6 sm:p-7 space-y-5 mt-5">
          <Field label="Device ID" hint="เช่น POT-001 หรือ MAC address ของบอร์ด (ห้ามซ้ำกับผู้ใช้อื่น)" required>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="POT-001"
              autoFocus
              className="w-full bg-white/80 border border-white/70 rounded-xl px-3.5 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-plant-300 focus:border-plant-300 transition"
            />
          </Field>

          <Field label="ชื่อกระถาง" hint="ตั้งชื่อเล่นก็ได้ เช่น 'กระบองเพชรน้อย'">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ต้นกระบองเพชร"
              className="w-full bg-white/80 border border-white/70 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-plant-300 focus:border-plant-300 transition"
            />
          </Field>

          {error && (
            <div className="text-sm text-red-700 bg-red-50/80 backdrop-blur border border-red-200 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-plant-800 bg-plant-100/80 backdrop-blur border border-plant-200 rounded-xl px-3.5 py-2.5">
              ✅ เพิ่มกระถางสำเร็จ กำลังกลับไปหน้าแดชบอร์ด…
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button type="submit" disabled={!valid || submitting} className="btn-primary flex-1">
              {submitting ? "กำลังบันทึก…" : "บันทึกกระถาง"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 sm:flex-initial sm:px-6 bg-white/70 hover:bg-white/90 border border-white/70 text-plant-800/80 rounded-xl py-2.5 transition"
            >
              ยกเลิก
            </button>
          </div>
        </form>

        <div className="mt-6 text-xs text-plant-800/50 leading-relaxed">
          <strong className="text-plant-800/70">หมายเหตุ:</strong> ถ้า Device ID นี้เคยถูกผูกไว้ก่อนแล้ว
          ระบบจะย้ายมาเป็นของคุณแทน (update โดย unique key)
        </div>
      </main>
    </>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-semibold text-plant-900">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-plant-800/50">{hint}</p>}
    </label>
  );
}

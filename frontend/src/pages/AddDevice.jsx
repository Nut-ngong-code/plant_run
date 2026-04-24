import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header.jsx";
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
      <Header user={user} />
      <main className="max-w-xl mx-auto px-4 py-6">
        <h1 className="text-xl sm:text-2xl font-bold text-plant-700 mb-1">เพิ่มกระถาง</h1>
        <p className="text-sm text-gray-500 mb-6">
          ดู Device ID ที่ติดบนตัวบอร์ด ESP32 ของกระถาง แล้วกรอกลงด้านล่าง
        </p>

        <form onSubmit={onSubmit} className="bg-white border border-plant-100 rounded-2xl p-5 sm:p-6 space-y-4">
          <Field
            label="Device ID"
            hint="เช่น POT-001 หรือ MAC address ของบอร์ด (ห้ามซ้ำกับผู้ใช้อื่น)"
            required
          >
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="POT-001"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-plant-500"
            />
          </Field>

          <Field label="ชื่อกระถาง" hint="ตั้งชื่อเล่นก็ได้ เช่น 'กระบองเพชรน้อย'">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ต้นกระบองเพชร"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-plant-500"
            />
          </Field>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-plant-700 bg-plant-100 border border-plant-500/30 rounded-md px-3 py-2">
              ✅ เพิ่มกระถางสำเร็จ กำลังกลับไปหน้าแดชบอร์ด…
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="submit"
              disabled={!valid || submitting}
              className="flex-1 bg-plant-500 hover:bg-plant-700 disabled:bg-gray-300 text-white font-medium rounded-lg py-2.5"
            >
              {submitting ? "กำลังบันทึก…" : "บันทึกกระถาง"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 sm:flex-initial sm:px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg py-2.5"
            >
              ยกเลิก
            </button>
          </div>
        </form>

        <div className="mt-6 text-xs text-gray-400 leading-relaxed">
          <strong className="text-gray-500">หมายเหตุ:</strong> ถ้า Device ID นี้เคยถูกผูกไว้ก่อนแล้ว
          ระบบจะย้ายมาเป็นของคุณแทน (update โดย unique key)
        </div>
      </main>
    </>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </label>
  );
}

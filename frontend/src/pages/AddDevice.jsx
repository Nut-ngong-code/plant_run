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
  const [issuedToken, setIssuedToken] = useState(null); // one-time device token

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
      const resp = await registerDevice({
        userId,
        deviceId: deviceId.trim(),
        displayName: displayName.trim() || undefined,
      });
      // Backend ส่งคืน { device, deviceToken } — token แสดงรอบเดียว
      setIssuedToken(resp.deviceToken);
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
        </div>

        {issuedToken ? (
          <TokenIssued
            deviceId={deviceId.trim()}
            token={issuedToken}
            onDone={() => navigate("/")}
          />
        ) : (
          <>
            <form onSubmit={onSubmit} className="surface rounded-3xl p-6 sm:p-7 space-y-5 mt-6">
              <Field
                label="DEVICE ID"
                hint="เช่น POT-001"
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
              ลงทะเบียนซ้ำจะ <strong>หมุน token ใหม่</strong> — ของเก่าใช้ไม่ได้ทันที
              (นำ token ใหม่ไปใส่ในโหมดตั้งค่าของกระถาง ไม่ต้อง flash ใหม่)
            </div>
          </>
        )}
      </main>
    </>
  );
}

function TokenIssued({ deviceId, token, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ผู้ใช้อาจอยู่ใน context ที่ clipboard ใช้ไม่ได้ (http+ไม่ใช่ localhost)
      // — ปล่อยให้คัดลอก manual จาก textarea
    }
  };

  return (
    <div className="surface-elev rounded-3xl p-6 sm:p-7 mt-6 space-y-5 animate-fade-up">
      <div className="flex items-baseline gap-2">
        <span className="chip surface-flat text-plant-700">
          <span className="h-1.5 w-1.5 rounded-full bg-plant-500 animate-pulse" />
          DEVICE LINKED
        </span>
        <span className="font-mono text-[11px] text-forest-500">{deviceId}</span>
      </div>

      <div>
        <div className="label-eyebrow text-sun-700 mb-2">⚠ DEVICE TOKEN — SHOWN ONCE</div>
        <p className="text-xs text-forest-600 mb-3 leading-relaxed">
          ระบบเก็บแค่ hash — ดูค่านี้อีกไม่ได้ ถ้าทำหายให้กด 🔑 บนการ์ดกระถางเพื่อออก token ใหม่
        </p>
        <textarea
          readOnly
          value={token}
          rows={2}
          onFocus={(e) => e.target.select()}
          className="data-input font-mono text-xs w-full break-all resize-none"
        />
        <button
          type="button"
          onClick={copy}
          className={`btn-outline mt-3 w-full ${copied ? "text-plant-700 border-plant-400" : ""}`}
        >
          {copied ? "✓ COPIED TO CLIPBOARD" : "COPY TOKEN"}
        </button>
      </div>

      <div className="rounded-2xl bg-plant-50/60 border border-plant-200/70 p-4">
        <div className="label-eyebrow text-plant-700 mb-2">📲 ติดตั้งลงกระถาง (ไม่ต้องใช้คอมพิวเตอร์/Arduino)</div>
        <ol className="text-xs text-forest-700 leading-relaxed space-y-1.5 list-decimal pl-4">
          <li>เสียบปลั๊กกระถาง — ครั้งแรกบอร์ดจะปล่อย Wi-Fi ชื่อ <code className="font-mono">PlantPot-Setup</code></li>
          <li>ใช้มือถือต่อ Wi-Fi นั้น → หน้าตั้งค่าจะเด้งขึ้นเอง (ถ้าไม่เด้ง เปิดเบราว์เซอร์ไปที่ <code className="font-mono">192.168.4.1</code>)</li>
          <li>เลือก Wi-Fi บ้าน + ใส่รหัส แล้ว<strong>วาง Token ด้านบน</strong>ลงช่อง Device Token</li>
          <li>กด “บันทึก” — กระถางจะเชื่อมต่อและพร้อมใช้งานทันที</li>
        </ol>
      </div>

      <div className="pt-2 border-t border-white/70 flex flex-col sm:flex-row gap-2">
        <button onClick={onDone} className="btn-primary flex-1">
          I&apos;VE SAVED IT — GO TO DASHBOARD
        </button>
      </div>
    </div>
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUserId } from "../lib/session.js";
import { PlantGraphic } from "../components/PlantGraphic.jsx";
import { GardenBackdrop } from "../components/GardenBackdrop.jsx";

export function Login() {
  const navigate = useNavigate();
  const [devId, setDevId] = useState("");

  const connectStrava = () => {
    window.location.href = "/api/auth/strava/login";
  };

  const devLogin = (e) => {
    e.preventDefault();
    const n = Number(devId);
    if (Number.isInteger(n) && n > 0) {
      setUserId(n);
      navigate("/");
    }
  };

  return (
    <>
      <GardenBackdrop />
      <main className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="glass-strong rounded-3xl p-7 sm:p-9 w-full max-w-md text-center relative overflow-hidden animate-fade-up">
          {/* corner gradient */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-plant-200/60 to-sun/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-44 w-44 rounded-full bg-gradient-to-tr from-sage-200/60 to-cream-100/60 blur-3xl" />

          <div className="relative">
            <div className="flex justify-center mb-3">
              <PlantGraphic mood="happy" size={120} />
            </div>
            <span className="chip bg-plant-100/80 text-plant-800 border border-plant-200/60 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-plant-500 animate-pulse" />
              วิ่ง · ปลูก · เติบโต
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-plant-900 mt-2">
              วิ่งเพื่อชีวิต<span className="grad-text">ต้นไม้</span>
            </h1>
            <p className="text-sm text-plant-800/60 mt-3 leading-relaxed">
              ทุกกิโลเมตรที่คุณวิ่ง = แต้มที่ต้นไม้รอใช้รดน้ำ<br className="hidden sm:inline" />
              เริ่มต้นด้วยการเชื่อม Strava
            </p>

            <button onClick={connectStrava} className="btn-strava w-full mt-6 flex items-center justify-center gap-2">
              <StravaMark />
              <span>เชื่อมต่อกับ Strava</span>
            </button>

            <div className="mt-7 pt-5 border-t border-white/60">
              <p className="text-xs text-plant-800/50">หรือทดสอบด้วย userId (dev mode)</p>
              <form onSubmit={devLogin} className="mt-2.5 flex flex-col xs:flex-row gap-2">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={devId}
                  onChange={(e) => setDevId(e.target.value)}
                  placeholder="เช่น 1"
                  className="flex-1 bg-white/80 border border-white/70 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-plant-300 focus:border-plant-300 transition"
                />
                <button type="submit" disabled={!devId} className="btn-primary disabled:cursor-not-allowed">
                  เข้าสู่ระบบ
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function StravaMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

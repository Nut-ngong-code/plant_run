import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUserId } from "../lib/session.js";
import { PlantGraphic } from "../components/PlantGraphic.jsx";
import { GardenBackdrop } from "../components/GardenBackdrop.jsx";

export function Login() {
  const navigate = useNavigate();
  const [devId, setDevId] = useState("");

  const connectStrava = () => {
    // Forward the actual frontend origin so the backend can redirect back to
    // the right port (Vite may be on :5173, :5174, or anywhere else).
    const returnTo = encodeURIComponent(window.location.origin);
    window.location.href = `/api/auth/strava/login?return_to=${returnTo}`;
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
        <div className="surface-elev rounded-3xl p-8 sm:p-10 w-full max-w-md text-center relative overflow-hidden animate-fade-up">
          {/* corner accents */}
          <div className="pointer-events-none absolute -top-32 -right-24 h-72 w-72 rounded-full bg-plant-200/55 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-sky2-200/55 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 -left-32 h-44 w-44 rounded-full bg-sun-100/65 blur-3xl" />

          <div className="relative">
            <div className="flex justify-center mb-2">
              <PlantGraphic mood="happy" size={120} />
            </div>
            <span className="chip surface-flat text-plant-700 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-plant-500 shadow-[0_0_8px_rgba(14,161,90,0.6)] animate-pulse" />
              RUN · GROW · REPEAT
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-forest-900 mt-3 leading-tight">
              RUN<span className="grad-text">→</span>GROW
            </h1>
            <p className="text-sm text-forest-600 mt-3 leading-relaxed">
              ทุกกิโลเมตรที่คุณวิ่ง = แต้มที่ต้นไม้รอใช้รดน้ำ
              <br className="hidden sm:inline" />
              <span className="text-forest-500">เริ่มต้นด้วยการเชื่อม Strava</span>
            </p>

            <button
              onClick={connectStrava}
              className="btn-strava w-full mt-7 flex items-center justify-center gap-2.5"
            >
              <StravaMark />
              <span>CONNECT WITH STRAVA</span>
            </button>

            <div className="mt-7 pt-6 border-t border-white/70">
              <div className="label-eyebrow mb-2.5">DEV MODE — USER ID LOGIN</div>
              <form onSubmit={devLogin} className="flex flex-col xs:flex-row gap-2">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={devId}
                  onChange={(e) => setDevId(e.target.value)}
                  placeholder="1"
                  className="data-input flex-1 font-mono text-center"
                />
                <button
                  type="submit"
                  disabled={!devId}
                  className="btn-primary disabled:cursor-not-allowed"
                >
                  ENTER
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

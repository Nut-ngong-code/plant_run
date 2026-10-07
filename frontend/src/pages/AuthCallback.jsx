import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setUserId } from "../lib/session.js";
import { getMe } from "../api/endpoints.js";
import { GardenBackdrop } from "../components/GardenBackdrop.jsx";

// Backend ออก session cookie แล้ว redirect กลับมาที่นี่ (หรือ ?error=...) → ถามว่าเป็นใครจาก /api/auth/me
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const error = params.get("error");
    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }
    getMe()
      .then((me) => {
        setUserId(me.id);
        navigate("/", { replace: true });
      })
      .catch(() => navigate("/login?error=login_failed", { replace: true }));
  }, [params, navigate]);

  return (
    <>
      <GardenBackdrop />
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="surface rounded-2xl px-6 py-5 flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-strava shadow-[0_0_10px_rgba(252,76,2,0.7)] animate-pulse" />
          <span className="font-mono text-sm text-forest-700 tracking-wider">
            CONNECTING TO STRAVA…
          </span>
        </div>
      </main>
    </>
  );
}

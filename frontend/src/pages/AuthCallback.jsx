import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setUserId } from "../lib/session.js";

// Backend redirect กลับมาพร้อม ?userId=xxx (หรือ ?error=...)
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const userId = Number(params.get("userId"));
    const error = params.get("error");
    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }
    if (Number.isInteger(userId) && userId > 0) {
      setUserId(userId);
      navigate("/", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [params, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center text-gray-500">
      กำลังเชื่อมต่อกับ Strava…
    </main>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUserId } from "../lib/session.js";
import { PlantGraphic } from "../components/PlantGraphic.jsx";

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
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl border border-plant-100 p-6 sm:p-8 w-full max-w-md text-center shadow-sm">
        <div className="flex justify-center mb-3 sm:mb-4">
          <PlantGraphic mood="happy" size={100} />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-plant-700">วิ่งเพื่อชีวิตต้นไม้</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-2 leading-relaxed">
          เข้าสู่ระบบด้วย Strava เพื่อให้ระบบดึงระยะวิ่งมาแปลงเป็นแต้ม
        </p>

        <button
          onClick={connectStrava}
          className="mt-5 sm:mt-6 w-full bg-strava hover:bg-orange-600 text-white font-semibold rounded-lg py-3 flex items-center justify-center gap-2"
        >
          <span>เชื่อมต่อกับ Strava</span>
        </button>

        <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">หรือทดสอบด้วย userId (dev mode)</p>
          <form onSubmit={devLogin} className="mt-2 flex flex-col xs:flex-row gap-2">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={devId}
              onChange={(e) => setDevId(e.target.value)}
              placeholder="เช่น 1"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-plant-500"
            />
            <button
              type="submit"
              disabled={!devId}
              className="bg-plant-500 hover:bg-plant-700 text-white text-sm rounded-lg px-4 py-2.5 xs:py-0 disabled:opacity-50"
            >
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "../components/Header.jsx";
import { StatsBar } from "../components/StatsBar.jsx";
import { PlantCard } from "../components/PlantCard.jsx";
import { RecentActions } from "../components/RecentActions.jsx";
import { GardenBackdrop } from "../components/GardenBackdrop.jsx";
import { getDashboard, sendAction, syncStrava } from "../api/endpoints.js";
import { getUserId } from "../lib/session.js";

export function Dashboard() {
  const userId = getUserId();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await getDashboard(userId);
      setData(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const handleAction = async (deviceId, actionType) => {
    const result = await sendAction({ userId, deviceId, actionType });
    setData((d) =>
      d ? { ...d, user: { ...d.user, totalPoints: result.remainingPoints } } : d,
    );
    load();
  };

  const handleSyncStrava = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncStrava(userId);
      setSyncMsg(
        r.newRuns > 0
          ? `ซิงก์สำเร็จ · +${r.earned} แต้ม จาก ${r.newRuns} กิจกรรมใหม่`
          : `ซิงก์แล้ว ไม่มีกิจกรรมใหม่ (เช็ค ${r.activitiesChecked} รายการ)`,
      );
      load();
    } catch (e) {
      setSyncMsg(`ซิงก์ล้มเหลว: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loadError && !data) {
    return (
      <>
        <GardenBackdrop />
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="glass rounded-2xl p-5 text-sm text-red-700 border border-red-200">
            โหลดข้อมูลไม่สำเร็จ: {loadError}
          </div>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <GardenBackdrop />
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-12 text-plant-800/60">
          <div className="glass rounded-2xl p-8 text-center animate-pulse">
            🌱 กำลังโหลดสวนของคุณ…
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <GardenBackdrop />
      <Header user={data.user} />
      <main className="max-w-5xl mx-auto px-4 py-5 sm:py-7 space-y-6 sm:space-y-7">
        <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-up">
          <div>
            <span className="chip bg-white/70 border border-white/70 text-plant-800/70">
              <span className="h-1.5 w-1.5 rounded-full bg-plant-500 animate-pulse" />
              สวัสดี {data.user.displayName?.split(" ")[0] ?? "นักวิ่ง"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-plant-900 mt-2">
              สวนของ<span className="grad-text">คุณ</span>วันนี้
            </h1>
            <p className="text-sm text-plant-800/60 mt-1">
              วิ่งเพื่อสะสมแต้ม นำไปแลกการรดน้ำให้เพื่อนต้นไม้
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-1.5">
            <button
              onClick={handleSyncStrava}
              disabled={syncing}
              className="btn-strava flex items-center justify-center gap-2"
            >
              <SyncIcon spinning={syncing} />
              <span>{syncing ? "กำลังซิงก์…" : "ซิงก์ Strava"}</span>
            </button>
            {syncMsg && <span className="text-xs text-plant-800/55 sm:text-right max-w-xs">{syncMsg}</span>}
          </div>
        </section>

        <StatsBar user={data.user} weekly={data.weekly} />

        <section className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold text-plant-900">
              <span aria-hidden>🪴</span> กระถางของฉัน
            </h2>
            <Link
              to="/devices/new"
              className="chip bg-white/70 border border-white/70 text-plant-800 hover:bg-white transition"
            >
              <span className="text-base leading-none">+</span> เพิ่มกระถาง
            </Link>
          </div>
          {data.devices.length === 0 ? (
            <div className="glass rounded-2xl p-7 text-center">
              <div className="text-4xl mb-2" aria-hidden>🌱</div>
              <p className="text-sm text-plant-800/70">ยังไม่มีกระถางที่ผูกกับบัญชี</p>
              <Link
                to="/devices/new"
                className="btn-primary inline-flex mt-4"
              >
                เพิ่มกระถางแรก
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.devices.map((d) => (
                <PlantCard
                  key={d.id}
                  device={d}
                  totalPoints={data.user.totalPoints}
                  onAction={handleAction}
                  lastSyncedAt={d.latestMoisture?.recordedAt}
                />
              ))}
            </div>
          )}
        </section>

        <RecentActions items={data.recentActions} />

        <footer className="pt-4 pb-8 text-center text-[11px] text-plant-800/40">
          🌿 ทุกก้าววิ่ง = ชีวิตของต้นไม้เล็กๆ
        </footer>
      </main>
    </>
  );
}

function SyncIcon({ spinning }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className={spinning ? "animate-spin" : ""}
      aria-hidden
    >
      <path d="M2.5 8C2.5 4.96 4.96 2.5 8 2.5C9.66 2.5 11.13 3.23 12.13 4.4M13.5 8C13.5 11.04 11.04 13.5 8 13.5C6.34 13.5 4.87 12.77 3.87 11.6"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.5 2L12.5 4.5L10 4.7M4.5 14L3.5 11.5L6 11.3"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

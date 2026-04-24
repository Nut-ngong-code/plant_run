import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "../components/Header.jsx";
import { StatsBar } from "../components/StatsBar.jsx";
import { PlantCard } from "../components/PlantCard.jsx";
import { RecentActions } from "../components/RecentActions.jsx";
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
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            โหลดข้อมูลไม่สำเร็จ: {loadError}
          </div>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header />
        <main className="max-w-5xl mx-auto px-4 py-8 text-gray-500">กำลังโหลด…</main>
      </>
    );
  }

  return (
    <>
      <Header user={data.user} />
      <main className="max-w-5xl mx-auto px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-plant-700">แดชบอร์ดของคุณ</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              วิ่งเพื่อสะสมแต้ม นำไปแลกการรดน้ำต้นไม้
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-1 sm:gap-2">
            <button
              onClick={handleSyncStrava}
              disabled={syncing}
              className="bg-strava hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-60 w-full sm:w-auto"
            >
              {syncing ? "กำลังซิงก์…" : "ซิงก์ Strava"}
            </button>
            {syncMsg && <span className="text-xs text-gray-500">{syncMsg}</span>}
          </div>
        </section>

        <StatsBar user={data.user} weekly={data.weekly} />

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold">กระถางของฉัน</h2>
            <Link
              to="/devices/new"
              className="text-xs sm:text-sm text-plant-700 hover:underline"
            >
              + เพิ่มกระถาง
            </Link>
          </div>
          {data.devices.length === 0 ? (
            <div className="bg-white rounded-xl border border-plant-100 p-5 sm:p-6 text-sm text-gray-500">
              ยังไม่มีกระถางที่ผูกกับบัญชี —{" "}
              <Link to="/devices/new" className="text-plant-700 underline">
                เพิ่มกระถางที่นี่
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
      </main>
    </>
  );
}

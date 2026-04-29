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

  const handleDelete = (_deviceId, _result) => {
    // หลัง delete สำเร็จ — reload dashboard ทั้ง list (refund แต้มจะ reflect ด้วย)
    load();
  };

  const handleSyncStrava = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncStrava(userId);
      setSyncMsg(
        r.newRuns > 0
          ? `+${r.earned} pts · ${r.newRuns} new activities`
          : `Up to date · checked ${r.activitiesChecked}`,
      );
      load();
    } catch (e) {
      setSyncMsg(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loadError && !data) {
    return (
      <>
        <GardenBackdrop />
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="surface rounded-2xl p-5 text-sm text-rose-700 border border-rose-200">
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
        <main className="max-w-6xl mx-auto px-4 py-12">
          <div className="surface rounded-2xl p-8 text-center animate-pulse">
            <div className="label-eyebrow text-plant-600">LOADING SESSION…</div>
          </div>
        </main>
      </>
    );
  }

  const firstName = data.user.displayName?.split(" ")[0] ?? "Runner";

  return (
    <>
      <GardenBackdrop />
      <Header user={data.user} />
      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-7">
        <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 animate-fade-up">
          <div>
            <span className="chip surface-flat text-forest-700">
              <span className="h-1.5 w-1.5 rounded-full bg-plant-500 shadow-[0_0_8px_rgba(14,161,90,0.6)] animate-pulse" />
              SESSION ACTIVE
            </span>
            <h1 className="mt-3 font-display font-bold tracking-tight text-forest-900 text-3xl sm:text-4xl leading-tight">
              READY TO RUN,
              <br className="sm:hidden" />
              <span className="grad-text"> {firstName.toUpperCase()}</span>
            </h1>
            <p className="text-sm text-forest-500 mt-2 max-w-md">
              ทุกกิโลเมตรที่คุณวิ่ง = แต้มที่ต้นไม้รอใช้รดน้ำ
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-1.5">
            <button
              onClick={handleSyncStrava}
              disabled={syncing}
              className="btn-strava flex items-center justify-center gap-2"
            >
              <SyncIcon spinning={syncing} />
              <span>{syncing ? "SYNCING…" : "SYNC STRAVA"}</span>
            </button>
            {syncMsg && (
              <span className="text-[11px] text-forest-500 sm:text-right max-w-xs font-mono">
                {syncMsg}
              </span>
            )}
          </div>
        </section>

        <StatsBar user={data.user} weekly={data.weekly} />

        <section className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-lg sm:text-xl font-bold text-forest-900 tracking-wider">
                MY POTS
              </h2>
              <span className="font-mono text-[11px] text-forest-500 tracking-wider">
                {String(data.devices.length).padStart(2, "0")} CONNECTED
              </span>
            </div>
            <Link to="/devices/new" className="btn-outline text-[11px] uppercase tracking-wider">
              + ADD POT
            </Link>
          </div>
          {data.devices.length === 0 ? (
            <div className="surface rounded-2xl p-10 text-center">
              <div className="text-4xl mb-2 opacity-70" aria-hidden>🪴</div>
              <div className="label-eyebrow text-forest-500">NO POTS LINKED</div>
              <Link to="/devices/new" className="btn-primary inline-flex mt-5">
                LINK FIRST POT
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
                  onDelete={handleDelete}
                  lastSyncedAt={d.latestMoisture?.recordedAt}
                  userId={userId}
                />
              ))}
            </div>
          )}
        </section>

        <RecentActions items={data.recentActions} />

        <footer className="pt-4 pb-8 text-center">
          <span className="font-mono text-[10px] text-forest-400 tracking-[0.3em] uppercase">
            RUN · GROW · REPEAT
          </span>
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
      <path
        d="M2.5 8C2.5 4.96 4.96 2.5 8 2.5C9.66 2.5 11.13 3.23 12.13 4.4M13.5 8C13.5 11.04 11.04 13.5 8 13.5C6.34 13.5 4.87 12.77 3.87 11.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11.5 2L12.5 4.5L10 4.7M4.5 14L3.5 11.5L6 11.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

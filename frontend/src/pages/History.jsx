import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Header } from "../components/Header.jsx";
import { GardenBackdrop } from "../components/GardenBackdrop.jsx";
import { getDashboard, getHistory, getSoilHistory } from "../api/endpoints.js";
import { getUserId } from "../lib/session.js";

const CHART_HEIGHT = 240;

export function History() {
  const userId = getUserId();
  const [dashboard, setDashboard] = useState(null);
  const [runs, setRuns] = useState([]);
  const [actions, setActions] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [soilLogs, setSoilLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, r, a] = await Promise.all([
        getDashboard(userId),
        getHistory(userId, "run", 90),
        getHistory(userId, "action", 200),
      ]);
      if (cancelled) return;
      setDashboard(d);
      setRuns(r);
      setActions(a);
      if (d.devices[0]) setSelectedDevice(d.devices[0].deviceId);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!selectedDevice) return;
    let cancelled = false;
    getSoilHistory(selectedDevice, 200).then((logs) => {
      if (!cancelled) setSoilLogs(logs);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDevice]);

  const runByDay = useMemo(() => aggregateRunsByDay(runs, 14), [runs]);
  const actionByDay = useMemo(() => aggregateActionsByDay(actions, 14), [actions]);
  const soilSeries = useMemo(
    () =>
      soilLogs.map((s) => ({
        time: new Date(s.recordedAt).getTime(),
        label: formatClock(s.recordedAt),
        moisture: s.moisturePercent,
      })),
    [soilLogs],
  );

  const totalKm = runs.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
  const totalRuns = runs.length;
  const totalWater = actions.filter((a) => a.actionType === "water").length;
  const totalFert = actions.filter((a) => a.actionType === "fertilizer").length;

  return (
    <>
      <GardenBackdrop />
      <Header user={dashboard?.user} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="animate-fade-up">
          <span className="chip surface-flat text-forest-700">📊 STATS · 14 DAYS</span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-forest-900">
            HISTORY <span className="grad-text">&amp; GROWTH</span>
          </h1>
          <p className="text-sm text-forest-500 mt-2">
            ข้อมูล 14 วันย้อนหลัง (กราฟ) + รายการทั้งหมด
          </p>
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="TOTAL DISTANCE" value={totalKm.toFixed(2)} suffix="KM" accent="strava" />
          <Stat label="RUN COUNT" value={totalRuns} suffix="RUNS" accent="plant" />
          <Stat label="WATER" value={totalWater} suffix="TIMES" accent="water" />
          <Stat label="FERTILIZE" value={totalFert} suffix="TIMES" accent="sun" />
        </div>

        {loading ? (
          <div className="surface rounded-2xl p-10 text-center animate-pulse">
            <div className="label-eyebrow text-plant-600">LOADING DATA…</div>
          </div>
        ) : (
          <>
            <ChartCard title="DISTANCE PER DAY (14d)">
              {runByDay.length === 0 ? (
                <Empty text="ยังไม่มีประวัติการวิ่ง — ซิงก์ Strava ก่อน" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <LineChart data={runByDay}>
                    <defs>
                      <linearGradient id="kmStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#FFB347" />
                        <stop offset="100%" stopColor="#FC4C02" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis unit=" km" />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(2)} km`} />
                    <Line
                      type="monotone"
                      dataKey="km"
                      stroke="url(#kmStroke)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#FC4C02" }}
                      activeDot={{ r: 5, fill: "#FFB347" }}
                      name="Distance"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="ACTIONS PER DAY (14d)">
              {actionByDay.length === 0 ? (
                <Empty text="ยังไม่มีประวัติการสั่งงาน" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={actionByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="water" name="Water" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="fertilizer" name="Fertilize" fill="#FB8C00" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="SOIL MOISTURE"
              right={
                dashboard?.devices?.length > 1 && (
                  <select
                    value={selectedDevice ?? ""}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="data-input text-sm py-1.5 px-2.5 w-auto"
                  >
                    {dashboard.devices.map((d) => (
                      <option key={d.id} value={d.deviceId} className="bg-white text-forest-900">
                        {d.displayName ?? d.deviceId}
                      </option>
                    ))}
                  </select>
                )
              }
            >
              {!selectedDevice ? (
                <Empty text="ยังไม่มีกระถาง — กดเพิ่มกระถางก่อน" />
              ) : soilSeries.length === 0 ? (
                <Empty text="ยังไม่มีข้อมูลความชื้นจากกระถางนี้" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <LineChart data={soilSeries}>
                    <defs>
                      <linearGradient id="moistureG" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#5FD491" />
                        <stop offset="100%" stopColor="#0EA5E9" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Line
                      type="monotone"
                      dataKey="moisture"
                      stroke="url(#moistureG)"
                      strokeWidth={2.5}
                      dot={false}
                      name="Moisture"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="ALL EVENTS">
              <HistoryTable runs={runs} actions={actions} />
            </ChartCard>
          </>
        )}
      </main>
    </>
  );
}

function ChartCard({ title, right, children }) {
  return (
    <section className="surface rounded-3xl p-5 sm:p-6 animate-fade-up">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="font-display text-base sm:text-lg font-bold text-forest-900 tracking-wider">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const accentMap = {
  plant: "from-plant-500 to-plant-700",
  strava: "from-sun-400 to-strava",
  water: "from-sky2-400 to-sky2-600",
  sun: "from-sun-300 to-sun-500",
};

function Stat({ label, value, suffix, accent }) {
  return (
    <div className="surface rounded-2xl p-4 animate-fade-up">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className={`stat-num text-2xl sm:text-3xl bg-gradient-to-r ${accentMap[accent]} bg-clip-text text-transparent`}
        >
          {value}
        </span>
        <span className="text-[10px] font-bold tracking-[0.15em] text-forest-500">{suffix}</span>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return <div className="h-40 flex items-center justify-center text-sm text-forest-400">{text}</div>;
}

function HistoryTable({ runs, actions }) {
  const [tab, setTab] = useState("run");
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        <TabBtn active={tab === "run"} onClick={() => setTab("run")}>
          🏃 RUNS · {runs.length}
        </TabBtn>
        <TabBtn active={tab === "action"} onClick={() => setTab("action")}>
          🌿 ACTIONS · {actions.length}
        </TabBtn>
      </div>
      {tab === "run" ? <RunList runs={runs} /> : <ActionList actions={actions} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider transition ${
        active
          ? "bg-gradient-to-r from-plant-400 to-plant-600 text-white shadow-glow-plant"
          : "surface-flat text-forest-600 hover:text-forest-900"
      }`}
    >
      {children}
    </button>
  );
}

function RunList({ runs }) {
  if (!runs.length) return <Empty text="ไม่มีรายการ" />;
  return (
    <ul className="divide-y divide-white/60 text-sm max-h-72 overflow-auto">
      {runs.map((r) => (
        <li key={r.id} className="py-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-forest-600 font-mono text-xs">{formatDate(r.runAt)}</span>
          <span className="text-forest-800 font-mono">{(r.distanceKm ?? 0).toFixed(2)} km</span>
          <span className="text-point font-bold font-mono">+{r.pointsEarned ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionList({ actions }) {
  const label = { water: "💧 WATER", fertilizer: "🌿 FERT" };
  if (!actions.length) return <Empty text="ไม่มีรายการ" />;
  return (
    <ul className="divide-y divide-white/60 text-sm max-h-72 overflow-auto">
      {actions.map((a) => (
        <li key={a.id} className="py-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-forest-700 font-bold tracking-wider text-xs">
            {label[a.actionType] ?? a.actionType}
          </span>
          <span className="text-[11px] text-forest-500 font-mono hidden sm:inline">
            {formatDate(a.createdAt)}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-point text-xs font-bold font-mono">−{a.pointsDeducted}</span>
            <StatusPill status={a.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }) {
  const style = {
    pending: "bg-white/55 text-forest-500 border-white/70",
    executing: "bg-sky2-100/70 text-sky2-600 border-sky2-300/60",
    success: "bg-plant-100/70 text-plant-700 border-plant-300/60",
    failed: "bg-rose-100/70 text-rose-700 border-rose-300/60",
  }[status];
  return (
    <span
      className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-md border uppercase ${style}`}
    >
      {status}
    </span>
  );
}

function aggregateRunsByDay(runs, days) {
  const buckets = makeBuckets(days);
  for (const r of runs) {
    const key = dayKey(r.runAt ?? r.syncedAt);
    if (buckets.has(key)) {
      const b = buckets.get(key);
      b.km += r.distanceKm ?? 0;
    }
  }
  return [...buckets.values()];
}

function aggregateActionsByDay(actions, days) {
  const buckets = makeBuckets(days, { water: 0, fertilizer: 0 });
  for (const a of actions) {
    const key = dayKey(a.createdAt);
    if (buckets.has(key) && (a.actionType === "water" || a.actionType === "fertilizer")) {
      buckets.get(key)[a.actionType] += 1;
    }
  }
  return [...buckets.values()];
}

function makeBuckets(days, extra = { km: 0 }) {
  const out = new Map();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    out.set(key, { label: `${d.getDate()}/${d.getMonth() + 1}`, date: key, ...extra });
  }
  return out;
}

function dayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

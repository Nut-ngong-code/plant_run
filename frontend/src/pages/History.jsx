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
      <main className="max-w-5xl mx-auto px-4 py-7 space-y-6">
        <section className="animate-fade-up">
          <span className="chip bg-white/70 border border-white/70 text-plant-800/70">📊 สถิติย้อนหลัง</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-plant-900 mt-2">
            ประวัติและ<span className="grad-text">การเติบโต</span>
          </h1>
          <p className="text-sm text-plant-800/60 mt-1">ข้อมูล 14 วันย้อนหลัง (กราฟ) + รายการทั้งหมด</p>
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="ระยะรวม" value={totalKm.toFixed(2)} suffix="กม." gradient="grad-text-strava" />
          <Stat label="จำนวนครั้ง" value={totalRuns} suffix="ครั้ง" gradient="grad-text" />
          <Stat label="รดน้ำ" value={totalWater} suffix="ครั้ง" gradient="grad-text" />
          <Stat label="ให้ปุ๋ย" value={totalFert} suffix="ครั้ง" gradient="grad-text-sun" />
        </div>

        {loading ? (
          <div className="glass rounded-2xl p-8 text-center text-plant-800/60 animate-pulse">
            🌱 กำลังโหลดข้อมูล…
          </div>
        ) : (
          <>
            <ChartCard title="ระยะวิ่งต่อวัน (14 วันหลังสุด)">
              {runByDay.length === 0 ? (
                <Empty text="ยังไม่มีประวัติการวิ่ง — ซิงก์ Strava ก่อน" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <LineChart data={runByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,92,66,0.08)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#475569" }} unit=" km" />
                    <Tooltip
                      formatter={(v) => `${Number(v).toFixed(2)} กม.`}
                      contentStyle={tooltipStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="km"
                      stroke="#FC4C02"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#FC4C02" }}
                      activeDot={{ r: 5 }}
                      name="ระยะ"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="จำนวนครั้งที่สั่งงานต่อวัน (14 วัน)">
              {actionByDay.length === 0 ? (
                <Empty text="ยังไม่มีประวัติการสั่งงาน" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={actionByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,92,66,0.08)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#475569" }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="water" name="รดน้ำ" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="fertilizer" name="ให้ปุ๋ย" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="ความชื้นในดิน"
              right={
                dashboard?.devices?.length > 1 && (
                  <select
                    value={selectedDevice ?? ""}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="text-sm bg-white/80 border border-white/70 rounded-lg px-2.5 py-1.5"
                  >
                    {dashboard.devices.map((d) => (
                      <option key={d.id} value={d.deviceId}>
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
                        <stop offset="0%" stopColor="#4DBC83" />
                        <stop offset="100%" stopColor="#1D9E75" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,92,66,0.08)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#475569" }} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`} contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="moisture"
                      stroke="url(#moistureG)"
                      strokeWidth={2.5}
                      dot={false}
                      name="ความชื้น"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="ประวัติทั้งหมด">
              <HistoryTable runs={runs} actions={actions} />
            </ChartCard>
          </>
        )}
      </main>
    </>
  );
}

const tooltipStyle = {
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 12,
  boxShadow: "0 8px 24px -8px rgba(15,92,66,0.18)",
  fontSize: 12,
};

function ChartCard({ title, right, children }) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-6 animate-fade-up">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-base sm:text-lg font-bold text-plant-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, suffix, gradient }) {
  return (
    <div className="glass rounded-2xl p-3.5 sm:p-4 animate-fade-up">
      <div className="text-[11px] uppercase tracking-wide text-plant-800/55 font-medium">{label}</div>
      <div className={`mt-1 flex items-baseline gap-1 ${gradient}`}>
        <span className="text-xl sm:text-2xl font-extrabold tracking-tight">{value}</span>
        <span className="text-xs sm:text-sm font-semibold opacity-80">{suffix}</span>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-plant-800/50">{text}</div>
  );
}

function HistoryTable({ runs, actions }) {
  const [tab, setTab] = useState("run");
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        <TabBtn active={tab === "run"} onClick={() => setTab("run")}>
          🏃 การวิ่ง ({runs.length})
        </TabBtn>
        <TabBtn active={tab === "action"} onClick={() => setTab("action")}>
          🌿 คำสั่ง ({actions.length})
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
      className={`px-3 py-1.5 rounded-lg text-sm transition ${
        active
          ? "bg-gradient-to-br from-plant-500 to-plant-700 text-white font-semibold shadow-glow-plant"
          : "bg-white/60 text-plant-800/70 hover:bg-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function RunList({ runs }) {
  if (!runs.length) return <Empty text="ไม่มีรายการ" />;
  return (
    <ul className="divide-y divide-white/50 text-sm max-h-72 overflow-auto">
      {runs.map((r) => (
        <li key={r.id} className="py-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-plant-800/80">{formatDate(r.runAt)}</span>
          <span className="text-plant-800/70 font-mono">{(r.distanceKm ?? 0).toFixed(2)} กม.</span>
          <span className="text-point font-bold">+{r.pointsEarned ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionList({ actions }) {
  const label = { water: "💧 รดน้ำ", fertilizer: "🌿 ให้ปุ๋ย" };
  if (!actions.length) return <Empty text="ไม่มีรายการ" />;
  return (
    <ul className="divide-y divide-white/50 text-sm max-h-72 overflow-auto">
      {actions.map((a) => (
        <li key={a.id} className="py-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-plant-800/80">{label[a.actionType] ?? a.actionType}</span>
          <span className="text-xs text-plant-800/50 hidden sm:inline">
            {formatDate(a.createdAt)}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-point text-xs font-bold">−{a.pointsDeducted}</span>
            <StatusPill status={a.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }) {
  const style = {
    pending: "bg-gray-100 text-gray-600 border-gray-200",
    executing: "bg-sky-100 text-sky-700 border-sky-200",
    success: "bg-plant-100 text-plant-800 border-plant-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  }[status];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${style}`}>{status}</span>;
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

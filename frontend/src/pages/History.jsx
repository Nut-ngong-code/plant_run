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
      <Header user={dashboard?.user} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section>
          <h1 className="text-xl sm:text-2xl font-bold text-plant-700">ประวัติและสถิติ</h1>
          <p className="text-sm text-gray-500">ข้อมูล 14 วันย้อนหลัง (ส่วนกราฟ) + รายการย้อนหลัง</p>
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="ระยะรวม" value={totalKm.toFixed(2)} suffix="กม." color="text-strava" />
          <Stat label="จำนวนครั้ง" value={totalRuns} suffix="ครั้ง" color="text-plant-700" />
          <Stat label="รดน้ำ" value={totalWater} suffix="ครั้ง" color="text-sky-600" />
          <Stat label="ให้ปุ๋ย" value={totalFert} suffix="ครั้ง" color="text-amber-600" />
        </div>

        {loading ? (
          <div className="text-gray-500">กำลังโหลด…</div>
        ) : (
          <>
            <ChartCard title="ระยะวิ่งต่อวัน (14 วันหลังสุด)">
              {runByDay.length === 0 ? (
                <Empty text="ยังไม่มีประวัติการวิ่ง — ซิงก์ Strava ก่อน" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <LineChart data={runByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" km" />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(2)} กม.`} />
                    <Line
                      type="monotone"
                      dataKey="km"
                      stroke="#FC4C02"
                      strokeWidth={2}
                      dot={{ r: 3 }}
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="water" name="รดน้ำ" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="fertilizer" name="ให้ปุ๋ย" fill="#F59E0B" radius={[4, 4, 0, 0]} />
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
                    className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Line
                      type="monotone"
                      dataKey="moisture"
                      stroke="#1D9E75"
                      strokeWidth={2}
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

function ChartCard({ title, right, children }) {
  return (
    <section className="bg-white border border-plant-100 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, suffix, color }) {
  return (
    <div className="bg-white rounded-xl border border-plant-100 p-3 sm:p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 flex items-baseline gap-1 ${color}`}>
        <span className="text-xl sm:text-2xl font-bold">{value}</span>
        <span className="text-xs sm:text-sm font-medium">{suffix}</span>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-gray-400">{text}</div>
  );
}

function HistoryTable({ runs, actions }) {
  const [tab, setTab] = useState("run");
  return (
    <div>
      <div className="flex gap-1 mb-3">
        <TabBtn active={tab === "run"} onClick={() => setTab("run")}>
          การวิ่ง ({runs.length})
        </TabBtn>
        <TabBtn active={tab === "action"} onClick={() => setTab("action")}>
          คำสั่ง ({actions.length})
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
      className={`px-3 py-1.5 rounded-md text-sm ${
        active ? "bg-plant-100 text-plant-700 font-medium" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function RunList({ runs }) {
  if (!runs.length) return <Empty text="ไม่มีรายการ" />;
  return (
    <ul className="divide-y divide-plant-100 text-sm">
      {runs.map((r) => (
        <li key={r.id} className="py-2 flex items-center justify-between gap-2">
          <span className="text-gray-700">{formatDate(r.runAt)}</span>
          <span className="text-gray-600">{(r.distanceKm ?? 0).toFixed(2)} กม.</span>
          <span className="text-point font-medium">+{r.pointsEarned ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionList({ actions }) {
  const label = { water: "💧 รดน้ำ", fertilizer: "🌿 ให้ปุ๋ย" };
  if (!actions.length) return <Empty text="ไม่มีรายการ" />;
  return (
    <ul className="divide-y divide-plant-100 text-sm">
      {actions.map((a) => (
        <li key={a.id} className="py-2 flex items-center justify-between gap-2">
          <span className="text-gray-700">{label[a.actionType] ?? a.actionType}</span>
          <span className="text-xs text-gray-400 hidden sm:inline">
            {formatDate(a.createdAt)}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-point text-xs">-{a.pointsDeducted}</span>
            <StatusPill status={a.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }) {
  const style = {
    pending: "bg-gray-100 text-gray-600",
    executing: "bg-sky-100 text-sky-700",
    success: "bg-plant-100 text-plant-700",
    failed: "bg-red-100 text-red-700",
  }[status];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${style}`}>{status}</span>;
}

// --- helpers ---

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

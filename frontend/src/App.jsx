import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./pages/Login.jsx";
import { AuthCallback } from "./pages/AuthCallback.jsx";
import { GardenBackdrop } from "./components/GardenBackdrop.jsx";
import { getUserId } from "./lib/session.js";

// Heavy / post-auth routes are loaded on demand so the login page bundle
// stays tiny. Recharts in particular (used by History) is a large dependency
// that has no business loading on the unauthenticated entry point.
const Dashboard = lazy(() =>
  import("./pages/Dashboard.jsx").then((m) => ({ default: m.Dashboard })),
);
const AddDevice = lazy(() =>
  import("./pages/AddDevice.jsx").then((m) => ({ default: m.AddDevice })),
);
const History = lazy(() =>
  import("./pages/History.jsx").then((m) => ({ default: m.History })),
);

function Protected({ children }) {
  return getUserId() ? children : <Navigate to="/login" replace />;
}

function RouteFallback() {
  return (
    <>
      <GardenBackdrop />
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="surface rounded-2xl px-6 py-5 flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-plant-500 shadow-[0_0_10px_rgba(14,161,90,0.6)] animate-pulse" />
          <span className="font-mono text-sm text-forest-700 tracking-wider">LOADING…</span>
        </div>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/"
          element={
            <Protected>
              <Suspense fallback={<RouteFallback />}>
                <Dashboard />
              </Suspense>
            </Protected>
          }
        />
        <Route
          path="/devices/new"
          element={
            <Protected>
              <Suspense fallback={<RouteFallback />}>
                <AddDevice />
              </Suspense>
            </Protected>
          }
        />
        <Route
          path="/history"
          element={
            <Protected>
              <Suspense fallback={<RouteFallback />}>
                <History />
              </Suspense>
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

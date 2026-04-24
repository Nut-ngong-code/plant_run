import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Login } from "./pages/Login.jsx";
import { AuthCallback } from "./pages/AuthCallback.jsx";
import { AddDevice } from "./pages/AddDevice.jsx";
import { History } from "./pages/History.jsx";
import { getUserId } from "./lib/session.js";

function Protected({ children }) {
  return getUserId() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/devices/new" element={<Protected><AddDevice /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "react-hot-toast";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { OfflineBanner } from "./components/OfflineBanner";
import { SessionExpiryModal } from "./components/SessionExpiryModal";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Admin from "./pages/Admin";
import AuthCallback from "./pages/AuthCallback";
import Analysis from "./pages/Analysis";
import NotFound from "./pages/NotFound";

export default function App() {
  const location = useLocation();

  return (
    <>
      <Toaster
        position="bottom-center"
        gutter={8}
        toastOptions={{
          duration: 3000,
          style: {
            background: "#141416",
            color: "#f0f0f0",
            border: "1px solid #2a2a30",
            fontSize: "13px",
            borderRadius: "8px",
            backdropFilter: "blur(20px)",
          },
          success: { iconTheme: { primary: "#00d2ff", secondary: "#141416" } },
          error: { iconTheme: { primary: "#f85149", secondary: "#141416" } },
        }}
      />
      <OfflineBanner />
      <SessionExpiryModal />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Landing />} />
          <Route path="/oauth/callback" element={<AuthCallback />} />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analysis"
            element={
              <ProtectedRoute>
                <Analysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

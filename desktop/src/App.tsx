import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { VoiceProvider } from "./contexts/VoiceContext";
import { DMProvider } from "./contexts/DMContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import "./App.css";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ServersLayout = lazy(() => import("./pages/ServersLayout").then((m) => ({ default: m.ServersLayout })));
const ServerPage = lazy(() => import("./pages/ServerPage").then((m) => ({ default: m.ServerPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const FriendsPage = lazy(() => import("./pages/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const DMPage = lazy(() => import("./pages/DMPage").then((m) => ({ default: m.DMPage })));

function RouteFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-muted)" }}>
      Carregando…
    </div>
  );
}

function AppShell() {
  return (
    <ProtectedRoute>
      <DMProvider>
        <ServersLayout />
      </DMProvider>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <VoiceProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route element={<AppShell />}>
                  <Route path="/servers/:serverId" element={<ServerPage />} />
                  <Route path="/servers" element={<ServerPage />} />
                  <Route path="/dm" element={<FriendsPage />} />
                  <Route path="/dm/:userId" element={<DMPage />} />
                </Route>
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/servers" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </VoiceProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

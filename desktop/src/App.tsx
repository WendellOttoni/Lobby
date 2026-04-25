import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { VoiceProvider } from "./contexts/VoiceContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import "./App.css";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ServersLayout = lazy(() => import("./pages/ServersLayout").then((m) => ({ default: m.ServersLayout })));
const ServerPage = lazy(() => import("./pages/ServerPage").then((m) => ({ default: m.ServerPage })));

function RouteFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-muted)" }}>
      Carregando…
    </div>
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
                <Route
                  path="/servers"
                  element={
                    <ProtectedRoute>
                      <ServersLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path=":serverId" element={<ServerPage />} />
                </Route>
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

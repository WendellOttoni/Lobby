import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { VoiceProvider } from "./contexts/VoiceContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ServersLayout } from "./pages/ServersLayout";
import { ServerPage } from "./pages/ServerPage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <VoiceProvider>
        <BrowserRouter>
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
        </BrowserRouter>
      </VoiceProvider>
    </AuthProvider>
  );
}

export default App;

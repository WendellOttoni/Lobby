import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ServersLayout } from "./pages/ServersLayout";
import { ServerPage } from "./pages/ServerPage";
import { RoomPage } from "./pages/RoomPage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
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
            <Route path=":serverId/rooms/:roomId" element={<RoomPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/servers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

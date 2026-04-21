import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <main className="room">
      <header>
        <button onClick={() => navigate("/rooms")}>← Voltar</button>
        <h1>Sala</h1>
      </header>
      <section>
        <p>Você entrou como <strong>{user?.username}</strong></p>
        <p>ID da sala: <code>{roomId}</code></p>
        <p className="placeholder">
          A conexão de voz via LiveKit será implementada no Sprint 4.
        </p>
      </section>
    </main>
  );
}

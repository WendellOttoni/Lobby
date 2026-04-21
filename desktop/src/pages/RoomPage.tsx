import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ConnectionState,
  LocalTrack,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

interface ParticipantState {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const roomRef = useRef<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !token) return;

    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    function snapshot() {
      const r = roomRef.current;
      if (!r) return;
      const list: ParticipantState[] = [];

      list.push({
        identity: r.localParticipant.identity,
        name: r.localParticipant.name ?? r.localParticipant.identity,
        isLocal: true,
        isSpeaking: r.localParticipant.isSpeaking,
        isMuted: !r.localParticipant.isMicrophoneEnabled,
      });

      r.remoteParticipants.forEach((p) => {
        const pub = p.getTrackPublication(Track.Source.Microphone);
        list.push({
          identity: p.identity,
          name: p.name ?? p.identity,
          isLocal: false,
          isSpeaking: p.isSpeaking,
          isMuted: pub?.isMuted ?? true,
        });
      });

      setParticipants(list);
    }

    function onTrackSubscribed(track: RemoteTrack) {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.volume = volume;
        document.body.appendChild(el);
      }
      snapshot();
    }

    function onTrackUnsubscribed(track: RemoteTrack) {
      if (track.kind === Track.Kind.Audio) {
        track.detach().forEach((el) => el.remove());
      }
      snapshot();
    }

    function onLocalTrackPublished(pub: { track?: LocalTrack }) {
      if (pub.track?.kind === Track.Kind.Audio) snapshot();
    }

    room
      .on(RoomEvent.ParticipantConnected, snapshot)
      .on(RoomEvent.ParticipantDisconnected, snapshot)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.TrackMuted, snapshot)
      .on(RoomEvent.TrackUnmuted, snapshot)
      .on(RoomEvent.ActiveSpeakersChanged, snapshot)
      .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (!cancelled) setConnectionState(state);
      });

    (async () => {
      try {
        const { token: lkToken, url } = await api.getRoomToken(token, roomId);
        await room.connect(url, lkToken);
        await room.localParticipant.setMicrophoneEnabled(true);

        const devices = await Room.getLocalDevices("audioinput");
        if (cancelled) return;
        setAudioDevices(devices);
        const active = room.getActiveDevice("audioinput");
        setSelectedDevice(active ?? devices[0]?.deviceId ?? "");
        snapshot();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao conectar na sala"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token]);

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const nextEnabled = isMicMuted;
      await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      setIsMicMuted(!nextEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no microfone");
    }
  }

  async function handleDeviceChange(deviceId: string) {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice("audioinput", deviceId);
      setSelectedDevice(deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao trocar microfone");
    }
  }

  function handleVolumeChange(v: number) {
    setVolume(v);
    document
      .querySelectorAll<HTMLAudioElement>("audio[data-lk-source]")
      .forEach((el) => {
        el.volume = v;
      });
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((p) => p.setVolume(v));
  }

  const connLabel: Record<ConnectionState, string> = {
    [ConnectionState.Disconnected]: "desconectado",
    [ConnectionState.Connecting]: "conectando...",
    [ConnectionState.Connected]: "conectado",
    [ConnectionState.Reconnecting]: "reconectando...",
    [ConnectionState.SignalReconnecting]: "reconectando...",
  };

  return (
    <main className="room">
      <header>
        <button onClick={() => navigate("/rooms")}>← Sair</button>
        <h1>Sala</h1>
        <span className={`conn conn-${connectionState}`}>
          {connLabel[connectionState]}
        </span>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="participants">
        <h2>Participantes ({participants.length})</h2>
        {participants.length === 0 ? (
          <p className="empty">Aguardando conexão...</p>
        ) : (
          <ul>
            {participants.map((p) => (
              <li
                key={p.identity}
                className={p.isSpeaking ? "speaking" : undefined}
              >
                <span className={`mic-state ${p.isMuted ? "muted" : "live"}`}>
                  {p.isMuted ? "mudo" : "ao vivo"}
                </span>
                <span className="name">
                  {p.name}
                  {p.isLocal && <span className="you"> (você)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="controls">
        <button
          onClick={toggleMute}
          className={`mic-toggle ${isMicMuted ? "muted" : ""}`}
          disabled={connectionState !== ConnectionState.Connected}
        >
          {isMicMuted ? "Ativar microfone" : "Silenciar microfone"}
        </button>

        <label>
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          />
        </label>

        <label>
          <span>Microfone</span>
          <select
            value={selectedDevice}
            onChange={(e) => handleDeviceChange(e.target.value)}
            disabled={audioDevices.length === 0}
          >
            {audioDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "Microfone sem nome"}
              </option>
            ))}
          </select>
        </label>
      </section>
    </main>
  );
}

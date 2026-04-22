import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalTrackPublication,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { MicMeter } from "../components/MicMeter";

interface ParticipantState {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

const AVATAR_COLORS = [
  "#5865f2", "#3ba55d", "#faa61a", "#ed4245",
  "#00b0f4", "#a660e8", "#f47b67", "#43b581",
];

function avatarBg(identity: string): string {
  let hash = 0;
  for (const c of identity) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function RoomPage() {
  const { serverId, roomId } = useParams<{ serverId: string; roomId: string }>();
  const { state: navState } = useLocation();
  const roomName: string = navState?.roomName ?? "Sala";
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
  const [localMicTrack, setLocalMicTrack] = useState<MediaStreamTrack | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roomId || !serverId || !token) return;

    let cancelled = false;
    setError(null);
    const room = new Room({ dynacast: true });
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

    function onLocalTrackPublished(pub: LocalTrackPublication) {
      if (pub.track?.kind === Track.Kind.Audio) {
        const audio = pub.track as LocalAudioTrack;
        setLocalMicTrack(audio.mediaStreamTrack);
        snapshot();
      }
    }

    function onLocalTrackUnpublished(pub: LocalTrackPublication) {
      if (pub.track?.kind === Track.Kind.Audio) {
        setLocalMicTrack(null);
        snapshot();
      }
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
      .on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (!cancelled) setConnectionState(state);
        if (state === ConnectionState.Connected && !cancelled) snapshot();
      })
      .on(RoomEvent.Disconnected, () => {
        if (cancelled) return;
        reconnectTimer.current = setTimeout(() => {
          if (!cancelled) setReconnectKey((k) => k + 1);
        }, 2000);
      });

    (async () => {
      try {
        const { token: lkToken, url } = await api.getRoomToken(token, serverId!, roomId);
        await room.connect(url, lkToken);
        if (cancelled) return;

        snapshot();

        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) return;

        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const micTrack = micPub?.track as LocalAudioTrack | undefined;
        if (micTrack) setLocalMicTrack(micTrack.mediaStreamTrack);

        const devices = await Room.getLocalDevices("audioinput");
        if (cancelled) return;
        setAudioDevices(devices);

        const saved = localStorage.getItem("lobby_mic_device");
        const preferred = saved && devices.find((d) => d.deviceId === saved);
        if (preferred) {
          await room.switchActiveDevice("audioinput", preferred.deviceId);
          setSelectedDevice(preferred.deviceId);
        } else {
          const active = room.getActiveDevice("audioinput");
          setSelectedDevice(active ?? devices[0]?.deviceId ?? "");
        }
        snapshot();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao conectar na sala");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, serverId, token, reconnectKey]);

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
      localStorage.setItem("lobby_mic_device", deviceId);
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const micTrack = micPub?.track as LocalAudioTrack | undefined;
      setLocalMicTrack(micTrack?.mediaStreamTrack ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao trocar microfone");
    }
  }

  function handleVolumeChange(v: number) {
    setVolume(v);
    document
      .querySelectorAll<HTMLAudioElement>("audio[data-lk-source]")
      .forEach((el) => { el.volume = v; });
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
        <button className="room-back-btn" onClick={() => navigate(`/servers/${serverId}`)}>
          ← Voltar
        </button>
        <h1>
          <span className="room-voice-icon">🔊</span>
          {roomName}
        </h1>
        <span className={`conn conn-${connectionState}`}>
          {connLabel[connectionState]}
        </span>
      </header>

      {error && <p className="error">{error}</p>}

      {(connectionState === ConnectionState.Reconnecting ||
        connectionState === ConnectionState.SignalReconnecting ||
        (connectionState === ConnectionState.Disconnected && reconnectKey > 0)) && (
        <p className="reconnecting">Reconectando, aguarde...</p>
      )}

      <section className="participants">
        <h2>Participantes ({participants.length})</h2>
        {participants.length === 0 ? (
          <p className="empty">Aguardando conexão...</p>
        ) : (
          <ul>
            {participants.map((p) => (
              <li key={p.identity} className={p.isSpeaking ? "speaking" : undefined}>
                <div
                  className="participant-avatar"
                  style={{ background: avatarBg(p.identity) }}
                >
                  {avatarInitials(p.name)}
                </div>
                <div className="participant-info">
                  <span className="participant-name">
                    {p.name}
                    {p.isLocal && <span className="participant-you"> (você)</span>}
                  </span>
                </div>
                <span className={`mic-state ${p.isMuted ? "muted" : "live"}`}>
                  {p.isMuted ? "mudo" : "ao vivo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="controls">
        <div className="controls-section">
          <div className="mic-level">
            <span>Microfone</span>
            <MicMeter track={localMicTrack} muted={isMicMuted} />
          </div>
          <button
            onClick={toggleMute}
            className={`mic-toggle ${isMicMuted ? "muted" : ""}`}
            disabled={connectionState !== ConnectionState.Connected}
          >
            {isMicMuted ? "🎙️ Ativar microfone" : "🔇 Silenciar microfone"}
          </button>
        </div>

        <div className="controls-section">
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
            <span>Dispositivo</span>
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
        </div>
      </section>
    </main>
  );
}

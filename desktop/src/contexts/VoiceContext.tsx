import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { notify } from "../lib/notify";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { api } from "../lib/api";

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

interface ConnectParams {
  authToken: string;
  serverId: string;
  roomId: string;
  roomName: string;
}

interface VoiceContextValue {
  activeServerId: string | null;
  activeRoomId: string | null;
  activeRoomName: string | null;
  connectionState: ConnectionState;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isPTTActive: boolean;
  isReconnecting: boolean;
  volume: number;
  audioDevices: MediaDeviceInfo[];
  selectedDevice: string;
  localMicTrack: MediaStreamTrack | null;
  error: string | null;
  nicknames: Record<string, string>;
  userVolumes: Record<string, number>;
  pttKey: string | null;
  muteKey: string | null;
  deafenKey: string | null;
  connect: (authToken: string, serverId: string, roomId: string, roomName: string) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  changeDevice: (deviceId: string) => Promise<void>;
  setVolumeAll: (v: number) => void;
  setNickname: (identity: string, name: string) => void;
  setUserVolume: (identity: string, v: number) => void;
  setPttKey: (key: string | null) => void;
  setMuteKey: (key: string | null) => void;
  setDeafenKey: (key: string | null) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

const VOLUME_KEY = "lobby_volume";
const NICKNAMES_KEY = "lobby_nicknames";
const USER_VOLUMES_KEY = "lobby_user_volumes";
const PTT_KEY_STORAGE = "lobby_ptt_key";
const MUTE_KEY_STORAGE = "lobby_mute_key";
const DEAFEN_KEY_STORAGE = "lobby_deafen_key";

const RECONNECT_DELAYS = [2000, 5000, 10000, 20000, 30000];

function loadInitialVolume(): number {
  const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const NOTIFY_JOIN_KEY = "lobby_notify_join";

export function isNotifyJoinEnabled(): boolean {
  return localStorage.getItem(NOTIFY_JOIN_KEY) !== "false";
}

export function setNotifyJoinEnabled(enabled: boolean) {
  localStorage.setItem(NOTIFY_JOIN_KEY, enabled ? "true" : "false");
}

async function notifyParticipantJoined(name: string) {
  if (!isNotifyJoinEnabled()) return;
  notify("Lobby", `${name} entrou na sala`).catch(() => {});
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const roomRef = useRef<Room | null>(null);
  const volumeRef = useRef(loadInitialVolume());
  const userWantsMutedRef = useRef(false);
  const pttActiveRef = useRef(false);
  const shouldReconnectRef = useRef(false);
  const reconnectParamsRef = useRef<ConnectParams | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const isDeafenedRef = useRef(false);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [volume, setVolumeState] = useState<number>(loadInitialVolume);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [localMicTrack, setLocalMicTrack] = useState<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pttKey, setPttKeyState] = useState<string | null>(() =>
    localStorage.getItem(PTT_KEY_STORAGE)
  );
  const [muteKey, setMuteKeyState] = useState<string | null>(() =>
    localStorage.getItem(MUTE_KEY_STORAGE)
  );
  const [deafenKey, setDeafenKeyState] = useState<string | null>(() =>
    localStorage.getItem(DEAFEN_KEY_STORAGE)
  );

  const [nicknames, setNicknamesState] = useState<Record<string, string>>(() =>
    loadJSON<Record<string, string>>(NICKNAMES_KEY, {})
  );
  const [userVolumes, setUserVolumesState] = useState<Record<string, number>>(() =>
    loadJSON<Record<string, number>>(USER_VOLUMES_KEY, {})
  );
  const userVolumesRef = useRef(userVolumes);

  // Register/unregister PTT global shortcut whenever pttKey changes
  useEffect(() => {
    if (!pttKey) return;

    let active = true;

    register(pttKey, (event) => {
      if (!active) return;
      const room = roomRef.current;
      if (!room) return;

      if (event.state === "Pressed" && !pttActiveRef.current) {
        pttActiveRef.current = true;
        setIsPTTActive(true);
        if (userWantsMutedRef.current) {
          room.localParticipant.setMicrophoneEnabled(true).then(() => setIsMuted(false));
        }
      } else if (event.state === "Released" && pttActiveRef.current) {
        pttActiveRef.current = false;
        setIsPTTActive(false);
        if (userWantsMutedRef.current) {
          room.localParticipant.setMicrophoneEnabled(false).then(() => setIsMuted(true));
        }
      }
    }).catch((e) => console.warn("[ptt] register failed:", e));

    return () => {
      active = false;
      unregister(pttKey).catch(() => {});
    };
  }, [pttKey]);

  function applyVolumeTo(p: RemoteParticipant) {
    const mult = userVolumesRef.current[p.identity] ?? 1;
    const base = isDeafenedRef.current ? 0 : volumeRef.current;
    p.setVolume(base * mult);
  }

  function snapshotRoom(room: Room) {
    const list: VoiceParticipant[] = [];
    list.push({
      identity: room.localParticipant.identity,
      name: room.localParticipant.name ?? room.localParticipant.identity,
      isLocal: true,
      isSpeaking: room.localParticipant.isSpeaking,
      isMuted: !room.localParticipant.isMicrophoneEnabled,
    });
    room.remoteParticipants.forEach((p) => {
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

  function resetState() {
    setConnectionState(ConnectionState.Disconnected);
    setParticipants([]);
    setLocalMicTrack(null);
    setActiveServerId(null);
    setActiveRoomId(null);
    setActiveRoomName(null);
    setIsMuted(false);
    setIsPTTActive(false);
    setIsReconnecting(false);
    setAudioDevices([]);
    setSelectedDevice("");
    userWantsMutedRef.current = false;
    pttActiveRef.current = false;
  }

  async function connect(authToken: string, serverId: string, roomId: string, roomName: string, isReconnectAttempt = false) {
    setError(null);

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    shouldReconnectRef.current = true;
    reconnectParamsRef.current = { authToken, serverId, roomId, roomName };
    if (!isReconnectAttempt) reconnectAttemptsRef.current = 0;

    const room = new Room({ dynacast: true });
    roomRef.current = room;

    setActiveServerId(serverId);
    setActiveRoomId(roomId);
    setActiveRoomName(roomName);
    setIsMuted(false);
    userWantsMutedRef.current = false;
    setConnectionState(ConnectionState.Connecting);

    room
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        applyVolumeTo(p);
        snapshotRoom(room);
        notifyParticipantJoined(p.name ?? p.identity);
      })
      .on(RoomEvent.ParticipantDisconnected, () => snapshotRoom(room))
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.volume = volumeRef.current;
          document.body.appendChild(el);
          applyVolumeTo(participant);
        }
        snapshotRoom(room);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
        }
        snapshotRoom(room);
      })
      .on(RoomEvent.TrackMuted, () => snapshotRoom(room))
      .on(RoomEvent.TrackUnmuted, () => snapshotRoom(room))
      .on(RoomEvent.ActiveSpeakersChanged, () => snapshotRoom(room))
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Audio) {
          setLocalMicTrack((pub.track as LocalAudioTrack).mediaStreamTrack);
          snapshotRoom(room);
        }
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Audio) {
          setLocalMicTrack(null);
          snapshotRoom(room);
        }
      })
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnectionState(state);

        if (state === ConnectionState.Connected) {
          reconnectAttemptsRef.current = 0;
          setIsReconnecting(false);
          snapshotRoom(room);
        }

        if (state === ConnectionState.Disconnected && roomRef.current === room) {
          const params = reconnectParamsRef.current;
          const attempt = reconnectAttemptsRef.current;

          if (shouldReconnectRef.current && params && attempt < RECONNECT_DELAYS.length) {
            const delay = RECONNECT_DELAYS[attempt];
            reconnectAttemptsRef.current = attempt + 1;
            setIsReconnecting(true);
            reconnectTimerRef.current = setTimeout(() => {
              if (shouldReconnectRef.current && reconnectParamsRef.current) {
                connect(params.authToken, params.serverId, params.roomId, params.roomName, true);
              }
            }, delay);
          } else {
            resetState();
          }
        }
      });

    try {
      const { token: lkToken, url } = await api.getRoomToken(authToken, serverId, roomId);
      await room.connect(url, lkToken);
      room.remoteParticipants.forEach(applyVolumeTo);
      snapshotRoom(room);
      await room.localParticipant.setMicrophoneEnabled(true);

      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track) setLocalMicTrack((micPub.track as LocalAudioTrack).mediaStreamTrack);

      const devices = await Room.getLocalDevices("audioinput");
      setAudioDevices(devices);

      const saved = localStorage.getItem("lobby_mic_device");
      const preferred = saved ? devices.find((d) => d.deviceId === saved) : null;
      if (preferred) {
        await room.switchActiveDevice("audioinput", preferred.deviceId);
        setSelectedDevice(preferred.deviceId);
      } else {
        const active = room.getActiveDevice("audioinput");
        setSelectedDevice(active ?? devices[0]?.deviceId ?? "");
      }
      snapshotRoom(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar na sala");
      resetState();
      roomRef.current = null;
      shouldReconnectRef.current = false;
      reconnectParamsRef.current = null;
    }
  }

  function disconnect() {
    shouldReconnectRef.current = false;
    reconnectParamsRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    resetState();
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = isMuted;
    await room.localParticipant.setMicrophoneEnabled(nextEnabled);
    userWantsMutedRef.current = !nextEnabled;
    setIsMuted(!nextEnabled);
  }

  async function toggleDeafen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !isDeafenedRef.current;
    isDeafenedRef.current = next;
    setIsDeafened(next);
    room.remoteParticipants.forEach(applyVolumeTo);
    if (next && !isMuted) {
      await room.localParticipant.setMicrophoneEnabled(false);
      userWantsMutedRef.current = true;
      setIsMuted(true);
    }
  }

  useEffect(() => {
    if (!muteKey) return;
    let active = true;
    register(muteKey, (event) => {
      if (!active) return;
      if (event.state !== "Pressed") return;
      if (!roomRef.current) return;
      toggleMute();
    }).catch((e) => console.warn("[mute-key] register failed:", e));
    return () => {
      active = false;
      unregister(muteKey).catch(() => {});
    };
  }, [muteKey]);

  useEffect(() => {
    if (!deafenKey) return;
    let active = true;
    register(deafenKey, (event) => {
      if (!active) return;
      if (event.state !== "Pressed") return;
      if (!roomRef.current) return;
      toggleDeafen();
    }).catch((e) => console.warn("[deafen-key] register failed:", e));
    return () => {
      active = false;
      unregister(deafenKey).catch(() => {});
    };
  }, [deafenKey]);

  async function changeDevice(deviceId: string) {
    const room = roomRef.current;
    if (!room) return;
    await room.switchActiveDevice("audioinput", deviceId);
    setSelectedDevice(deviceId);
    localStorage.setItem("lobby_mic_device", deviceId);
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    setLocalMicTrack(micPub?.track ? (micPub.track as LocalAudioTrack).mediaStreamTrack : null);
  }

  function setVolumeAll(v: number) {
    volumeRef.current = v;
    setVolumeState(v);
    localStorage.setItem(VOLUME_KEY, String(v));
    roomRef.current?.remoteParticipants.forEach(applyVolumeTo);
  }

  function setNickname(identity: string, name: string) {
    setNicknamesState((prev) => {
      const next = { ...prev };
      const trimmed = name.trim();
      if (trimmed) next[identity] = trimmed.slice(0, 32);
      else delete next[identity];
      localStorage.setItem(NICKNAMES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function setUserVolume(identity: string, v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    setUserVolumesState((prev) => {
      const next = { ...prev };
      if (clamped === 1) delete next[identity];
      else next[identity] = clamped;
      userVolumesRef.current = next;
      localStorage.setItem(USER_VOLUMES_KEY, JSON.stringify(next));
      return next;
    });
    const p = roomRef.current?.remoteParticipants.get(identity);
    if (p) p.setVolume(volumeRef.current * clamped);
  }

  function setPttKey(key: string | null) {
    if (key) localStorage.setItem(PTT_KEY_STORAGE, key);
    else localStorage.removeItem(PTT_KEY_STORAGE);
    setPttKeyState(key);
  }

  function setMuteKey(key: string | null) {
    if (key) localStorage.setItem(MUTE_KEY_STORAGE, key);
    else localStorage.removeItem(MUTE_KEY_STORAGE);
    setMuteKeyState(key);
  }

  function setDeafenKey(key: string | null) {
    if (key) localStorage.setItem(DEAFEN_KEY_STORAGE, key);
    else localStorage.removeItem(DEAFEN_KEY_STORAGE);
    setDeafenKeyState(key);
  }

  return (
    <VoiceContext.Provider value={{
      activeServerId, activeRoomId, activeRoomName,
      connectionState, participants, isMuted, isDeafened, isPTTActive, isReconnecting,
      volume, audioDevices, selectedDevice, localMicTrack, error,
      nicknames, userVolumes, pttKey, muteKey, deafenKey,
      connect, disconnect, toggleMute, toggleDeafen, changeDevice, setVolumeAll,
      setNickname, setUserVolume, setPttKey, setMuteKey, setDeafenKey,
    }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice fora do VoiceProvider");
  return ctx;
}

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import {
  ConnectionQuality,
  ConnectionState,
  LocalAudioTrack,
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  createLocalAudioTrack,
} from "livekit-client";

type ScreenShareQuality = "low" | "medium" | "high";

const SCREEN_SHARE_PRESETS = {
  low: ScreenSharePresets.h720fps5,
  medium: ScreenSharePresets.h1080fps15,
  high: ScreenSharePresets.h1080fps30,
} as const;

const SCREEN_SHARE_QUALITY_KEY = "lobby_screenshare_quality";

function loadScreenShareQuality(): ScreenShareQuality {
  const raw = localStorage.getItem(SCREEN_SHARE_QUALITY_KEY);
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "high";
}
import { notify } from "../lib/notify";
import { playJoinSound, playLeaveSound } from "../lib/sounds";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { api } from "../lib/api";

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  quality: ConnectionQuality;
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
  localQuality: ConnectionQuality;
  rtt: number | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  isScreenSharing: boolean;
  screenShareStreams: Record<string, MediaStream>;
  pausedStreams: Set<string>;
  mainStreamIdentity: string | null;
  screenShareQuality: ScreenShareQuality;
  connect: (authToken: string, serverId: string, roomId: string, roomName: string) => Promise<void>;
  connectDM: (lkToken: string, url: string, roomName: string) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleStreamPaused: (identity: string) => void;
  setScreenShareQuality: (quality: ScreenShareQuality) => Promise<void>;
  setMainStream: (identity: string) => void;
  changeDevice: (deviceId: string) => Promise<void>;
  setVolumeAll: (v: number) => void;
  setNickname: (identity: string, name: string) => void;
  setUserVolume: (identity: string, v: number) => void;
  setPttKey: (key: string | null) => void;
  setMuteKey: (key: string | null) => void;
  setDeafenKey: (key: string | null) => void;
  setNoiseSuppression: (v: boolean) => void;
  setEchoCancellation: (v: boolean) => void;
  setAutoGainControl: (v: boolean) => void;
  loadAudioDevices: () => Promise<void>;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

const VOLUME_KEY = "lobby_volume";
const NICKNAMES_KEY = "lobby_nicknames";
const USER_VOLUMES_KEY = "lobby_user_volumes";
const PTT_KEY_STORAGE = "lobby_ptt_key";
const MUTE_KEY_STORAGE = "lobby_mute_key";
const DEAFEN_KEY_STORAGE = "lobby_deafen_key";
const NOISE_SUPPRESSION_KEY = "lobby_noise_suppression";
const ECHO_CANCEL_KEY = "lobby_echo_cancel";
const AUTO_GAIN_KEY = "lobby_auto_gain";

function loadBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}

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
  const [localQuality, setLocalQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [rtt, setRtt] = useState<number | null>(null);
  const [noiseSuppression, setNoiseSuppressionState] = useState<boolean>(() => loadBool(NOISE_SUPPRESSION_KEY, true));
  const [echoCancellation, setEchoCancellationState] = useState<boolean>(() => loadBool(ECHO_CANCEL_KEY, true));
  const [autoGainControl, setAutoGainControlState] = useState<boolean>(() => loadBool(AUTO_GAIN_KEY, true));
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStreams, setScreenShareStreams] = useState<Record<string, MediaStream>>({});
  const [pausedStreams, setPausedStreams] = useState<Set<string>>(new Set());
  const [mainStreamIdentity, setMainStreamIdentity] = useState<string | null>(null);
  const [screenShareQuality, setScreenShareQualityState] = useState<ScreenShareQuality>(loadScreenShareQuality);
  const screenShareQualityRef = useRef(screenShareQuality);
  useEffect(() => { screenShareQualityRef.current = screenShareQuality; }, [screenShareQuality]);
  const screenSharePubsRef = useRef<Map<string, RemoteTrackPublication>>(new Map());
  const noiseRef = useRef(noiseSuppression);
  const echoRef = useRef(echoCancellation);
  const gainRef = useRef(autoGainControl);
  useEffect(() => { noiseRef.current = noiseSuppression; }, [noiseSuppression]);
  useEffect(() => { echoRef.current = echoCancellation; }, [echoCancellation]);
  useEffect(() => { gainRef.current = autoGainControl; }, [autoGainControl]);

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
      quality: room.localParticipant.connectionQuality,
    });
    room.remoteParticipants.forEach((p) => {
      const pub = p.getTrackPublication(Track.Source.Microphone);
      list.push({
        identity: p.identity,
        name: p.name ?? p.identity,
        isLocal: false,
        isSpeaking: p.isSpeaking,
        isMuted: pub?.isMuted ?? true,
        quality: p.connectionQuality,
      });
    });
    setParticipants(list);
    setLocalQuality(room.localParticipant.connectionQuality);
    emit("voice:update", { participants: list, roomName: room.name }).catch(() => {});
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
    setIsScreenSharing(false);
    setScreenShareStreams({});
    setPausedStreams(new Set());
    setMainStreamIdentity(null);
    screenSharePubsRef.current.clear();
    userWantsMutedRef.current = false;
    pttActiveRef.current = false;
    invoke("set_keep_awake", { enabled: false }).catch(() => {});
    invoke("hide_overlay").catch(() => {});
    emit("voice:update", { participants: [], roomName: null }).catch(() => {});
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
        playJoinSound();
      })
      .on(RoomEvent.ParticipantDisconnected, () => { snapshotRoom(room); playLeaveSound(); })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.volume = volumeRef.current;
          document.body.appendChild(el);
          applyVolumeTo(participant);
        } else if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
          const stream = track.mediaStream ?? new MediaStream([track.mediaStreamTrack]);
          screenSharePubsRef.current.set(participant.identity, pub);
          setScreenShareStreams((prev) => ({ ...prev, [participant.identity]: stream }));
          setMainStreamIdentity((prev) => prev ?? participant.identity);
        }
        snapshotRoom(room);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
        } else if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
          const id = participant.identity;
          screenSharePubsRef.current.delete(id);
          setScreenShareStreams((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setPausedStreams((prev) => { const s = new Set(prev); s.delete(id); return s; });
          setMainStreamIdentity((prev) => (prev === id ? null : prev));
        }
        snapshotRoom(room);
      })
      .on(RoomEvent.TrackMuted, () => snapshotRoom(room))
      .on(RoomEvent.TrackUnmuted, () => snapshotRoom(room))
      .on(RoomEvent.ActiveSpeakersChanged, () => snapshotRoom(room))
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
        if (participant.identity === room.localParticipant.identity) {
          setLocalQuality(quality);
        }
        snapshotRoom(room);
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Audio) {
          setLocalMicTrack((pub.track as LocalAudioTrack).mediaStreamTrack);
        } else if (pub.source === Track.Source.ScreenShare && pub.track) {
          const localId = room.localParticipant.identity;
          const stream = pub.track.mediaStream ?? new MediaStream([pub.track.mediaStreamTrack]);
          setScreenShareStreams((prev) => ({ ...prev, [localId]: stream }));
          setMainStreamIdentity((prev) => prev ?? localId);
          setIsScreenSharing(true);
        }
        snapshotRoom(room);
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Audio) {
          setLocalMicTrack(null);
        } else if (pub.source === Track.Source.ScreenShare) {
          const localId = room.localParticipant.identity;
          setIsScreenSharing(false);
          setScreenShareStreams((prev) => { const n = { ...prev }; delete n[localId]; return n; });
          setMainStreamIdentity((prev) => (prev === localId ? null : prev));
        }
        snapshotRoom(room);
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

      // Captura do mic e conexão WebRTC são independentes — rodam em paralelo
      const [localTrack] = await Promise.all([
        createLocalAudioTrack({
          noiseSuppression: noiseRef.current,
          echoCancellation: echoRef.current,
          autoGainControl: gainRef.current,
        }),
        room.connect(url, lkToken),
      ]);

      if (roomRef.current !== room) {
        localTrack.stop();
        return;
      }

      room.remoteParticipants.forEach(applyVolumeTo);
      snapshotRoom(room);

      // Publica o track já capturado + enumera devices em paralelo
      const [devices] = await Promise.all([
        Room.getLocalDevices("audioinput"),
        room.localParticipant.publishTrack(localTrack),
      ]);

      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track) setLocalMicTrack((micPub.track as LocalAudioTrack).mediaStreamTrack);

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
      invoke("set_keep_awake", { enabled: true }).catch(() => {});
      invoke("show_overlay").catch(() => {});
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

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const enabling = !pub?.track;
    try {
      if (enabling) {
        const preset = SCREEN_SHARE_PRESETS[screenShareQualityRef.current];
        await room.localParticipant.setScreenShareEnabled(
          true,
          { resolution: preset.resolution, contentHint: "motion" },
          { videoEncoding: preset.encoding }
        );
      } else {
        await room.localParticipant.setScreenShareEnabled(false);
      }
    } catch {
      // User cancelled or permission denied
    }
  }

  function toggleStreamPaused(identity: string) {
    const pub = screenSharePubsRef.current.get(identity);
    if (!pub) return;
    const next = !pub.isEnabled;
    try { pub.setEnabled(next); } catch {}
    setPausedStreams((prev) => {
      const s = new Set(prev);
      next ? s.delete(identity) : s.add(identity);
      return s;
    });
  }

  async function setScreenShareQuality(quality: ScreenShareQuality) {
    setScreenShareQualityState(quality);
    localStorage.setItem(SCREEN_SHARE_QUALITY_KEY, quality);
    const room = roomRef.current;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (!pub?.track) return;
    const preset = SCREEN_SHARE_PRESETS[quality];
    try {
      await room.localParticipant.setScreenShareEnabled(false);
      await room.localParticipant.setScreenShareEnabled(
        true,
        { resolution: preset.resolution, contentHint: "motion" },
        { videoEncoding: preset.encoding }
      );
    } catch {
      // User cancelled re-share or permission lost
    }
  }

  function setMainStream(identity: string) {
    setMainStreamIdentity(identity);
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

  useEffect(() => {
    const handle = setInterval(async () => {
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) {
        setRtt(null);
        return;
      }
      try {
        const stats = await room.engine.pcManager?.subscriber?.getStats();
        if (!stats) return;
        let rttMs: number | null = null;
        stats.forEach((report) => {
          const r = report as RTCStatsReport[keyof RTCStatsReport] & {
            type?: string;
            currentRoundTripTime?: number;
          };
          if (r.type === "candidate-pair" && typeof r.currentRoundTripTime === "number") {
            rttMs = Math.round(r.currentRoundTripTime * 1000);
          }
        });
        if (rttMs !== null) setRtt(rttMs);
      } catch {}
    }, 3000);
    return () => clearInterval(handle);
  }, []);

  async function loadAudioDevices() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      const devices = await Room.getLocalDevices("audioinput");
      setAudioDevices(devices);
      if (!selectedDevice) {
        const saved = localStorage.getItem("lobby_mic_device");
        const preferred = saved ? devices.find((d) => d.deviceId === saved) : null;
        setSelectedDevice(preferred?.deviceId ?? devices[0]?.deviceId ?? "");
      }
    } catch {}
  }

  function setNoiseSuppression(v: boolean) {
    setNoiseSuppressionState(v);
    localStorage.setItem(NOISE_SUPPRESSION_KEY, String(v));
  }

  function setEchoCancellation(v: boolean) {
    setEchoCancellationState(v);
    localStorage.setItem(ECHO_CANCEL_KEY, String(v));
  }

  function setAutoGainControl(v: boolean) {
    setAutoGainControlState(v);
    localStorage.setItem(AUTO_GAIN_KEY, String(v));
  }

  async function connectDM(lkToken: string, url: string, roomName: string) {
    setError(null);
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    shouldReconnectRef.current = false;
    reconnectParamsRef.current = null;

    const room = new Room({ dynacast: true });
    roomRef.current = room;
    setActiveServerId(null);
    setActiveRoomId(null);
    setActiveRoomName(roomName);
    setIsMuted(false);
    userWantsMutedRef.current = false;
    setConnectionState(ConnectionState.Connecting);

    room
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => { applyVolumeTo(p); snapshotRoom(room); })
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
        if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
        snapshotRoom(room);
      })
      .on(RoomEvent.TrackMuted, () => snapshotRoom(room))
      .on(RoomEvent.TrackUnmuted, () => snapshotRoom(room))
      .on(RoomEvent.ActiveSpeakersChanged, () => snapshotRoom(room))
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
        if (participant.identity === room.localParticipant.identity) setLocalQuality(quality);
        snapshotRoom(room);
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Audio) setLocalMicTrack((pub.track as LocalAudioTrack).mediaStreamTrack);
        snapshotRoom(room);
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Audio) setLocalMicTrack(null);
        snapshotRoom(room);
      })
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnectionState(state);
        if (state === ConnectionState.Connected) { setIsReconnecting(false); snapshotRoom(room); }
        if (state === ConnectionState.Disconnected && roomRef.current === room) resetState();
      });

    try {
      const [localTrack] = await Promise.all([
        createLocalAudioTrack({
          noiseSuppression: noiseRef.current,
          echoCancellation: echoRef.current,
          autoGainControl: gainRef.current,
        }),
        room.connect(url, lkToken),
      ]);

      if (roomRef.current !== room) { localTrack.stop(); return; }

      room.remoteParticipants.forEach(applyVolumeTo);
      snapshotRoom(room);

      const [devices] = await Promise.all([
        Room.getLocalDevices("audioinput"),
        room.localParticipant.publishTrack(localTrack),
      ]);

      setAudioDevices(devices);
      snapshotRoom(room);
      invoke("set_keep_awake", { enabled: true }).catch(() => {});
      invoke("show_overlay").catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar na chamada");
      resetState();
      roomRef.current = null;
    }
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
      localQuality, rtt, noiseSuppression, echoCancellation, autoGainControl,
      isScreenSharing, screenShareStreams, pausedStreams, mainStreamIdentity, screenShareQuality,
      connect, connectDM, disconnect, toggleMute, toggleDeafen, toggleScreenShare,
      toggleStreamPaused, setScreenShareQuality, setMainStream, changeDevice, setVolumeAll,
      setNickname, setUserVolume, setPttKey, setMuteKey, setDeafenKey,
      setNoiseSuppression, setEchoCancellation, setAutoGainControl, loadAudioDevices,
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

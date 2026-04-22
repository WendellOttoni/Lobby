import { createContext, useContext, useRef, useState, ReactNode } from "react";
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
import { api } from "../lib/api";

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

interface VoiceContextValue {
  activeServerId: string | null;
  activeRoomId: string | null;
  activeRoomName: string | null;
  connectionState: ConnectionState;
  participants: VoiceParticipant[];
  isMuted: boolean;
  volume: number;
  audioDevices: MediaDeviceInfo[];
  selectedDevice: string;
  localMicTrack: MediaStreamTrack | null;
  error: string | null;
  nicknames: Record<string, string>;
  userVolumes: Record<string, number>;
  connect: (authToken: string, serverId: string, roomId: string, roomName: string) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => Promise<void>;
  changeDevice: (deviceId: string) => Promise<void>;
  setVolumeAll: (v: number) => void;
  setNickname: (identity: string, name: string) => void;
  setUserVolume: (identity: string, v: number) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

const VOLUME_KEY = "lobby_volume";
const NICKNAMES_KEY = "lobby_nicknames";
const USER_VOLUMES_KEY = "lobby_user_volumes";

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

export function VoiceProvider({ children }: { children: ReactNode }) {
  const roomRef = useRef<Room | null>(null);
  const volumeRef = useRef(loadInitialVolume());

  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState<number>(loadInitialVolume);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [localMicTrack, setLocalMicTrack] = useState<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nicknames, setNicknamesState] = useState<Record<string, string>>(() =>
    loadJSON<Record<string, string>>(NICKNAMES_KEY, {})
  );
  const [userVolumes, setUserVolumesState] = useState<Record<string, number>>(() =>
    loadJSON<Record<string, number>>(USER_VOLUMES_KEY, {})
  );
  const userVolumesRef = useRef(userVolumes);

  function applyVolumeTo(p: RemoteParticipant) {
    const mult = userVolumesRef.current[p.identity] ?? 1;
    p.setVolume(volumeRef.current * mult);
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
    setAudioDevices([]);
    setSelectedDevice("");
  }

  async function connect(authToken: string, serverId: string, roomId: string, roomName: string) {
    setError(null);

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    const room = new Room({ dynacast: true });
    roomRef.current = room;

    setActiveServerId(serverId);
    setActiveRoomId(roomId);
    setActiveRoomName(roomName);
    setIsMuted(false);
    setConnectionState(ConnectionState.Connecting);

    room
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        applyVolumeTo(p);
        snapshotRoom(room);
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
        if (state === ConnectionState.Connected) snapshotRoom(room);
        if (state === ConnectionState.Disconnected && roomRef.current === room) resetState();
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
    }
  }

  function disconnect() {
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
    setIsMuted(!nextEnabled);
  }

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

  return (
    <VoiceContext.Provider value={{
      activeServerId, activeRoomId, activeRoomName,
      connectionState, participants, isMuted, volume,
      audioDevices, selectedDevice, localMicTrack, error,
      nicknames, userVolumes,
      connect, disconnect, toggleMute, changeDevice, setVolumeAll,
      setNickname, setUserVolume,
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

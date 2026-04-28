import { RoomServiceClient, TrackSource } from "livekit-server-sdk";

let client: RoomServiceClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!client) {
    client = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );
  }
  return client;
}

export async function disconnectVoiceParticipant(roomId: string, identity: string): Promise<boolean> {
  const svc = getRoomService();
  const participants = await svc.listParticipants(roomId).catch(() => []);
  if (!participants.find((p) => p.identity === identity)) return false;
  await svc.removeParticipant(roomId, identity);
  return true;
}

export async function forceMuteVoiceParticipant(roomId: string, identity: string): Promise<boolean> {
  const svc = getRoomService();
  const participants = await svc.listParticipants(roomId).catch(() => []);
  const participant = participants.find((p) => p.identity === identity);
  if (!participant) return false;
  const audioTracks = participant.tracks.filter((t) => t.source === TrackSource.MICROPHONE);
  if (audioTracks.length === 0) return false;
  await Promise.all(
    audioTracks.map((t) => svc.mutePublishedTrack(roomId, identity, t.sid, true))
  );
  return true;
}

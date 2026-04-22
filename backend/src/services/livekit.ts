import { RoomServiceClient } from "livekit-server-sdk";

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

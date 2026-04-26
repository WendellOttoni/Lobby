import { useEffect, useRef } from "react";
import { useVoice } from "../contexts/VoiceContext";

function ScreenShareVideo({ identity, stream }: { identity: string; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="screen-share-item">
      <div className="screen-share-label">{identity}</div>
      <video
        ref={videoRef}
        className="screen-share-video"
        autoPlay
        playsInline
        muted
      />
    </div>
  );
}

export function ScreenShareView() {
  const { screenShareStreams } = useVoice();
  const entries = Object.entries(screenShareStreams);

  if (entries.length === 0) return null;

  return (
    <div className="screen-share-container">
      {entries.map(([identity, stream]) => (
        <ScreenShareVideo key={identity} identity={identity} stream={stream} />
      ))}
    </div>
  );
}

import { useEffect, useRef } from "react";

interface Props {
  track: MediaStreamTrack | null;
  muted: boolean;
}

export function MicMeter({ track, muted }: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (!track || muted || track.readyState !== "live") {
      bar.style.width = "0%";
      return;
    }

    const audioCtx = new AudioContext();
    const stream = new MediaStream([track]);
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = Math.abs(buffer[i] - 128);
        if (v > peak) peak = v;
      }
      const level = Math.min(100, (peak / 128) * 100 * 1.8);
      bar.style.width = `${level}%`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      audioCtx.close();
    };
  }, [track, muted]);

  return (
    <div className="mic-meter">
      <div className="mic-meter-bar" ref={barRef} />
    </div>
  );
}

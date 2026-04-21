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

    if (!track || muted) {
      bar.style.width = "0%";
      return;
    }

    let cancelled = false;
    let raf = 0;
    const audioCtx = new AudioContext();
    const stream = new MediaStream([track]);
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = Math.abs(buffer[i] - 128);
        if (v > peak) peak = v;
      }
      const level = Math.min(100, (peak / 128) * 100 * 2.2);
      if (bar) bar.style.width = `${level}%`;
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
    };

    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(start).catch(start);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {}
      audioCtx.close().catch(() => {});
    };
  }, [track, muted]);

  return (
    <div className="mic-meter">
      <div className="mic-meter-bar" ref={barRef} />
    </div>
  );
}

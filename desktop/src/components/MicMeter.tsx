import { useEffect, useRef } from "react";

interface Props {
  track: MediaStreamTrack | null;
  muted: boolean;
}

const SEGMENTS = 20;
const GREEN_THRESHOLD = 14;
const YELLOW_THRESHOLD = 17;

export function MicMeter({ track, muted }: Props) {
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);

  function setLevel(level: number) {
    const activeCount = Math.round((level / 100) * SEGMENTS);
    segRefs.current.forEach((s, i) => {
      if (s) s.dataset.active = i < activeCount ? "true" : "false";
    });
  }

  useEffect(() => {
    setLevel(0);
    if (!track || muted) return;

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
      setLevel(Math.min(100, (peak / 128) * 100 * 2.2));
      raf = requestAnimationFrame(tick);
    };

    const start = () => { if (!cancelled) raf = requestAnimationFrame(tick); };

    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(start).catch(start);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { source.disconnect(); } catch {}
      audioCtx.close().catch(() => {});
    };
  }, [track, muted]);

  return (
    <div className="mic-meter">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          ref={(el) => { segRefs.current[i] = el; }}
          className={`mic-seg ${i < GREEN_THRESHOLD ? "seg-green" : i < YELLOW_THRESHOLD ? "seg-yellow" : "seg-red"}`}
          data-active="false"
        />
      ))}
    </div>
  );
}

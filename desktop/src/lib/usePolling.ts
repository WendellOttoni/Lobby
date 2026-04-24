import { useEffect, useRef } from "react";

/**
 * Dispara `fn` imediatamente e a cada `intervalMs`, mas pausa enquanto a
 * janela estiver oculta (document.hidden). Ao voltar a ficar visível, dispara
 * uma execução imediata para recuperar o estado.
 */
export function useVisiblePolling(
  fn: () => void | Promise<unknown>,
  intervalMs: number,
  enabled: boolean = true,
  opts: { skipFirst?: boolean } = {}
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const { skipFirst = false } = opts;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let firstStart = true;

    function run() {
      if (cancelled) return;
      Promise.resolve(fnRef.current()).catch(() => {});
    }

    function start() {
      if (timer) return;
      const skip = firstStart && skipFirst;
      firstStart = false;
      if (!skip) run();
      timer = setInterval(run, intervalMs);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

import { useState, useEffect, useRef, useCallback } from 'react';

const HEALTH_URL = '/health';
// If the health check doesn't respond within this many ms, we consider the
// dyno to be waking up (cold start).
const WAKEUP_THRESHOLD_MS = 3000;
// How long to poll during wakeup before giving up and marking as ready anyway.
const WAKEUP_TIMEOUT_MS = 60_000;
// Polling interval while we're waiting for the dyno to wake.
const WAKEUP_POLL_MS = 2000;

/**
 * useServerStatus
 *
 * Handles two concerns:
 *   1. Wakeup detection — pings /health on mount. If the dyno is cold-starting
 *      the first ping will time out; we set `waking = true` and keep polling
 *      until the server responds, then set `serverReady = true`.
 *   2. Keep-alive — when `keepAliveMs` is a positive number the hook sends a
 *      silent ping on that interval so the dyno never reaches Heroku's 30-min
 *      inactivity threshold.
 *
 * @param {number|null} keepAliveMs  Interval in ms, or null/0 to disable.
 * @returns {{ serverReady: boolean, waking: boolean }}
 */
export function useServerStatus(keepAliveMs) {
  const [serverReady, setServerReady] = useState(false);
  const [waking, setWaking]           = useState(false);

  const wakeupTimerRef    = useRef(null);
  const keepAliveTimerRef = useRef(null);
  const mountedRef        = useRef(true);

  // ── Single health ping with a timeout ────────────────────────────────────
  const ping = useCallback(async (timeoutMs = WAKEUP_THRESHOLD_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }, []);

  // ── Wakeup detection on mount ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    let giveUpTimer = null;

    const checkWakeup = async () => {
      const ok = await ping(WAKEUP_THRESHOLD_MS);
      if (!mountedRef.current) return;

      if (ok) {
        setServerReady(true);
        setWaking(false);
        return;
      }

      // Server didn't respond in time — show the wakeup banner and poll.
      setWaking(true);

      // Give-up timer: after WAKEUP_TIMEOUT_MS just mark ready so the UI
      // doesn't stay blocked forever.
      giveUpTimer = setTimeout(() => {
        if (mountedRef.current) {
          setServerReady(true);
          setWaking(false);
        }
      }, WAKEUP_TIMEOUT_MS);

      // Poll until the server answers.
      const poll = async () => {
        if (!mountedRef.current) return;
        const alive = await ping(WAKEUP_THRESHOLD_MS);
        if (!mountedRef.current) return;
        if (alive) {
          clearTimeout(giveUpTimer);
          setServerReady(true);
          setWaking(false);
        } else {
          wakeupTimerRef.current = setTimeout(poll, WAKEUP_POLL_MS);
        }
      };
      wakeupTimerRef.current = setTimeout(poll, WAKEUP_POLL_MS);
    };

    checkWakeup();

    return () => {
      mountedRef.current = false;
      clearTimeout(wakeupTimerRef.current);
      clearTimeout(giveUpTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep-alive pings ──────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(keepAliveTimerRef.current);
    if (!keepAliveMs || keepAliveMs <= 0) return;

    keepAliveTimerRef.current = setInterval(() => {
      ping(10_000).catch(() => {});
    }, keepAliveMs);

    return () => clearInterval(keepAliveTimerRef.current);
  }, [keepAliveMs, ping]);

  return { serverReady, waking };
}

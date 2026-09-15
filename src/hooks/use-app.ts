"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchSnapshot, flushOfflineQueue, manualSync, timerOp } from "@/lib/client/api";
import { onQueueChange, queuedCount } from "@/lib/client/queue";
import type { TimerAction } from "@/lib/types";

const SNAPSHOT_KEY = ["snapshot"] as const;

/** Binds the offline-outbox replay to connectivity/lifecycle events once per app. */
export function startOfflineHandler(): void {
  if (typeof window === "undefined") return;
  const started = (startOfflineHandler as unknown as { __done?: boolean }).__done;
  if (started) return;
  (startOfflineHandler as unknown as { __done?: boolean }).__done = true;
  const onOnline = (): void => {
    void flushOfflineQueue().then((n) => {
      if (n > 0) toast.success(`Synced ${n} offline change(s)`);
    });
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);
  void onOnline();
}

export function useSnapshot() {
  const qc = useQueryClient();
  const [queued, setQueued] = useState(() => queuedCount());

  useEffect(
    () =>
      onQueueChange(() => {
        setQueued(queuedCount());
        void qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });
      }),
    [qc]
  );

  return {
    ...useQuery({
      queryKey: SNAPSHOT_KEY,
      queryFn: fetchSnapshot,
      staleTime: 5_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: 2,
    }),
    queued,
  };
}

export function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: manualSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Sync failed"),
  });
}

/** Reliable timer control: POSTs an idempotent op; if the network is down the
 *  op is queued and replayed later. UI disables buttons while one is in flight. */
export function useTimerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, action, tag }: { taskId: string; action: TimerAction; tag?: string }) =>
      timerOp({ taskId, action, tag }),
    onSettled: (_data, _error, vars) => {
      void qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });
      if (_data && "queued" in _data && _data.queued) {
        toast(`Timer ${vars.action} queued — it will sync when you reconnect`);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Timer action failed"),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return { invalidate: () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY }) };
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
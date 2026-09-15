"use client";

import { useMemo } from "react";
import { Pause, Play, Square } from "lucide-react";
import { summarizeTaskTime } from "@/lib/domain/timer";
import { formatHMS } from "@/lib/time";
import type { TimeEntry, TimerAction } from "@/lib/types";
import { useNow, useTimerAction } from "@/hooks/use-app";
import { Button, Select } from "./ui";

/**
 * The one place every start/pause/resume/stop lives. State is derived from the
 * server snapshot through an idempotent API — never from a client accumulator —
 * so a refresh, crash or tab close can't desync the display from the truth.
 */
export function TimerControl({
  taskId,
  entries,
  tags = [],
  compact = false,
  disabled = false,
  onChanged,
}: {
  taskId: string;
  entries: TimeEntry[];
  tags?: string[];
  compact?: boolean;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const now = useNow(1000);
  const summary = useMemo(() => summarizeTaskTime(entries, taskId, now), [entries, taskId, now]);
  const timer = useTimerAction();
  const busy = timer.isPending || disabled;

  const run = (action: TimerAction, tag?: string) => {
    timer.mutate(
      { taskId, action, tag },
      { onSuccess: onChanged }
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="tabular-nums text-sm font-semibold text-zinc-900">
        {formatHMS(summary.totalSeconds)}
        {summary.isRunning ? <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {summary.isRunning ? (
          <>
            <Button size={compact ? "sm" : "sm"} variant="secondary" onClick={() => run("pause")} disabled={busy}>
              <Pause className="size-3.5" />
              <span className={compact ? "sr-only" : undefined}>Pause</span>
            </Button>
            <Button size="sm" variant="danger" onClick={() => run("stop")} disabled={busy}>
              <Square className="size-3.5" />
              <span className={compact ? "sr-only" : undefined}>Stop</span>
            </Button>
          </>
        ) : (
          <>
            {summary.totalSeconds > 0 ? (
              <Button size="sm" variant="secondary" onClick={() => run("resume")} disabled={busy}>
                <Play className="size-3.5" />
                Resume
              </Button>
            ) : null}
            <Button size="sm" variant="primary" onClick={() => run("start")} disabled={busy}>
              <Play className="size-3.5" />
              {summary.totalSeconds > 0 ? "Start" : "Start"}
            </Button>
          </>
        )}
        {summary.isRunning && tags.length > 0 ? (
          <Select
            className="h-8 w-auto py-1 pl-2 pr-7 text-xs"
            value=""
            onChange={(e) => e.target.value && run("switch", e.target.value)}
            disabled={busy}
            aria-label="Switch activity tag"
          >
            <option value="">Tag…</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
    </div>
  );
}
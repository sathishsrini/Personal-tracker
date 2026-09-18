"use client";

import type { Snapshot } from "@/lib/types";

export interface ProjectStats {
  tasks: number;
  tasksDone: number;
  milestones: number;
  milestonesDone: number;
}

/** Roll-up for one project. `doneNames` is hoisted by the caller so a list of projects maps the statuses once. */
export function projectStats(snap: Snapshot, projectId: string, doneNames: Set<string>): ProjectStats {
  const tasks = snap.tasks.filter((t) => t.projectId === projectId && !t.archived);
  const milestones = snap.milestones.filter((m) => m.projectId === projectId);
  return {
    tasks: tasks.length,
    tasksDone: tasks.filter((t) => doneNames.has(t.status)).length,
    milestones: milestones.length,
    milestonesDone: milestones.filter((m) => doneNames.has(m.status)).length,
  };
}

export function ProgressBar({ done, total, color }: { done: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color || "#18181b" }} />
      </div>
      <p className="mt-1 text-right text-xs tabular-nums text-zinc-400">{pct}%</p>
    </div>
  );
}

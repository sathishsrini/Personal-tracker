"use client";

import type { Snapshot } from "@/lib/types";
import { ProgressBar as Bar } from "./ui";

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

/** Count-based wrapper over the shared bar, kept so the project pages read the same as before. */
export function ProgressBar({ done, total, color }: { done: number; total: number; color?: string }) {
  return <Bar pct={total === 0 ? 0 : (done / total) * 100} showLabel color={color} className="mt-3" />;
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { setTaskStatus } from "@/lib/client/api";
import type { Snapshot, Subtask, Task } from "@/lib/types";
import { Pill, ProgressBar, Select, cn } from "./ui";
import { taskProgress } from "@/lib/derive";

function priorityColor(snap: Snapshot | undefined, name: string): string {
  return snap?.priorities.find((p) => p.name === name)?.color ?? "";
}

export function PriorityPill({ snap, priority }: { snap: Snapshot | undefined; priority: string }) {
  if (!priority) return null;
  return <Pill label={priority} color={priorityColor(snap, priority)} />;
}

export function CategoryPill({ category }: { category: string }) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{category}</span>
  );
}

/** Inline status dropdown that writes the validated transition and logs history server-side. */
export function StatusSelect({
  taskId,
  status,
  snap,
  size = "sm",
  onChanged,
}: {
  taskId: string;
  status: string;
  snap: Snapshot | undefined;
  size?: "sm" | "md";
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: string) => setTaskStatus(taskId, next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["snapshot"] });
      onChanged?.();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not change status"),
  });

  const def = snap?.statuses.find((s) => s.name === status);
  const color = def?.color ?? "#898781";
  return (
    <div className="inline-flex items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", mutation.isPending && "animate-pulse")} style={{ backgroundColor: color }} />
      <Select
        value={status}
        onChange={(e) => mutation.mutate(e.target.value)}
        disabled={mutation.isPending}
        className={cn(size === "sm" ? "h-7 w-auto py-0 pl-2 pr-7 text-xs" : "h-8 py-1 text-sm")}
        style={{ borderColor: `${color}55` }}
      >
        {snap?.statuses.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function EffortImpactTag({ effort, impact }: { effort: number | null; impact: number | null }) {
  if (effort === null && impact === null) return <span className="text-xs text-zinc-300">—</span>;
  return <span className="text-xs tabular-nums text-zinc-500">E{effort ?? "?"} · I{impact ?? "?"}</span>;
}

/**
 * The inline progress indicator for a task in a list: a thin bar plus the
 * "3/5" count it is derived from. The bar is weighted by subtask weight, the
 * count is not — so a task can read 75% while showing 1/2, which is the point.
 * `doneNames` is hoisted by the caller so a long list maps statuses once.
 */
export function TaskProgress({
  task,
  subtasks,
  snap,
  doneNames,
  className,
}: {
  task: Task;
  subtasks: Subtask[];
  snap: Snapshot;
  doneNames?: Set<string>;
  className?: string;
}) {
  const p = taskProgress(task, subtasks, snap, doneNames);
  // Nothing to say about a task with no subtasks that has not been started.
  if (p.source === "status" && p.pct === 0) return null;
  return (
    <span className={cn("inline-flex min-w-28 items-center gap-2", className)}>
      <ProgressBar pct={p.pct} size="xs" className="w-16" label={`${task.title} progress`} />
      <span className={cn("text-xs tabular-nums", p.pct >= 100 ? "text-emerald-600" : "text-zinc-400")}>
        {p.total > 0 ? `${p.done}/${p.total}` : `${p.pct}%`}
      </span>
    </span>
  );
}

/** "3/5 subtasks" — a quick-glance progress badge, shown wherever a task appears in a list or board. */
export function SubtaskBadge({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const complete = done === total;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", complete ? "text-emerald-600" : "text-zinc-400")}>
      <ListChecks className="size-3" />
      {done}/{total}
    </span>
  );
}
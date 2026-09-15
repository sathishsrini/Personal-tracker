"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useSnapshot } from "@/hooks/use-app";
import { fetchWeeklyPlan, saveWeeklyPlan, type PlanItemLike } from "@/lib/client/api";
import { addDays, formatDateLabel } from "@/lib/time";
import { currentWeekStart, isActionable, weekDates, weeklyPlanVsActual, fmtMin } from "@/lib/derive";
import type { Snapshot } from "@/lib/types";
import { Button, Card, Empty, PageShell, Select, SectionHeading, Input, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { PriorityPill } from "@/components/task-fragments";
import { HBar } from "@/components/charts";
import { useNow } from "@/hooks/use-app";

export default function WeeklyPlannerPage() {
  const snap = useSnapshot();
  const now = useNow(30_000);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const resolvedWeek = weekStart ?? (snap.data ? currentWeekStart(snap.data, now) : null);

  return (
    <PageShell
      title="Weekly Planner"
      subtitle="Allocate time to weekly tasks across the whole week."
      actions={
        resolvedWeek ? (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="secondary" onClick={() => setWeekStart(addDays(resolvedWeek, -7))} aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-40 text-center text-sm text-zinc-600">
              {formatDateLabel(resolvedWeek)} – {formatDateLabel(addDays(resolvedWeek, 6))}
            </span>
            <Button size="icon" variant="secondary" onClick={() => setWeekStart(addDays(resolvedWeek, 7))} aria-label="Next week">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null
      }
    >
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data && resolvedWeek ? <WeeklyPlannerBody snap={snap.data} weekStart={resolvedWeek} now={now} /> : null}
      </QueryState>
    </PageShell>
  );
}

function WeeklyPlannerBody({ snap, weekStart, now }: { snap: Snapshot; weekStart: string; now: number }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["weekly-plan", weekStart], queryFn: () => fetchWeeklyPlan(weekStart) });
  const [items, setItems] = useState<PlanItemLike[]>([]);
  const [taskPick, setTaskPick] = useState("");
  const [durationInput, setDurationInput] = useState("120");

  useEffect(() => {
    if (query.data) setItems(query.data.map((p) => ({ ...p })));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (next: PlanItemLike[]) => saveWeeklyPlan(weekStart, next),
    onSuccess: (saved) => {
      qc.setQueryData(["weekly-plan", weekStart], saved);
      qc.invalidateQueries({ queryKey: ["snapshot"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save weekly plan"),
  });

  const taskInfo = useMemo(() => new Map(snap.tasks.map((t) => [t.id, t])), [snap.tasks]);
  const plannedTaskIds = new Set(items.map((i) => i.taskId));
  const pickable = snap.tasks.filter((t) => isActionable(t, snap) && !plannedTaskIds.has(t.id));
  const availableMinutes = snap.settings.workdayHours * 60 * snap.settings.workDays.length;
  const plannedMinutes = items.reduce((s, i) => s + i.plannedMinutes, 0);

  const actuals = weeklyPlanVsActual(snap, weekStart, now);
  const actualByTask = new Map(actuals.map((a) => [a.taskId, a.actualSeconds]));
  const totalActualSeconds = actuals.reduce((s, a) => s + a.actualSeconds, 0);

  function persist(next: PlanItemLike[]) {
    setItems(next);
    save.mutate(next);
  }

  function addItem() {
    const minutes = Math.round(Number(durationInput) || 0);
    if (!taskPick || minutes <= 0) return;
    persist([...items, { taskId: taskPick, plannedMinutes: minutes, order: items.length }]);
    setTaskPick("");
    setDurationInput("120");
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-3 divide-x divide-zinc-100 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Available this week</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">{fmtMin(availableMinutes)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Planned</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">{fmtMin(plannedMinutes)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Tracked so far</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums", totalActualSeconds / 60 > plannedMinutes && plannedMinutes > 0 ? "text-amber-600" : "text-zinc-900")}>
              {fmtMin(Math.round(totalActualSeconds / 60))}
            </p>
          </div>
        </div>
      </Card>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {weekDates(weekStart).map((d) => (
          <span key={d} className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">
            {formatDateLabel(d, "day")} {d.slice(8)}
          </span>
        ))}
      </div>

      <Card>
        <SectionHeading title="Weekly allocations" />
        {items.length === 0 ? (
          <Empty title="No weekly tasks planned" hint="Add a task below and give it a chunk of the week." />
        ) : (
          <ul className="mb-4 divide-y divide-zinc-100">
            {items.map((item, idx) => {
              const task = taskInfo.get(item.taskId);
              const actualSeconds = actualByTask.get(item.taskId) ?? 0;
              return (
                <li key={item.id ?? idx} className="space-y-1.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      {task ? (
                        <Link href={`/tasks/${task.id}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                          {task.title}
                        </Link>
                      ) : (
                        <span className="text-sm text-zinc-400">Unknown task</span>
                      )}
                      {task ? <PriorityPill snap={snap} priority={task.priority} /> : null}
                    </div>
                    <Input
                      type="number"
                      min={15}
                      step={15}
                      defaultValue={item.plannedMinutes}
                      onBlur={(e) => persist(items.map((it, i) => (i === idx ? { ...it, plannedMinutes: Math.max(0, Number(e.target.value) || 0) } : it)))}
                      className="w-24"
                      aria-label="Planned minutes"
                    />
                    <button onClick={() => persist(items.filter((_, i) => i !== idx))} className="text-zinc-300 hover:text-red-500" aria-label="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <HBar label="Actual" value={actualSeconds} max={Math.max(item.plannedMinutes * 60, actualSeconds, 1)} color={actualSeconds > item.plannedMinutes * 60 ? "#d03b3b" : "#2a78d6"} />
                </li>
              );
            })}
          </ul>
        )}

        <form
          className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            addItem();
          }}
        >
          <Select value={taskPick} onChange={(e) => setTaskPick(e.target.value)} className="min-w-48 flex-1">
            <option value="">Pick a task…</option>
            {pickable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
          <Input type="number" min={15} step={15} value={durationInput} onChange={(e) => setDurationInput(e.target.value)} className="w-24" aria-label="Minutes" />
          <Button type="submit" variant="primary" disabled={!taskPick}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      </Card>
    </div>
  );
}

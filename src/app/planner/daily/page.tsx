"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, MoveRight, Plus, Trash2 } from "lucide-react";
import { useSnapshot } from "@/hooks/use-app";
import { fetchDailyPlan, saveDailyPlan, carryForward, type PlanItemLike } from "@/lib/client/api";
import { summarizePlan } from "@/lib/domain/plan";
import { entrySeconds } from "@/lib/domain/timer";
import { addDays, dateKey, formatDateLabel, formatHM, formatHMS } from "@/lib/time";
import { isActionable } from "@/lib/derive";
import type { Snapshot } from "@/lib/types";
import { Button, Card, Empty, PageShell, Select, SectionHeading, Input, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { PriorityPill } from "@/components/task-fragments";
import { TimerControl } from "@/components/timer-control";

export default function DailyPlannerPage() {
  const snap = useSnapshot();
  const [date, setDate] = useState(dateKey());

  return (
    <PageShell
      title="Daily Planner"
      subtitle="Allocate your workday. Give two tasks the same group to plan them concurrently."
      actions={<DateNav date={date} onChange={setDate} />}
    >
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data ? <DailyPlannerBody snap={snap.data} date={date} /> : null}
      </QueryState>
    </PageShell>
  );
}

function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="secondary" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
        <ChevronLeft className="size-4" />
      </Button>
      <Input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-40" />
      <Button size="icon" variant="secondary" onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
        <ChevronRight className="size-4" />
      </Button>
      {date !== dateKey() ? (
        <Button size="sm" variant="ghost" onClick={() => onChange(dateKey())}>
          Today
        </Button>
      ) : null}
    </div>
  );
}

function DailyPlannerBody({ snap, date }: { snap: Snapshot; date: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["daily-plan", date], queryFn: () => fetchDailyPlan(date) });
  const [items, setItems] = useState<PlanItemLike[]>([]);
  const [taskPick, setTaskPick] = useState("");
  const [durationInput, setDurationInput] = useState("60");
  const [groupInput, setGroupInput] = useState("");

  useEffect(() => {
    if (query.data) setItems(query.data.map((p) => ({ ...p })));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (next: PlanItemLike[]) => saveDailyPlan(date, next),
    onSuccess: (saved) => {
      qc.setQueryData(["daily-plan", date], saved);
      qc.invalidateQueries({ queryKey: ["snapshot"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save plan"),
  });

  const carryMutation = useMutation({
    mutationFn: () => carryForward(snap.carry.filter((c) => c.targetDate === date)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-plan", date] });
      qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast.success("Carried into today");
    },
  });

  const taskInfo = useMemo(() => new Map(snap.tasks.map((t) => [t.id, t])), [snap.tasks]);
  const plannedTaskIds = new Set(items.map((i) => i.taskId));
  const pickable = snap.tasks.filter((t) => isActionable(t, snap) && !plannedTaskIds.has(t.id));
  const summary = summarizePlan(
    items.map((i, idx) => ({
      id: i.id ?? `draft-${idx}`,
      date,
      taskId: i.taskId,
      subtaskId: i.subtaskId ?? "",
      plannedMinutes: i.plannedMinutes,
      parallelGroup: i.parallelGroup ?? "",
      order: i.order ?? idx,
      carriedFrom: i.carriedFrom ?? "",
      notes: i.notes ?? "",
      createdAt: "",
      updatedAt: "",
    })),
    snap.settings.workdayHours * 60
  );
  const carrySuggestions = snap.carry.filter((c) => c.targetDate === date && !plannedTaskIds.has(c.taskId));
  const now = Date.now();

  function persist(next: PlanItemLike[]) {
    setItems(next);
    save.mutate(next);
  }

  function addItem() {
    const minutes = Math.round(Number(durationInput) || 0);
    if (!taskPick || minutes <= 0) return;
    persist([...items, { taskId: taskPick, plannedMinutes: minutes, parallelGroup: groupInput.trim(), order: items.length }]);
    setTaskPick("");
    setDurationInput("60");
    setGroupInput("");
  }

  function updateItem(idx: number, patch: Partial<PlanItemLike>) {
    persist(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    persist(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-3 divide-x divide-zinc-100 text-center sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Available</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">{formatHMS(summary.availableMinutes * 60)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Planned</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">{formatHMS(summary.plannedMinutes * 60)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Remaining</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums", summary.overAllocated ? "text-red-600" : "text-zinc-900")}>
              {summary.overAllocated ? `-${formatHMS(summary.overByMinutes * 60)}` : formatHMS(summary.remainingMinutes * 60)}
            </p>
          </div>
        </div>
        {summary.overAllocated ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            Planned time exceeds today's available hours by {formatHM(summary.overByMinutes * 60)}.
          </div>
        ) : null}
      </Card>

      {carrySuggestions.length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">{carrySuggestions.length} unfinished task(s) from yesterday can carry into this day.</p>
          <Button size="sm" onClick={() => carryMutation.mutate()} loading={carryMutation.isPending}>
            <MoveRight className="size-3.5" /> Carry forward
          </Button>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title={`Plan for ${formatDateLabel(date, "long")}`} />
        {items.length === 0 ? (
          <Empty title="Nothing planned yet" hint="Pick a task below and give it a slice of your day." />
        ) : (
          <ul className="mb-4 divide-y divide-zinc-100">
            {items.map((item, idx) => {
              const task = taskInfo.get(item.taskId);
              const tracked = snap.entries
                .filter((e) => e.taskId === item.taskId && e.date === date)
                .reduce((s, e) => s + entrySeconds(e, now), 0);
              return (
                <li key={item.id ?? idx} className="flex flex-wrap items-center gap-2.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    {task ? (
                      <Link href={`/tasks/${task.id}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                        {task.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-zinc-400">Unknown task</span>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {task ? <PriorityPill snap={snap} priority={task.priority} /> : null}
                      <span className="text-xs tabular-nums text-zinc-400">tracked {formatHM(tracked)}</span>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    defaultValue={item.plannedMinutes}
                    onBlur={(e) => updateItem(idx, { plannedMinutes: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20"
                    aria-label="Planned minutes"
                  />
                  <Input
                    defaultValue={item.parallelGroup ?? ""}
                    onBlur={(e) => updateItem(idx, { parallelGroup: e.target.value.trim() })}
                    placeholder="Group (concurrent)"
                    className="w-36"
                    aria-label="Parallel group"
                  />
                  {task ? <TimerControl taskId={task.id} entries={snap.entries.filter((e) => e.taskId === task.id)} tags={snap.tags.map((t) => t.name)} compact /> : null}
                  <button onClick={() => removeItem(idx)} className="text-zinc-300 hover:text-red-500" aria-label="Remove from plan">
                    <Trash2 className="size-4" />
                  </button>
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
          <Input type="number" min={5} step={5} value={durationInput} onChange={(e) => setDurationInput(e.target.value)} className="w-24" aria-label="Minutes" />
          <Input value={groupInput} onChange={(e) => setGroupInput(e.target.value)} placeholder="Group (optional)" className="w-40" />
          <Button type="submit" variant="primary" disabled={!taskPick}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      </Card>
    </div>
  );
}

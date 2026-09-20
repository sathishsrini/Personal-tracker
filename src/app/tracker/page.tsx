"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useSnapshot, useNow, useTimerAction } from "@/hooks/use-app";
import { createManualEntry, deleteManualEntry, updateManualEntry } from "@/lib/client/api";
import { summarizeTaskTime } from "@/lib/domain/timer";
import { tagTotals, todayKey, isActionable } from "@/lib/derive";
import { formatHMS, toDateTimeLocalInput } from "@/lib/time";
import type { Snapshot, Task, TimeEntry } from "@/lib/types";
import { Button, Card, Empty, Field, Input, PageShell, Pill, Select, SectionHeading, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { HBar } from "@/components/charts";
import { TimerControl } from "@/components/timer-control";

export default function TrackerPage() {
  const snap = useSnapshot();
  return (
    <PageShell title="Time Tracker" subtitle="Every running timer, quick-start, and manual corrections in one place.">
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data ? <TrackerBody snap={snap.data} /> : null}
      </QueryState>
    </PageShell>
  );
}

function TrackerBody({ snap }: { snap: Snapshot }) {
  const now = useNow(1000);
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["snapshot"] });
  const today = todayKey();

  const taskInfo = useMemo(() => new Map(snap.tasks.map((t) => [t.id, t])), [snap.tasks]);
  const runningTaskIds = [...new Set(snap.entries.filter((e) => e.checkOut === null).map((e) => e.taskId))];
  const runningTasks = runningTaskIds.map((id) => taskInfo.get(id)).filter((t): t is Task => Boolean(t));
  const tags = tagTotals(snap.entries, today, now);
  const recent = [...snap.entries].sort((a, b) => b.checkIn - a.checkIn).slice(0, 30);

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeading title={`Running now (${runningTasks.length})`} />
        {runningTasks.length === 0 ? (
          <Empty title="No timers running" hint="Start one below or from any task." />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {runningTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 hover:underline">
                  {t.title}
                </Link>
                <TimerControl taskId={t.id} entries={snap.entries.filter((e) => e.taskId === t.id)} tags={snap.tags.map((x) => x.name)} onChanged={invalidate} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <QuickStart snap={snap} runningTaskIds={new Set(runningTaskIds)} onChanged={invalidate} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeading title="Recent entries" />
          {recent.length === 0 ? (
            <Empty title="No time tracked yet" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recent.map((e) => (
                <RecentEntryRow key={e.id} entry={e} task={taskInfo.get(e.taskId)} now={now} onChanged={invalidate} />
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <SectionHeading title="Time by tag · today" />
          {tags.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">No tracked time yet.</p>
          ) : (
            <div className="space-y-2.5">
              {tags.map((t) => (
                <HBar key={t.tag} label={t.tag} value={t.seconds} max={tags[0].seconds} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <ManualEntryCard snap={snap} onChanged={invalidate} />
    </div>
  );
}

function QuickStart({ snap, runningTaskIds, onChanged }: { snap: Snapshot; runningTaskIds: Set<string>; onChanged: () => void }) {
  const [taskId, setTaskId] = useState("");
  const timer = useTimerAction();
  const pickable = snap.tasks.filter((t) => isActionable(t, snap) && !runningTaskIds.has(t.id));

  return (
    <Card>
      <SectionHeading title="Quick start" />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!taskId) return;
          timer.mutate({ taskId, action: "start" }, { onSuccess: onChanged });
          setTaskId("");
        }}
      >
        <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="min-w-56 flex-1">
          <option value="">Pick a task to start…</option>
          {pickable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary" disabled={!taskId} loading={timer.isPending}>
          <Play className="size-4" /> Start
        </Button>
      </form>
    </Card>
  );
}

function RecentEntryRow({ entry, task, now, onChanged }: { entry: TimeEntry; task: Task | undefined; now: number; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteManualEntry(entry.id),
    onSuccess: onChanged,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete entry"),
  });
  const open = entry.checkOut === null;
  const seconds = open ? Math.max(0, Math.round((now - entry.checkIn) / 1000)) : entry.durationSeconds;

  if (editing) {
    return (
      <li className="py-2.5">
        <ManualEntryForm
          snap={undefined}
          fixedTaskId={entry.taskId}
          entry={entry}
          tags={[entry.tag]}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
      <span className="w-16 shrink-0 text-xs text-zinc-400">{entry.date.slice(5)}</span>
      {task ? (
        <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate font-medium text-zinc-900 hover:underline">
          {task.title}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-zinc-400">Unknown task</span>
      )}
      <Pill label={entry.tag || "Other"} />
      <span className="tabular-nums text-zinc-600">{formatHMS(seconds)}</span>
      {open ? <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
      {entry.source === "manual" ? (
        <div className="flex items-center gap-1">
          <button onClick={() => setEditing(true)} className="text-zinc-300 hover:text-zinc-600" aria-label="Edit">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={() => remove.mutate()} className="text-zinc-300 hover:text-red-500" aria-label="Delete">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}
    </li>
  );
}

function ManualEntryCard({ snap, onChanged }: { snap: Snapshot; onChanged: () => void }) {
  return (
    <Card>
      <SectionHeading title="Add a manual entry" />
      <ManualEntryForm snap={snap} onDone={onChanged} />
    </Card>
  );
}

function ManualEntryForm({
  snap,
  fixedTaskId,
  entry,
  tags,
  onDone,
  onCancel,
}: {
  snap: Snapshot | undefined;
  fixedTaskId?: string;
  entry?: TimeEntry;
  tags?: string[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [taskId, setTaskId] = useState(entry?.taskId ?? fixedTaskId ?? "");
  const [checkIn, setCheckIn] = useState(() => (entry ? toDateTimeLocalInput(entry.checkIn) : toDateTimeLocalInput(Date.now() - 30 * 60_000)));
  const [checkOut, setCheckOut] = useState(() => (entry?.checkOut ? toDateTimeLocalInput(entry.checkOut) : toDateTimeLocalInput(Date.now())));
  const [tag, setTag] = useState(entry?.tag ?? tags?.[0] ?? snap?.tags[0]?.name ?? "Other");
  const [note, setNote] = useState(entry?.note ?? "");

  const save = useMutation({
    mutationFn: () => {
      const ci = new Date(checkIn).getTime();
      const co = new Date(checkOut).getTime();
      return entry ? updateManualEntry(entry.id, { tag, checkIn: ci, checkOut: co, note }) : createManualEntry({ taskId, tag, checkIn: ci, checkOut: co, note });
    },
    onSuccess: () => {
      onDone();
      if (!entry) {
        setNote("");
        toast.success("Time entry added");
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save time entry"),
  });

  const tagOptions = tags ?? snap?.tags.map((t) => t.name) ?? [];

  return (
    <form
      className="grid gap-2.5 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (taskId) save.mutate();
      }}
    >
      {!fixedTaskId ? (
        <Field label="Task" className="sm:col-span-1">
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} required>
            <option value="">Pick…</option>
            {snap?.tasks
              .filter((t) => !t.archived)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Check-in">
        <Input type="datetime-local" step={1} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
      </Field>
      <Field label="Check-out">
        <Input type="datetime-local" step={1} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
      </Field>
      <Field label="Tag">
        <Select value={tag} onChange={(e) => setTag(e.target.value)}>
          {tagOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-5">
        <Button type="submit" variant="primary" size="sm" disabled={!taskId} loading={save.isPending}>
          <Plus className="size-3.5" /> {entry ? "Save" : "Add entry"}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

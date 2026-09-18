"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Clock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useSnapshot } from "@/hooks/use-app";
import {
  addNote,
  archiveTask,
  createManualEntry,
  createSubtask,
  deleteManualEntry,
  deleteSubtask,
  deleteTaskPermanently,
  restoreTask,
  updateManualEntry,
  updateSubtask,
  updateTask,
} from "@/lib/client/api";
import { classifyQuadrant, QUADRANTS } from "@/lib/domain/quadrant";
import { remainingAgainstEstimate, summarizeTaskTime } from "@/lib/domain/timer";
import { useNow } from "@/hooks/use-app";
import { formatDateLabel, formatHM, formatHMS, toDateTimeLocalInput } from "@/lib/time";
import type { Snapshot, Task, TimeEntry } from "@/lib/types";
import { Button, Card, Empty, Field, Input, Pill, Select, SectionHeading, Textarea, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { PriorityPill, StatusSelect } from "@/components/task-fragments";
import { TimerControl } from "@/components/timer-control";

const NOTE_KINDS: { value: string; label: string }[] = [
  { value: "progress", label: "What I worked on" },
  { value: "completed", label: "What was completed" },
  { value: "remaining", label: "What remains" },
  { value: "blocker", label: "Blocker" },
  { value: "clarification", label: "Clarification needed" },
  { value: "decision", label: "Decision" },
  { value: "note", label: "Other note" },
];

const SNAPSHOT_KEY = ["snapshot"];

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const snap = useSnapshot();
  const task = snap.data?.tasks.find((t) => t.id === id);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> All tasks
      </Link>
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data && task ? (
          <TaskDetailBody snap={snap.data} task={task} />
        ) : snap.data ? (
          <Empty title="Task not found" hint="It may have been deleted or permanently removed." />
        ) : null}
      </QueryState>
    </div>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });
}

function TaskDetailBody({ snap, task }: { snap: Snapshot; task: Task }) {
  const now = useNow(1000);
  const router = useRouter();
  const invalidate = useInvalidate();
  const entries = snap.entries.filter((e) => e.taskId === task.id);
  const subtasks = snap.subtasks.filter((s) => s.taskId === task.id).sort((a, b) => a.order - b.order);
  const history = snap.history.filter((h) => h.taskId === task.id);
  const timeSummary = summarizeTaskTime(entries, task.id, now);
  const remaining = remainingAgainstEstimate(task.estimateMinutes, timeSummary.totalSeconds);
  const quadrant = classifyQuadrant(task.effort, task.impact, snap.settings.quadrantThreshold);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof updateTask>[1]) => updateTask(task.id, p),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save"),
  });

  const archive = useMutation({
    mutationFn: () => archiveTask(task.id),
    onSuccess: () => {
      invalidate();
      toast.success("Task archived");
    },
  });
  const restore = useMutation({
    mutationFn: () => restoreTask(task.id),
    onSuccess: () => {
      invalidate();
      toast.success("Task restored");
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteTaskPermanently(task.id),
    onSuccess: () => {
      toast.success("Task deleted permanently");
      router.push("/tasks");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {titleDraft !== null ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") setTitleDraft(null);
                }}
                className="text-lg font-bold"
              />
              <Button size="icon" variant="secondary" onClick={commitTitle} aria-label="Save title">
                <Check className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setTitleDraft(null)} aria-label="Cancel">
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <button className="group flex items-center gap-2 text-left" onClick={() => setTitleDraft(task.title)}>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">{task.title}</h1>
              <Pencil className="size-3.5 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusSelect taskId={task.id} status={task.status} snap={snap} />
            <PriorityPill snap={snap} priority={task.priority} />
            {quadrant ? <Pill label={QUADRANTS[quadrant].label} color={QUADRANTS[quadrant].color} /> : null}
            {task.archived ? <Pill label="Archived" color="#898781" /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {task.archived ? (
            <Button variant="secondary" onClick={() => restore.mutate()} loading={restore.isPending}>
              <ArchiveRestore className="size-4" /> Restore
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => archive.mutate()} loading={archive.isPending}>
              <Archive className="size-4" /> Archive
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Permanently delete "${task.title}" and all its time entries, subtasks and history? This cannot be undone.`)) {
                remove.mutate();
              }
            }}
            loading={remove.isPending}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionHeading title="Description" />
            <Textarea
              defaultValue={task.description}
              placeholder="Add more detail about this task…"
              onBlur={(e) => e.target.value !== task.description && patch.mutate({ description: e.target.value })}
            />
          </Card>

          <Card>
            <SectionHeading title="Details" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Select defaultValue={task.category} onChange={(e) => patch.mutate({ category: e.target.value })}>
                  {snap.categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <Select defaultValue={task.type} onChange={(e) => patch.mutate({ type: e.target.value })}>
                  <option>Daily</option>
                  <option>Weekly</option>
                </Select>
              </Field>
              <Field label="Project">
                <Select value={task.projectId} onChange={(e) => patch.mutate({ projectId: e.target.value, milestoneId: "" })}>
                  <option value="">No project</option>
                  {snap.projects
                    .filter((p) => !p.archived || p.id === task.projectId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Milestone" hint={task.projectId ? undefined : "Pick a project first"}>
                <Select value={task.milestoneId} disabled={!task.projectId} onChange={(e) => patch.mutate({ milestoneId: e.target.value })}>
                  <option value="">No milestone</option>
                  {snap.milestones
                    .filter((m) => m.projectId === task.projectId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Effort (1-10)" hint="How much work this takes">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={task.effort ?? ""}
                  onBlur={(e) => patch.mutate({ effort: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="Impact (1-10)" hint="Value to user/business">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={task.impact ?? ""}
                  onBlur={(e) => patch.mutate({ impact: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="Estimate (minutes)">
                <Input
                  type="number"
                  min={0}
                  defaultValue={task.estimateMinutes ?? ""}
                  onBlur={(e) => patch.mutate({ estimateMinutes: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="Due date">
                <Input type="date" defaultValue={task.dueDate ?? ""} onChange={(e) => patch.mutate({ dueDate: e.target.value || null })} />
              </Field>
            </div>
          </Card>

          <SubtasksCard taskId={task.id} subtasks={subtasks} snap={snap} onChanged={invalidate} />

          <TimeEntriesCard taskId={task.id} entries={entries} tags={snap.tags.map((t) => t.name)} now={now} onChanged={invalidate} />

          <Card>
            <SectionHeading title="Activity" />
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">No activity yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {history.slice(0, 50).map((h) => (
                  <li key={h.id} className="flex items-start gap-2.5 text-sm">
                    <Clock className="mt-0.5 size-3.5 shrink-0 text-zinc-300" />
                    <div className="min-w-0">
                      <p className="text-zinc-700">{describeHistory(h)}</p>
                      <p className="text-xs text-zinc-400">{new Date(h.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionHeading title="Time tracker" />
            <TimerControl taskId={task.id} entries={entries} tags={snap.tags.map((t) => t.name)} onChanged={invalidate} />
            {task.estimateMinutes !== null ? (
              <p className={cn("mt-3 text-xs", remaining.overrun ? "font-medium text-red-600" : "text-zinc-500")}>
                {remaining.overrun
                  ? `Over estimate by ${formatHM(Math.abs(remaining.remainingSeconds ?? 0))}`
                  : `${formatHM(remaining.remainingSeconds ?? 0)} left of ${formatHM((task.estimateMinutes ?? 0) * 60)} estimate`}
              </p>
            ) : null}
            {Object.keys(timeSummary.byTag).length > 0 ? (
              <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
                {Object.entries(timeSummary.byTag)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, seconds]) => (
                    <div key={tag} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">{tag}</span>
                      <span className="tabular-nums text-zinc-700">{formatHMS(seconds)}</span>
                    </div>
                  ))}
              </div>
            ) : null}
          </Card>

          <AddNoteCard taskId={task.id} onChanged={invalidate} />

          <Card className="space-y-1.5 text-xs text-zinc-500">
            <SectionHeading title="Meta" />
            {task.createdAt ? <p>Created {formatDateLabel(task.createdAt.slice(0, 10), "long")}</p> : null}
            {task.updatedAt ? <p>Updated {new Date(task.updatedAt).toLocaleString()}</p> : null}
            {task.completedAt ? <p>Completed {new Date(task.completedAt).toLocaleString()}</p> : null}
          </Card>
        </div>
      </div>
    </div>
  );

  function commitTitle() {
    if (titleDraft !== null && titleDraft.trim() && titleDraft !== task.title) {
      patch.mutate({ title: titleDraft.trim() });
    }
    setTitleDraft(null);
  }
}

function describeHistory(h: Snapshot["history"][number]): string {
  switch (h.type) {
    case "created":
      return h.message || "Task created";
    case "status":
      return `Status changed: ${h.from || "—"} → ${h.to}`;
    case "field":
      return `${h.field} changed: ${h.from || "—"} → ${h.to || "—"}`;
    case "timer":
      return h.message || `Timer ${h.kind}`;
    case "entry":
      return h.message || `Time entry ${h.kind}`;
    case "subtask":
      return h.message ? `Subtask ${h.kind}: ${h.message}` : `Subtask ${h.kind}`;
    case "plan":
      return h.message || "Plan updated";
    default:
      return h.message || "Updated";
  }
}

function SubtasksCard({
  taskId,
  subtasks,
  snap,
  onChanged,
}: {
  taskId: string;
  subtasks: Snapshot["subtasks"];
  snap: Snapshot;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const doneStatus = snap.statuses.find((s) => s.group === "done")?.name ?? "Completed";
  const todoStatus = snap.statuses.find((s) => s.group === "todo")?.name ?? "Yet to Start";

  const add = useMutation({
    mutationFn: () => createSubtask(taskId, { title: title.trim() }),
    onSuccess: () => {
      setTitle("");
      onChanged();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add subtask"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateSubtask(id, { status: done ? doneStatus : todoStatus }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSubtask(id),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <SectionHeading title={`Subtasks${subtasks.length > 0 ? ` (${subtasks.filter((s) => s.status === doneStatus).length}/${subtasks.length})` : ""}`} />
      {subtasks.length > 0 ? (
        <ul className="mb-3 divide-y divide-zinc-100">
          {subtasks.map((s) => {
            const done = s.status === doneStatus;
            return (
              <li key={s.id} className="flex items-center gap-2.5 py-2">
                <button
                  onClick={() => toggle.mutate({ id: s.id, done: !done })}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    done ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-transparent hover:border-zinc-400"
                  )}
                >
                  <Check className="size-3.5" />
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm", done ? "text-zinc-400 line-through" : "text-zinc-800")}>{s.title}</span>
                {s.estimateMinutes !== null ? <span className="shrink-0 text-xs tabular-nums text-zinc-400">{formatHM(s.estimateMinutes * 60)}</span> : null}
                <button onClick={() => remove.mutate(s.id)} className="shrink-0 text-zinc-300 hover:text-red-500" aria-label="Delete subtask">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask…" />
        <Button type="submit" size="icon" variant="secondary" disabled={!title.trim()} loading={add.isPending}>
          <Plus className="size-4" />
        </Button>
      </form>
    </Card>
  );
}

function TimeEntriesCard({
  taskId,
  entries,
  tags,
  now,
  onChanged,
}: {
  taskId: string;
  entries: TimeEntry[];
  tags: string[];
  now: number;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const sorted = [...entries].sort((a, b) => b.checkIn - a.checkIn);

  const remove = useMutation({
    mutationFn: (id: string) => deleteManualEntry(id),
    onSuccess: onChanged,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete entry"),
  });

  return (
    <Card>
      <SectionHeading
        title="Time entries"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)}>
            <Plus className="size-3.5" /> Manual entry
          </Button>
        }
      />
      {showForm ? (
        <ManualEntryForm
          taskId={taskId}
          tags={tags}
          onDone={() => {
            setShowForm(false);
            onChanged();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
      {sorted.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">No time tracked yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {sorted.map((e) => {
            const open = e.checkOut === null;
            const seconds = open ? Math.max(0, Math.round((now - e.checkIn) / 1000)) : e.durationSeconds;
            return editing === e.id ? (
              <li key={e.id} className="py-2">
                <ManualEntryForm
                  taskId={taskId}
                  tags={tags}
                  entry={e}
                  onDone={() => {
                    setEditing(null);
                    onChanged();
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-zinc-400">{e.date}</span>
                <span className="text-zinc-600">
                  {new Date(e.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {open ? <span className="font-medium text-emerald-600">running</span> : new Date(e.checkOut!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="tabular-nums text-zinc-800">{formatHMS(seconds)}</span>
                <Pill label={e.tag || "Other"} />
                <span className="text-xs text-zinc-300">{e.source}</span>
                {e.source === "manual" ? (
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => setEditing(e.id)} className="text-zinc-300 hover:text-zinc-600" aria-label="Edit entry">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => remove.mutate(e.id)} className="text-zinc-300 hover:text-red-500" aria-label="Delete entry">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ManualEntryForm({
  taskId,
  tags,
  entry,
  onDone,
  onCancel,
}: {
  taskId: string;
  tags: string[];
  entry?: TimeEntry;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [checkIn, setCheckIn] = useState(entry ? toDateTimeLocalInput(entry.checkIn) : toDateTimeLocalInput(Date.now() - 30 * 60_000));
  const [checkOut, setCheckOut] = useState(entry?.checkOut ? toDateTimeLocalInput(entry.checkOut) : toDateTimeLocalInput(Date.now()));
  const [tag, setTag] = useState(entry?.tag ?? tags[0] ?? "Other");
  const [note, setNote] = useState(entry?.note ?? "");

  const save = useMutation({
    mutationFn: () => {
      const ci = new Date(checkIn).getTime();
      const co = new Date(checkOut).getTime();
      return entry
        ? updateManualEntry(entry.id, { tag, checkIn: ci, checkOut: co, note })
        : createManualEntry({ taskId, tag, checkIn: ci, checkOut: co, note });
    },
    onSuccess: onDone,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save time entry"),
  });

  return (
    <form
      className="mb-3 grid gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Check-in" className="sm:col-span-1">
        <Input type="datetime-local" step={1} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
      </Field>
      <Field label="Check-out" className="sm:col-span-1">
        <Input type="datetime-local" step={1} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
      </Field>
      <Field label="Tag" className="sm:col-span-1">
        <Select value={tag} onChange={(e) => setTag(e.target.value)}>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" className="sm:col-span-1">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-4">
        <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddNoteCard({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const [kind, setKind] = useState(NOTE_KINDS[0].value);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const submit = useMutation({
    mutationFn: () => addNote(taskId, kind, message.trim()),
    onSuccess: () => {
      setMessage("");
      onChanged();
      toast.success("Note added");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add note"),
  });

  return (
    <Card>
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <SectionHeading title="Add note / update" />
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (message.trim()) submit.mutate();
          }}
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {NOTE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's the update?" />
          <Button type="submit" variant="primary" size="sm" disabled={!message.trim()} loading={submit.isPending}>
            Add
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckSquare2, ChevronRight, Circle, LayoutGrid, List as ListIcon, Plus, Search } from "lucide-react";
import { useSnapshot, useNow } from "@/hooks/use-app";
import { createTask, setTaskStatus, updateSubtask } from "@/lib/client/api";
import { formatHM } from "@/lib/time";
import { summarizeTaskTime } from "@/lib/domain/timer";
import { classifyQuadrant, QUADRANTS } from "@/lib/domain/quadrant";
import { todayKey, doneStatusNames } from "@/lib/derive";
import type { Snapshot } from "@/lib/types";
import { PageShell, Button, Input, Select, Field, Card, Empty, Pill, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { CategoryPill, EffortImpactTag, PriorityPill, StatusSelect, TaskProgress } from "@/components/task-fragments";
import { TimerControl } from "@/components/timer-control";
import { PriorityBoard } from "@/components/priority-board";

const GROUP_ORDER: Record<string, number> = { todo: 0, active: 1, waiting: 2, done: 3, cancelled: 4 };

export default function TasksPage() {
  const snap = useSnapshot();
  const now = useNow(30_000);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [view, setView] = useState<"list" | "board">("list");
  const [form, setForm] = useState({ title: "", description: "", category: "", projectId: "", priority: "Medium", type: "", effort: "", impact: "", estimate: "", due: "" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = useMutation({
    mutationFn: () =>
      createTask({
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        projectId: form.projectId || undefined,
        priority: form.priority || undefined,
        type: form.type || undefined,
        effort: form.effort === "" ? null : Number(form.effort),
        impact: form.impact === "" ? null : Number(form.impact),
        estimateMinutes: form.estimate === "" ? null : Number(form.estimate),
        dueDate: form.due || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["snapshot"] });
      setForm({ title: "", description: "", category: "", projectId: "", priority: "Medium", type: "", effort: "", impact: "", estimate: "", due: "" });
      setShowForm(false);
      toast.success("Task created — you can type the rest in the detail view or straight into the sheet.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create task"),
  });

  const categories = snap.data?.categories.map((c) => c.name) ?? [];
  const tasks = snap.data?.tasks ?? [];
  const doneStatusName = snap.data?.statuses.find((s) => s.group === "done")?.name;
  // Hoisted once for the whole list rather than rebuilt per row.
  const doneNames = useMemo(() => (snap.data ? doneStatusNames(snap.data) : new Set<string>()), [snap.data]);
  const todoStatusName = snap.data?.statuses.find((s) => s.group === "todo")?.name;

  /**
   * Ticking the done box used to call invalidateQueries *before* sending the
   * PATCH, so the refetch raced ahead of the write and came back with the old
   * value — the box then sat unchanged until the next 15s poll. It now patches
   * the cached snapshot up front, so the tick is instant, and only invalidates
   * once the server has actually answered.
   */
  const toggleStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => setTaskStatus(id, next),
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ queryKey: ["snapshot"] });
      const previous = qc.getQueryData<Snapshot>(["snapshot"]);
      if (previous) {
        qc.setQueryData<Snapshot>(["snapshot"], {
          ...previous,
          tasks: previous.tasks.map((t) => (t.id === id ? { ...t, status: next } : t)),
        });
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["snapshot"], ctx.previous);
      toast.error(err instanceof Error ? err.message : "Status change failed");
    },
    // Settled, not success: a failed edit must also re-sync, since the server
    // may have applied side effects (stopping a running timer, stamping
    // completedAt) that the optimistic patch above knows nothing about.
    onSettled: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
  });

  const toggleSubtask = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      updateSubtask(id, { status: done ? doneStatusName : todoStatusName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update subtask"),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => !t.archived)
      .filter((t) => (q ? (t.title + " " + t.description + " " + t.category).toLowerCase().includes(q) : true))
      .filter((t) => {
        if (group === "all") return true;
        const status = snap.data?.statuses.find((s) => s.name === t.status);
        return status?.group === group;
      })
      .sort((a, b) => {
        const ga = GROUP_ORDER[snap.data?.statuses.find((s) => s.name === a.status)?.group ?? "todo"] ?? 5;
        const gb = GROUP_ORDER[snap.data?.statuses.find((s) => s.name === b.status)?.group ?? "todo"] ?? 5;
        if (ga !== gb) return ga - gb;
        const ra = snap.data?.priorities.find((p) => p.name === a.priority)?.rank ?? 99;
        const rb = snap.data?.priorities.find((p) => p.name === b.priority)?.rank ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      });
  }, [tasks, search, group, snap.data]);

  return (
    <PageShell
      title="Task List"
      subtitle="Everything in one view — status, priority, time and quick timer control."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            <button
              onClick={() => setView("list")}
              title="List view"
              className={cn("rounded-md p-1.5 transition-colors", view === "list" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}
            >
              <ListIcon className="size-4" />
            </button>
            <button
              onClick={() => setView("board")}
              title="Board view — drag cards to reorder or re-prioritize"
              className={cn("rounded-md p-1.5 transition-colors", view === "board" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
          <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
            <Plus className="size-4" />
            New task
          </Button>
        </div>
      }
    >
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {showForm ? (
          <Card className="mb-4">
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.title.trim()) create.mutate();
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.requestSubmit();
                }
              }}
            >
              <Field label="Title *" className="md:col-span-2">
                <Input value={form.title} placeholder="What needs doing?" onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
              </Field>
              <Field label="Description">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="">{snap.data?.settings.defaultCategory ?? "General"}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project">
                <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">No project</option>
                  {(snap.data?.projects ?? [])
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {snap.data?.priorities.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="">{snap.data?.settings.defaultType ?? "Daily"}</option>
                  <option>Daily</option>
                  <option>Weekly</option>
                </Select>
              </Field>
              <Field label="Effort (1-10)">
                <Input type="number" min={1} max={10} value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value })} />
              </Field>
              <Field label="Impact (1-10)">
                <Input type="number" min={1} max={10} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} />
              </Field>
              <Field label="Estimate (minutes)">
                <Input type="number" min={0} value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value })} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              </Field>
              <div className="flex items-center gap-2 md:col-span-2">
                <Button variant="primary" type="submit" disabled={!form.title.trim()} loading={create.isPending}>
                  Create
                </Button>
                <Button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input className="pl-9" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-40" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="todo">To do</option>
            <option value="active">In progress</option>
            <option value="waiting">Blocked / waiting</option>
            <option value="done">Done</option>
          </Select>
        </div>

        {visible.length === 0 ? (
          <Empty title="No tasks match" hint="Create one above, or type a Task right into the sheet and sync." />
        ) : view === "board" && snap.data ? (
          <PriorityBoard tasks={visible} snap={snap.data} now={now} />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-zinc-100">
              {visible.map((t) => {
                const total = summarizeTaskTime(snap.data?.entries.filter((e) => e.taskId === t.id) ?? [], t.id, now).totalSeconds;
                const done = ["Completed", "Closed"].includes(t.status);
                const taskSubtasks = (snap.data?.subtasks ?? []).filter((s) => s.taskId === t.id);
                const project = (snap.data?.projects ?? []).find((p) => p.id === t.projectId);
                const isOpen = expanded.has(t.id);
                return (
                  <Fragment key={t.id}>
                    <li
                      className={cn("flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-zinc-50", isOpen && "bg-zinc-50")}
                      onClick={() => toggleExpand(t.id)}
                    >
                      <ChevronRight className={cn("size-4 shrink-0 text-zinc-300 transition-transform", isOpen && "rotate-90")} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStatus.mutate({ id: t.id, next: done ? "Yet to Start" : "Completed" });
                        }}
                        title={done ? "Mark not done" : "Mark completed"}
                        className={cn("shrink-0 text-zinc-300 transition-colors hover:text-zinc-600", done && "text-emerald-500")}
                      >
                        {done ? <CheckSquare2 className="size-5" /> : <Circle className="size-5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <Link href={`/tasks/${t.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-medium text-zinc-900 hover:text-zinc-600">
                          {t.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <PriorityPill snap={snap.data} priority={t.priority} />
                          {project ? <Pill label={project.name} color={project.color} /> : null}
                          <CategoryPill category={t.category} />
                          <EffortImpactTag effort={t.effort} impact={t.impact} />
                          <span className="size-2 rounded-full bg-zinc-200" style={quadDotStyle(t.effort, t.impact, snap.data?.settings.quadrantThreshold)} />
                          {snap.data ? <TaskProgress task={t} subtasks={taskSubtasks} snap={snap.data} doneNames={doneNames} /> : null}
                          {t.dueDate ? <span className={cn("text-xs tabular-nums text-zinc-400", t.dueDate < todayKey() && "font-medium text-red-500")}>{t.dueDate}</span> : null}
                        </div>
                      </div>
                      <span className="hidden text-xs tabular-nums text-zinc-400 sm:block">
                        {t.estimateMinutes !== null ? `${t.estimateMinutes}m est · ` : ""}
                        {formatHM(total)} tracked
                      </span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <StatusSelect taskId={t.id} status={t.status} snap={snap.data} />
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <TimerControl taskId={t.id} entries={snap.data?.entries.filter((e) => e.taskId === t.id) ?? []} tags={snap.data?.tags.map((x) => x.name) ?? []} compact />
                      </div>
                    </li>
                    {isOpen ? (
                      <li className="bg-zinc-50 px-4 py-3 pl-11">
                        {taskSubtasks.length === 0 ? (
                          <p className="text-xs text-zinc-400">No subtasks yet — add some from the task detail page.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {taskSubtasks.map((s) => {
                              const sDone = s.status === doneStatusName;
                              return (
                                <li key={s.id} className="flex items-center gap-2.5 text-sm">
                                  <button
                                    onClick={() => toggleSubtask.mutate({ id: s.id, done: !sDone })}
                                    className={cn(
                                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                                      sDone ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-transparent hover:border-zinc-400"
                                    )}
                                  >
                                    <Check className="size-3" />
                                  </button>
                                  <span className={cn("min-w-0 flex-1 truncate", sDone ? "text-zinc-400 line-through" : "text-zinc-700")}>{s.title}</span>
                                  {s.estimateMinutes !== null ? <span className="shrink-0 text-xs tabular-nums text-zinc-400">{formatHM(s.estimateMinutes * 60)}</span> : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    ) : null}
                  </Fragment>
                );
              })}
            </ul>
          </Card>
        )}
      </QueryState>
    </PageShell>
  );
}

/** Quadrant dot color — undefined lets the bg-zinc-200 default in the className show through. */
function quadDotStyle(effort: number | null, impact: number | null, threshold: number | undefined): CSSProperties {
  const id = classifyQuadrant(effort, impact, threshold ?? 5.5);
  return id ? { backgroundColor: QUADRANTS[id].color } : {};
}
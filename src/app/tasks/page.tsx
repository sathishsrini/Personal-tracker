"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckSquare2, Circle, Plus, Search } from "lucide-react";
import { useSnapshot } from "@/hooks/use-app";
import { createTask, setTaskStatus } from "@/lib/client/api";
import { formatHM } from "@/lib/time";
import { summarizeTaskTime } from "@/lib/domain/timer";
import { classifyQuadrant, QUADRANTS } from "@/lib/domain/quadrant";
import { todayKey } from "@/lib/derive";
import { PageShell, Button, Input, Select, Field, Card, Empty, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { CategoryPill, EffortImpactTag, PriorityPill, StatusSelect } from "@/components/task-fragments";
import { TimerControl } from "@/components/timer-control";

const GROUP_ORDER: Record<string, number> = { todo: 0, active: 1, waiting: 2, done: 3, cancelled: 4 };

export default function TasksPage() {
  const snap = useSnapshot();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [form, setForm] = useState({ title: "", description: "", category: "", priority: "Medium", type: "", effort: "", impact: "", estimate: "", due: "" });
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () =>
      createTask({
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        priority: form.priority || undefined,
        type: form.type || undefined,
        effort: form.effort === "" ? null : Number(form.effort),
        impact: form.impact === "" ? null : Number(form.impact),
        estimateMinutes: form.estimate === "" ? null : Number(form.estimate),
        dueDate: form.due || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["snapshot"] });
      setForm({ title: "", description: "", category: "", priority: "Medium", type: "", effort: "", impact: "", estimate: "", due: "" });
      setShowForm(false);
      toast.success("Task created — you can type the rest in the detail view or straight into the sheet.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create task"),
  });

  const categories = snap.data?.categories.map((c) => c.name) ?? [];
  const tasks = snap.data?.tasks ?? [];

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
        <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" />
          New task
        </Button>
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
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-zinc-100">
              {visible.map((t) => {
                const total = summarizeTaskTime(snap.data?.entries.filter((e) => e.taskId === t.id) ?? [], t.id, Date.now()).totalSeconds;
                const done = ["Completed", "Closed"].includes(t.status);
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => {
                        const next = done ? "Yet to Start" : "Completed";
                        qc.invalidateQueries({ queryKey: ["snapshot"] });
                        setTaskStatus(t.id, next).catch((e) => toast.error(e instanceof Error ? e.message : "Status change failed"));
                      }}
                      title={done ? "Mark not done" : "Mark completed"}
                      className={cn("shrink-0 text-zinc-300 transition-colors hover:text-zinc-600", done && "text-emerald-500")}
                    >
                      {done ? <CheckSquare2 className="size-5" /> : <Circle className="size-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium text-zinc-900 hover:text-zinc-600">
                        {t.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <PriorityPill snap={snap.data} priority={t.priority} />
                        <CategoryPill category={t.category} />
                        <EffortImpactTag effort={t.effort} impact={t.impact} />
                        <span className="size-2 rounded-full bg-zinc-200" style={quadDotStyle(t.effort, t.impact, snap.data?.settings.quadrantThreshold)} />
                        {t.dueDate ? <span className={cn("text-xs tabular-nums text-zinc-400", t.dueDate < todayKey() && "font-medium text-red-500")}>{t.dueDate}</span> : null}
                      </div>
                    </div>
                    <span className="hidden text-xs tabular-nums text-zinc-400 sm:block">
                      {t.estimateMinutes !== null ? `${t.estimateMinutes}m est · ` : ""}
                      {formatHM(total)} tracked
                    </span>
                    <StatusSelect taskId={t.id} status={t.status} snap={snap.data} />
                    <TimerControl taskId={t.id} entries={snap.data?.entries.filter((e) => e.taskId === t.id) ?? []} tags={snap.data?.tags.map((x) => x.name) ?? []} compact />
                  </li>
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
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, Check, Flag, Plus, Trash2 } from "lucide-react";
import { useNow, useSnapshot } from "@/hooks/use-app";
import {
  archiveProject,
  createMilestone,
  deleteMilestone,
  deleteProjectPermanently,
  restoreProject,
  updateMilestone,
  updateProject,
} from "@/lib/client/api";
import { summarizeTaskTime } from "@/lib/domain/timer";
import { todayKey } from "@/lib/derive";
import { formatHM } from "@/lib/time";
import type { Milestone, Project, Snapshot } from "@/lib/types";
import { Button, Card, Empty, Field, Input, Pill, SectionHeading, Select, Textarea, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { PriorityPill, StatusSelect } from "@/components/task-fragments";
import { ProgressBar } from "@/components/project-fragments";

const SNAPSHOT_KEY = ["snapshot"];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const snap = useSnapshot();
  const project = snap.data?.projects.find((p) => p.id === id);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> All projects
      </Link>
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data && project ? (
          <ProjectDetailBody snap={snap.data} project={project} />
        ) : snap.data ? (
          <Empty title="Project not found" hint="It may have been deleted." />
        ) : null}
      </QueryState>
    </div>
  );
}

function ProjectDetailBody({ snap, project }: { snap: Snapshot; project: Project }) {
  const now = useNow(30_000);
  const router = useRouter();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });

  const doneNames = useMemo(() => new Set(snap.statuses.filter((s) => s.group === "done").map((s) => s.name)), [snap.statuses]);
  const milestones = snap.milestones.filter((m) => m.projectId === project.id).sort((a, b) => a.order - b.order);
  const tasks = snap.tasks.filter((t) => t.projectId === project.id && !t.archived);
  const tasksDone = tasks.filter((t) => doneNames.has(t.status)).length;
  const trackedSeconds = tasks.reduce(
    (sum, t) => sum + summarizeTaskTime(snap.entries.filter((e) => e.taskId === t.id), t.id, now).totalSeconds,
    0
  );

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof updateProject>[1]) => updateProject(project.id, p),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save"),
  });
  const archive = useMutation({
    mutationFn: () => (project.archived ? restoreProject(project.id) : archiveProject(project.id)),
    onSuccess: () => {
      invalidate();
      toast.success(project.archived ? "Project restored" : "Project archived");
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteProjectPermanently(project.id),
    onSuccess: () => {
      toast.success("Project deleted — its tasks were kept and unlinked");
      router.push("/projects");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete"),
  });

  const overdue = project.targetDate !== null && project.targetDate < todayKey() && tasksDone < tasks.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">{project.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Select
              value={project.status}
              onChange={(e) => patch.mutate({ status: e.target.value })}
              className="h-8 w-auto py-1 pl-2 pr-7 text-xs"
            >
              {snap.statuses.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
            {project.archived ? <Pill label="Archived" color="#898781" /> : null}
            {project.targetDate ? (
              <span className={cn("text-xs tabular-nums text-zinc-500", overdue && "font-medium text-red-500")}>target {project.targetDate}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={() => archive.mutate()} loading={archive.isPending}>
            {project.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {project.archived ? "Restore" : "Archive"}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Delete "${project.name}" and its milestones? Its ${tasks.length} task(s) are kept and simply unlinked.`)) remove.mutate();
            }}
            loading={remove.isPending}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Tasks done" value={`${tasksDone}/${tasks.length}`} />
          <Stat label="Milestones hit" value={`${milestones.filter((m) => doneNames.has(m.status)).length}/${milestones.length}`} />
          <Stat label="Time tracked" value={formatHM(trackedSeconds)} />
        </div>
        <ProgressBar done={tasksDone} total={tasks.length} color={project.color} />
      </Card>

      <Card>
        <SectionHeading title="Description" />
        <Textarea
          defaultValue={project.description}
          placeholder="What is this project about?"
          onBlur={(e) => e.target.value !== project.description && patch.mutate({ description: e.target.value })}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Start date">
            <Input type="date" defaultValue={project.startDate ?? ""} onChange={(e) => patch.mutate({ startDate: e.target.value || null })} />
          </Field>
          <Field label="Target date">
            <Input type="date" defaultValue={project.targetDate ?? ""} onChange={(e) => patch.mutate({ targetDate: e.target.value || null })} />
          </Field>
        </div>
      </Card>

      <MilestonesCard projectId={project.id} milestones={milestones} snap={snap} doneNames={doneNames} onChanged={invalidate} />

      <Card>
        <SectionHeading title={`Tasks (${tasks.length})`} />
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            No tasks yet — open a task and pick this project, or create one from the{" "}
            <Link href="/tasks" className="underline hover:text-zinc-600">
              task list
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            {[...milestones, null].map((m) => {
              const group = tasks.filter((t) => (m ? t.milestoneId === m.id : !t.milestoneId || !milestones.some((x) => x.id === t.milestoneId)));
              if (group.length === 0) return null;
              return (
                <div key={m?.id ?? "unassigned"}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    {m ? <Flag className="size-3" /> : null}
                    {m ? m.title : "No milestone"}
                  </p>
                  <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                    {group.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm text-zinc-800 hover:text-zinc-500">
                          {t.title}
                        </Link>
                        <PriorityPill snap={snap} priority={t.priority} />
                        <StatusSelect taskId={t.id} status={t.status} snap={snap} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</p>
    </div>
  );
}

function MilestonesCard({
  projectId,
  milestones,
  snap,
  doneNames,
  onChanged,
}: {
  projectId: string;
  milestones: Milestone[];
  snap: Snapshot;
  doneNames: Set<string>;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const doneStatus = snap.statuses.find((s) => s.group === "done")?.name ?? "Completed";
  const todoStatus = snap.statuses.find((s) => s.group === "todo")?.name ?? "Yet to Start";

  const add = useMutation({
    mutationFn: () => createMilestone(projectId, { title: title.trim(), dueDate: due || undefined }),
    onSuccess: () => {
      setTitle("");
      setDue("");
      onChanged();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add milestone"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateMilestone(id, { status: done ? doneStatus : todoStatus }),
    onSuccess: onChanged,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update milestone"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteMilestone(id),
    onSuccess: onChanged,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete milestone"),
  });

  return (
    <Card>
      <SectionHeading title={`Milestones${milestones.length > 0 ? ` (${milestones.filter((m) => doneNames.has(m.status)).length}/${milestones.length})` : ""}`} />
      {milestones.length > 0 ? (
        <ul className="mb-3 divide-y divide-zinc-100">
          {milestones.map((m) => {
            const done = doneNames.has(m.status);
            const linked = snap.tasks.filter((t) => t.milestoneId === m.id && !t.archived);
            const overdue = !done && m.dueDate !== null && m.dueDate < todayKey();
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2.5 py-2">
                <button
                  onClick={() => toggle.mutate({ id: m.id, done: !done })}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    done ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-transparent hover:border-zinc-400"
                  )}
                  aria-label={done ? "Mark milestone open" : "Mark milestone hit"}
                >
                  <Check className="size-3.5" />
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm", done ? "text-zinc-400 line-through" : "text-zinc-800")}>{m.title}</span>
                {linked.length > 0 ? (
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {linked.filter((t) => doneNames.has(t.status)).length}/{linked.length} tasks
                  </span>
                ) : null}
                {m.dueDate ? <span className={cn("shrink-0 text-xs tabular-nums text-zinc-400", overdue && "font-medium text-red-500")}>{m.dueDate}</span> : null}
                <button onClick={() => remove.mutate(m.id)} className="shrink-0 text-zinc-300 hover:text-red-500" aria-label="Delete milestone">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap gap-2"
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
        <Input className="min-w-40 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone…" />
        <Input type="date" className="w-auto" value={due} onChange={(e) => setDue(e.target.value)} />
        <Button type="submit" size="icon" variant="secondary" disabled={!title.trim()} loading={add.isPending}>
          <Plus className="size-4" />
        </Button>
      </form>
    </Card>
  );
}

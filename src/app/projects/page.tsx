"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderKanban, Plus } from "lucide-react";
import { useSnapshot } from "@/hooks/use-app";
import { createProject } from "@/lib/client/api";
import { todayKey } from "@/lib/derive";
import { PageShell, Button, Card, ColorField, Empty, Field, Input, Pill, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { ProgressBar, projectStats } from "@/components/project-fragments";

const BLANK = { name: "", description: "", color: "", startDate: "", targetDate: "" };

export default function ProjectsPage() {
  const snap = useSnapshot();
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(BLANK);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () =>
      createProject({
        name: form.name,
        description: form.description || undefined,
        color: form.color || undefined,
        startDate: form.startDate || undefined,
        targetDate: form.targetDate || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["snapshot"] });
      setForm(BLANK);
      setShowForm(false);
      toast.success("Project created — add milestones and link tasks from its page.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create project"),
  });

  const doneNames = useMemo(() => new Set((snap.data?.statuses ?? []).filter((s) => s.group === "done").map((s) => s.name)), [snap.data]);
  const visible = (snap.data?.projects ?? []).filter((p) => (showArchived ? p.archived : !p.archived)).sort((a, b) => a.order - b.order);
  const archivedCount = (snap.data?.projects ?? []).filter((p) => p.archived).length;

  return (
    <PageShell
      title="Projects"
      subtitle="Group tasks under a project, track milestones, and see how far each one has got."
      actions={
        <div className="flex items-center gap-2">
          {archivedCount > 0 ? (
            <Button onClick={() => setShowArchived((s) => !s)}>{showArchived ? "Show active" : `Archived (${archivedCount})`}</Button>
          ) : null}
          <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
            <Plus className="size-4" />
            New project
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
                if (form.name.trim()) create.mutate();
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.requestSubmit();
                }
              }}
            >
              <Field label="Name *" className="md:col-span-2">
                <Input value={form.name} placeholder="What are you building?" onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Start date">
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Field>
              <Field label="Target date">
                <Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
              </Field>
              <Field label="Colour" className="md:col-span-2">
                <ColorField value={form.color} onChange={(hex) => setForm({ ...form, color: hex })} />
              </Field>
              <div className="flex items-center gap-2 md:col-span-2">
                <Button variant="primary" type="submit" disabled={!form.name.trim()} loading={create.isPending}>
                  Create
                </Button>
                <Button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {visible.length === 0 ? (
          <Empty
            icon={<FolderKanban className="size-6 text-zinc-300" />}
            title={showArchived ? "No archived projects" : "No projects yet"}
            hint={showArchived ? undefined : "Create one above, or type a name straight into the Projects tab of the sheet and sync."}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((p) => {
              const stats = projectStats(snap.data!, p.id, doneNames);
              const overdue = p.targetDate !== null && p.targetDate < todayKey() && stats.tasksDone < stats.tasks;
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="block">
                  <Card className="h-full transition-colors hover:border-zinc-300">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-zinc-900">{p.name}</h2>
                        {p.description ? <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{p.description}</p> : null}
                      </div>
                      <Pill label={p.status || "Yet to Start"} color={p.color} />
                    </div>

                    <ProgressBar done={stats.tasksDone} total={stats.tasks} color={p.color} />

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span className="tabular-nums">
                        {stats.tasksDone}/{stats.tasks} tasks
                      </span>
                      <span className="tabular-nums">
                        {stats.milestonesDone}/{stats.milestones} milestones
                      </span>
                      {p.targetDate ? <span className={cn("tabular-nums", overdue && "font-medium text-red-500")}>due {p.targetDate}</span> : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </QueryState>
    </PageShell>
  );
}

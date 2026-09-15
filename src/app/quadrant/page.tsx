"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSnapshot } from "@/hooks/use-app";
import { updateSettings } from "@/lib/client/api";
import { QUADRANTS, classifyQuadrant, type QuadrantId } from "@/lib/domain/quadrant";
import { isDone, unclassifiedTasks } from "@/lib/derive";
import type { Snapshot, Task } from "@/lib/types";
import { Card, Empty, PageShell, Pill, SectionHeading, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { PriorityPill } from "@/components/task-fragments";

const QUADRANT_IDS = Object.keys(QUADRANTS) as QuadrantId[];

export default function QuadrantPage() {
  const snap = useSnapshot();
  return (
    <PageShell title="Effort vs Impact" subtitle="Every actionable task placed by effort (x) and impact (y). Click a dot to open the task.">
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data ? <QuadrantBody snap={snap.data} /> : null}
      </QueryState>
    </PageShell>
  );
}

function QuadrantBody({ snap }: { snap: Snapshot }) {
  const qc = useQueryClient();
  const [hovered, setHovered] = useState<string | null>(null);
  const threshold = snap.settings.quadrantThreshold;

  const setThreshold = useMutation({
    mutationFn: (value: number) => updateSettings({ quadrantThreshold: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
  });

  const plotted = useMemo(
    () => snap.tasks.filter((t) => !t.archived && t.effort !== null && t.impact !== null && !isDone(t, snap)),
    [snap]
  );
  const unclassified = unclassifiedTasks(snap);
  const counts = new Map<QuadrantId, number>(QUADRANT_IDS.map((id) => [id, 0]));
  for (const t of plotted) {
    const id = classifyQuadrant(t.effort, t.impact, threshold);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Quadrant graph" />
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            Low/high split
            <input
              type="range"
              min={2}
              max={9}
              step={0.5}
              defaultValue={threshold}
              className="accent-zinc-900"
              onChange={(e) => setThreshold.mutate(Number(e.target.value))}
            />
            <span className="w-8 tabular-nums text-zinc-700">{threshold}</span>
          </label>
        </div>

        {plotted.length === 0 ? (
          <Empty title="Nothing to plot yet" hint="Set an effort and impact (1-10) on a task to place it on the graph." />
        ) : (
          <div className="relative mx-auto aspect-square w-full max-w-2xl select-none">
            {/* quadrant backgrounds */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-xl border border-zinc-200">
              <div className="border-b border-r border-zinc-200" style={{ backgroundColor: `${QUADRANTS["low-effort-high-impact"].color}0d` }} />
              <div className="border-b border-zinc-200" style={{ backgroundColor: `${QUADRANTS["high-effort-high-impact"].color}0d` }} />
              <div className="border-r border-zinc-200" style={{ backgroundColor: `${QUADRANTS["low-effort-low-impact"].color}0d` }} />
              <div style={{ backgroundColor: `${QUADRANTS["high-effort-low-impact"].color}0d` }} />
            </div>

            {/* quadrant labels */}
            <span className="absolute left-2 top-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Quick wins</span>
            <span className="absolute right-2 top-2 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Major projects</span>
            <span className="absolute bottom-2 left-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Fill-ins</span>
            <span className="absolute bottom-2 right-2 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Reconsider</span>

            {/* axis labels */}
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-zinc-400">Effort →</span>
            <span className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-zinc-400">Impact →</span>

            {plotted.map((t) => {
              const id = classifyQuadrant(t.effort, t.impact, threshold)!;
              const left = ((t.effort! - 1) / 9) * 100;
              const top = 100 - ((t.impact! - 1) / 9) * 100;
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-transform hover:z-20 hover:scale-125"
                  style={{ left: `${left}%`, top: `${top}%`, width: 12, height: 12, backgroundColor: QUADRANTS[id].color }}
                  onMouseEnter={() => setHovered(t.id)}
                  onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
                  title={t.title}
                >
                  {hovered === t.id ? (
                    <span className="absolute left-1/2 top-full z-30 mt-1.5 w-max max-w-52 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg">
                      <span className="block truncate font-medium text-zinc-900">{t.title}</span>
                      <span className="text-zinc-400">
                        E{t.effort} · I{t.impact} · {t.priority}
                      </span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {QUADRANT_IDS.map((id) => (
            <span key={id} className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="size-2 rounded-full" style={{ backgroundColor: QUADRANTS[id].color }} />
              {QUADRANTS[id].label} ({counts.get(id) ?? 0})
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {QUADRANT_IDS.map((id) => (
          <QuadrantList key={id} id={id} tasks={plotted.filter((t) => classifyQuadrant(t.effort, t.impact, threshold) === id)} snap={snap} />
        ))}
      </div>

      {unclassified.length > 0 ? (
        <Card>
          <SectionHeading title={`Not yet classified (${unclassified.length})`} />
          <ul className="divide-y divide-zinc-100">
            {unclassified.slice(0, 10).map((t) => (
              <li key={t.id} className="py-2">
                <Link href={`/tasks/${t.id}`} className="text-sm text-zinc-700 hover:underline">
                  {t.title}
                </Link>
                <span className="ml-2 text-xs text-zinc-400">— set effort & impact to place it</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function QuadrantList({ id, tasks, snap }: { id: QuadrantId; tasks: Task[]; snap: Snapshot }) {
  const def = QUADRANTS[id];
  return (
    <Card>
      <SectionHeading title={def.label} />
      <p className="mb-2 -mt-2 text-xs text-zinc-400">{def.description}</p>
      {tasks.length === 0 ? (
        <p className="py-3 text-center text-sm text-zinc-300">No tasks here.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 py-2">
              <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm text-zinc-800 hover:underline">
                {t.title}
              </Link>
              <PriorityPill snap={snap} priority={t.priority} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { useSnapshot, useNow } from "@/hooks/use-app";
import { downloadTextFile, sectionsToCsv } from "@/lib/csv";
import {
  categoryTotalsInRange,
  currentWeekStart,
  dayPlanSummary,
  fmtMin,
  overdueTasks,
  overrunTasks,
  priorityTotalsInRange,
  quadrantBuckets,
  rangeBounds,
  rangeLabel,
  secondsInDay,
  tagTotalsInRange,
  todayKey,
  totalSecondsInRange,
  utilPct,
  weeklyPlanVsActual,
  type ReportRange,
} from "@/lib/derive";
import { QUADRANTS } from "@/lib/domain/quadrant";
import { formatHM, formatHMS } from "@/lib/time";
import type { Snapshot } from "@/lib/types";
import { Button, Card, Empty, PageShell, Select, SectionHeading, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { StatCard, HBar } from "@/components/charts";
import { PriorityPill } from "@/components/task-fragments";

export default function ReportsPage() {
  const snap = useSnapshot();
  return (
    <PageShell title="Reports" subtitle="Planned vs actual, where your time goes, and what needs attention.">
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data ? <ReportsBody snap={snap.data} /> : null}
      </QueryState>
    </PageShell>
  );
}

const STATUS_GROUP_LABEL: Record<string, string> = {
  todo: "Yet to start",
  active: "In progress",
  waiting: "Blocked / waiting",
  done: "Completed",
  cancelled: "Cancelled",
};

function ReportsBody({ snap }: { snap: Snapshot }) {
  const now = useNow(30_000);
  const [range, setRange] = useState<ReportRange>("today");
  const today = todayKey();
  const weekStart = currentWeekStart(snap, now);

  const live = snap.tasks.filter((t) => !t.archived);
  const byGroup = new Map<string, number>();
  for (const t of live) {
    const group = snap.statuses.find((s) => s.name === t.status)?.group ?? "todo";
    byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
  }
  const overdue = overdueTasks(snap, now);

  const todaySummary = dayPlanSummary(snap, today);
  const todayActual = secondsInDay(snap.entries, today, now);

  const weekly = weeklyPlanVsActual(snap, weekStart, now);
  const weeklyPlanned = weekly.reduce((s, w) => s + w.plannedMinutes, 0);
  const weeklyActual = weekly.reduce((s, w) => s + w.actualSeconds, 0);

  const [start, end] = rangeBounds(range, snap.settings.weekStartsOn, now);
  const tagTotals = tagTotalsInRange(snap.entries, start, end, now);
  const categoryTotals = categoryTotalsInRange(snap, start, end, now);
  const priorityTotals = priorityTotalsInRange(snap, start, end, now);
  const rangeTotal = totalSecondsInRange(snap.entries, start, end, now);

  const buckets = quadrantBuckets(snap);
  const overruns = overrunTasks(snap, now).slice(0, 8);
  const carriedToday = snap.dailyPlan.filter((p) => p.date === today && p.carriedFrom);

  function exportCsv() {
    const csv = sectionsToCsv([
      {
        title: "Summary",
        headers: ["Metric", "Value"],
        rows: [
          ["Total tasks", live.length],
          ["In progress", byGroup.get("active") ?? 0],
          ["Blocked / waiting", byGroup.get("waiting") ?? 0],
          ["Completed", byGroup.get("done") ?? 0],
          ["Overdue", overdue.length],
        ],
      },
      {
        title: "Daily productivity (today)",
        headers: ["Planned (min)", "Actual (sec)", "Utilization %"],
        rows: [[todaySummary.plannedMinutes, todayActual, utilPct(todayActual, todaySummary.plannedMinutes)]],
      },
      {
        title: "Weekly productivity (this week)",
        headers: ["Planned (min)", "Actual (sec)", "Utilization %"],
        rows: [[weeklyPlanned, weeklyActual, utilPct(weeklyActual, weeklyPlanned)]],
      },
      { title: `Time by activity tag (${rangeLabel(range)})`, headers: ["Tag", "Seconds"], rows: tagTotals.map((t) => [t.key, t.seconds]) },
      { title: `Time by category (${rangeLabel(range)})`, headers: ["Category", "Seconds"], rows: categoryTotals.map((t) => [t.key, t.seconds]) },
      { title: `Time by priority (${rangeLabel(range)})`, headers: ["Priority", "Seconds"], rows: priorityTotals.map((t) => [t.key, t.seconds]) },
      { title: "Effort vs impact", headers: ["Quadrant", "Task count"], rows: buckets.map((b) => [QUADRANTS[b.id].label, b.tasks.length]) },
      { title: "Overdue tasks", headers: ["Task", "Priority", "Due date"], rows: overdue.map((t) => [t.title, t.priority, t.dueDate ?? ""]) },
      {
        title: "Tasks exceeding estimate",
        headers: ["Task", "Estimate (min)", "Actual (sec)", "Overrun (sec)"],
        rows: overruns.map((o) => [o.task.title, o.estimateMinutes, o.actualSeconds, o.overrunSeconds]),
      },
      {
        title: "Carried into today",
        headers: ["Task", "Carried from"],
        rows: carriedToday.map((p) => [snap.tasks.find((t) => t.id === p.taskId)?.title ?? "Unknown", p.carriedFrom]),
      },
    ]);
    downloadTextFile(`report-${today}.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download className="size-3.5" /> Export CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print / Save as PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total tasks" value={String(live.length)} />
        <StatCard label="In progress" value={String(byGroup.get("active") ?? 0)} tone="good" />
        <StatCard label="Blocked / waiting" value={String(byGroup.get("waiting") ?? 0)} tone={byGroup.get("waiting") ? "warn" : "default"} />
        <StatCard label="Completed" value={String(byGroup.get("done") ?? 0)} />
        <StatCard label="Overdue" value={String(overdue.length)} tone={overdue.length ? "bad" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Daily productivity — today" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Planned" value={fmtMin(todaySummary.plannedMinutes)} />
            <Stat label="Actual" value={formatHM(todayActual)} />
            <Stat
              label="Utilization"
              value={`${utilPct(todayActual, todaySummary.plannedMinutes)}%`}
              tone={utilPct(todayActual, todaySummary.plannedMinutes) > 100 ? "bad" : "default"}
            />
          </div>
        </Card>
        <Card>
          <SectionHeading title="Weekly productivity — this week" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Planned" value={fmtMin(weeklyPlanned)} />
            <Stat label="Actual" value={formatHM(weeklyActual)} />
            <Stat label="Utilization" value={`${utilPct(weeklyActual, weeklyPlanned)}%`} tone={utilPct(weeklyActual, weeklyPlanned) > 100 ? "bad" : "default"} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Time spent" />
          <Select value={range} onChange={(e) => setRange(e.target.value as ReportRange)} className="w-36">
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="all">All time</option>
          </Select>
        </div>
        <p className="mb-3 -mt-2 text-xs text-zinc-400">{rangeLabel(range)} · {formatHMS(rangeTotal)} tracked total</p>
        <div className="grid gap-6 sm:grid-cols-3">
          <TotalsList title="By activity tag" totals={tagTotals} />
          <TotalsList title="By category" totals={categoryTotals} />
          <TotalsList title="By priority" totals={priorityTotals} />
        </div>
      </Card>

      <Card>
        <SectionHeading title="Effort vs impact analysis" />
        <div className="grid gap-3 sm:grid-cols-4">
          {buckets.map((b) => (
            <div key={b.id} className="rounded-lg border border-zinc-100 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                <span className="size-2 rounded-full" style={{ backgroundColor: QUADRANTS[b.id].color }} />
                {QUADRANTS[b.id].label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">{b.tasks.length}</p>
            </div>
          ))}
        </div>
        {buckets.find((b) => b.id === "low-effort-high-impact")!.tasks.length > 0 ? (
          <div className="mt-4 border-t border-zinc-100 pt-3.5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Quick wins not started</p>
            <ul className="space-y-1.5">
              {buckets
                .find((b) => b.id === "low-effort-high-impact")!
                .tasks.slice(0, 5)
                .map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="text-sm text-zinc-700 hover:underline">
                      {t.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading title={`Overdue (${overdue.length})`} />
          {overdue.length === 0 ? (
            <Empty title="Nothing overdue" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {overdue.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-zinc-800 hover:underline">
                    {t.title}
                  </Link>
                  <PriorityPill snap={snap} priority={t.priority} />
                  <span className="text-xs text-red-600">due {t.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading title="Repeatedly exceeding estimates" />
          {overruns.length === 0 ? (
            <Empty title="Nothing over estimate" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {overruns.map((o) => (
                <li key={o.task.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/tasks/${o.task.id}`} className="min-w-0 flex-1 truncate text-zinc-800 hover:underline">
                    {o.task.title}
                  </Link>
                  <span className="text-xs tabular-nums text-red-600">+{formatHM(o.overrunSeconds)} over {formatHM(o.estimateMinutes * 60)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {carriedToday.length > 0 ? (
        <Card>
          <SectionHeading title={`Carried into today (${carriedToday.length})`} />
          <ul className="divide-y divide-zinc-100">
            {carriedToday.map((p) => {
              const t = snap.tasks.find((x) => x.id === p.taskId);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/tasks/${p.taskId}`} className="min-w-0 flex-1 truncate text-zinc-800 hover:underline">
                    {t?.title ?? "Unknown task"}
                  </Link>
                  <span className="text-xs text-zinc-400">from {p.carriedFrom}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bad" }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums", tone === "bad" ? "text-red-600" : "text-zinc-900")}>{value}</p>
    </div>
  );
}

function TotalsList({ title, totals }: { title: string; totals: { key: string; seconds: number }[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</p>
      {totals.length === 0 ? (
        <p className="text-sm text-zinc-300">No data</p>
      ) : (
        <div className="space-y-2">
          {totals.slice(0, 6).map((t) => (
            <HBar key={t.key} label={t.key} value={t.seconds} max={totals[0].seconds} />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CalendarX2, ChevronRight, Inbox, MoveRight, Sparkles, TriangleAlert } from "lucide-react";
import { useSnapshot, useNow } from "@/hooks/use-app";
import { carryForward } from "@/lib/client/api";
import {
  completionTrend,
  dayPlanSummary,
  fmtMin,
  isDone,
  overdueTasks,
  planForDate,
  recommendNext,
  secondsInDay,
  tagTotals,
  todayKey,
  utilPct,
} from "@/lib/derive";
import { formatClock, formatHM, formatHMS } from "@/lib/time";
import { summarizeTaskTime } from "@/lib/domain/timer";
import type { Snapshot } from "@/lib/types";
import { PageShell, Card, SectionHeading, Button, Empty, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";
import { StatCard, HBar } from "@/components/charts";
import { PriorityPill, StatusSelect } from "@/components/task-fragments";
import { TimerControl } from "@/components/timer-control";

export default function DashboardPage() {
  const snap = useSnapshot();
  const now = useNow(1000);
  const qc = useQueryClient();
  const today = todayKey();

  const carryMutation = useMutation({
    mutationFn: () => carryForward(snap.data?.carry ?? []),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast.success("Carried forward into today");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Carry forward failed"),
  });

  return (
    <PageShell
      title="Good overview"
      subtitle="What should I work on, and how is my time going?"
      actions={
        snap.data?.carry && snap.data.carry.length > 0 ? (
          <Button onClick={() => carryMutation.mutate()} loading={carryMutation.isPending}>
            <MoveRight className="size-4" />
            Carry {snap.data.carry.length} into today
          </Button>
        ) : undefined
      }
    >
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data ? <DashboardBody snap={snap.data} now={now} today={today} /> : null}
      </QueryState>
    </PageShell>
  );
}

function DashboardBody({ snap, now, today }: { snap: Snapshot; now: number; today: string }) {
  const plan = planForDate(snap, today);
  const summary = dayPlanSummary(snap, today);
  const actualSeconds = secondsInDay(snap.entries, today, now);
  const recommendations = recommendNext(snap, now, 3);
  const overdue = overdueTasks(snap, now);
  const tags = tagTotals(snap.entries, today, now);
  const trend = completionTrend(snap, 7, now);
  const taskInfo = new Map(snap.tasks.map((t) => [t.id, t]));
  const runningTasks = [...new Set(snap.entries.filter((e) => e.checkOut === null).map((e) => e.taskId))]
    .map((id) => taskInfo.get(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined && !isDone(t, snap));

  return (
    <div className="space-y-6">
      {snap.warnings.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-1">
            {snap.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Planned today" value={fmtMin(summary.plannedMinutes)} sub={`of ${snap.settings.workdayHours}h available`} />
        <StatCard label="Tracked today" value={formatHM(actualSeconds)} sub={`At ${formatClock(now)}`} />
        <StatCard
          label="Remaining"
          value={fmtMin(summary.remainingMinutes)}
          tone={summary.overAllocated ? "bad" : "default"}
          sub={summary.overAllocated ? `Over by ${fmtMin(summary.overByMinutes)}` : "left in the day"}
        />
        <StatCard
          label="Utilization"
          value={`${utilPct(actualSeconds, summary.plannedMinutes)}%`}
          tone={utilPct(actualSeconds, summary.plannedMinutes) > 100 ? "bad" : utilPct(actualSeconds, summary.plannedMinutes) > 70 ? "good" : "default"}
          sub={summary.plannedMinutes === 0 ? "nothing planned yet" : "of planned time"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeading
            title="Work on this now"
            actions={
              <Link href="/tasks" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
                All tasks →
              </Link>
            }
          />
          {recommendations.length === 0 ? (
            <Empty icon={<Inbox className="size-6 text-zinc-300" />} title="Nothing actionable right now" hint="Add a task or carry unfinished work into today." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recommendations.map(({ task, score, reasons, fitsRemaining }, i) => (
                <li key={task.id}>
                  <Link href={`/tasks/${task.id}`} className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-zinc-50 sm:px-2 -mx-2 rounded-lg">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{task.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                        {reasons.slice(0, 3).join(" · ")}
                        {!fitsRemaining ? <span className="text-amber-600">· won&apos;t fit today</span> : null}
                      </span>
                    </span>
                    <PriorityPill snap={snap} priority={task.priority} />
                    <span className="hidden text-xs tabular-nums text-zinc-400 sm:block">{score.toFixed(2)}</span>
                    <ChevronRight className="size-4 text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading title="Running"
            actions={
              <Link href="/tracker" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
                Tracker →
              </Link>
            }
          />
          {runningTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">No timers running.</p>
          ) : (
            <ul className="space-y-3">
              {runningTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <Link href={`/tasks/${t.id}`} className="truncate text-sm font-medium text-zinc-800 hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-xs tabular-nums text-emerald-600">
                    {formatHMS(summarizeTaskTime(snap.entries, t.id, now).totalSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <SectionHeading title="Today's plan" actions={<span className="text-xs tabular-nums text-zinc-400">{summary.plannedMinutes}m planned</span>} />
        {plan.length === 0 ? (
          <Empty
            icon={<CalendarX2 className="size-6 text-zinc-300" />}
            title="Nothing planned for today"
            hint={`Open the Daily Planner and allocate your ${snap.settings.workdayHours}h.`}
          />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {plan.map((item) => {
              const t = taskInfo.get(item.taskId);
              if (!t) return null;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-xs tabular-nums text-zinc-500">{fmtMin(item.plannedMinutes)}</span>
                  <StatusSelect taskId={t.id} status={t.status} snap={snap} />
                  <TimerControl
                    taskId={t.id}
                    entries={snap.entries.filter((e) => e.taskId === t.id)}
                    tags={snap.tags.map((x) => x.name)}
                    compact
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Time by activity tag · today" />
          {tags.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">No tracked time yet.</p>
          ) : (
            <div className="space-y-2.5">{tags.map((t) => <HBar key={t.tag} label={t.tag} value={t.seconds} max={tags[0].seconds} />)}</div>
          )}
        </Card>
        <Card>
          <SectionHeading title="Completed · last 7 days" />
          <div className="space-y-2.5">
            {trend.map((d) => (
              <HBar key={d.date} label={d.date.slice(5)} value={d.completed} max={Math.max(1, ...trend.map((x) => x.completed))} color="#0ca30c" />
            ))}
          </div>
        </Card>
      </div>

      {overdue.length > 0 ? (
        <Card className="border-red-100">
          <SectionHeading title="Overdue" />
          <ul className="space-y-2">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <Link href={`/tasks/${t.id}`} className="flex-1 truncate text-zinc-800 hover:underline">
                  {t.title}
                </Link>
                <span className="text-xs text-red-600">due {t.dueDate}</span>
                <ArrowRight className="size-3.5 text-zinc-300" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
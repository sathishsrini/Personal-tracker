import type { PriorityDef, RecommendationWeights, StatusDef, Task } from "../types";

export interface RecommendationInput {
  task: Task;
  priorityDef: PriorityDef | undefined;
  statusDef: StatusDef | undefined;
  remainingMinutesToday: number;
  now: number;
}

export interface RecommendationResult {
  score: number;
  overdue: boolean;
  dueSoon: boolean;
  fitsRemaining: boolean;
  reasons: string[];
}

export const DEFAULT_WEIGHTS: RecommendationWeights = {
  priority: 0.28,
  impact: 0.22,
  effort: 0.14,
  deadline: 0.2,
  fit: 0.1,
  planned: 0.03,
  momentum: 0.03,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Days between now and the due date; negative = overdue. Null due date -> null. */
function daysUntilDue(dueDate: string | null, now: number): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate + "T23:59:59").getTime();
  if (Number.isNaN(due)) return null;
  return (due - now) / 86_400_000;
}

/**
 * "What should I work on now?" — combines Priority + Impact + Effort +
 * Deadline + Available Time into a single 0..~1.3 score. Callers should
 * exclude done/cancelled tasks before ranking; blocked/need-clarity tasks
 * are still scored (for visibility) but get a penalty so they sink below
 * anything actually actionable.
 */
export function scoreTask(input: RecommendationInput, weights: RecommendationWeights = DEFAULT_WEIGHTS): RecommendationResult {
  const { task, priorityDef, remainingMinutesToday, now } = input;
  const reasons: string[] = [];

  const priorityScore = priorityDef?.weight ?? 0.4;
  if (priorityDef) reasons.push(`${priorityDef.name} priority`);

  const impactScore = task.impact !== null ? clamp01(task.impact / 10) : 0.4;
  const effortScore = task.effort !== null ? clamp01((11 - task.effort) / 10) : 0.5; // low effort scores higher

  const daysLeft = daysUntilDue(task.dueDate, now);
  const overdue = daysLeft !== null && daysLeft < 0;
  const dueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;
  let deadlineScore = 0.15; // no due date: mild baseline urgency
  if (daysLeft !== null) {
    if (overdue) {
      deadlineScore = 1;
      reasons.push(`Overdue by ${Math.ceil(Math.abs(daysLeft))}d`);
    } else {
      deadlineScore = clamp01(1 - daysLeft / 14);
      if (dueSoon) reasons.push("Due soon");
    }
  }

  const estimate = task.estimateMinutes;
  const fitsRemaining = estimate === null || estimate <= remainingMinutesToday;
  const fitScore = estimate === null ? 0.6 : estimate <= remainingMinutesToday ? 1 : clamp01(remainingMinutesToday / estimate);
  if (estimate !== null && !fitsRemaining) reasons.push("Longer than remaining time today");

  const plannedScore = 0; // reserved: bonus if already scheduled today (applied by caller with plan context)
  const momentumScore = input.statusDef?.group === "active" ? 1 : 0;
  if (momentumScore) reasons.push("Already in progress");

  let score =
    weights.priority * priorityScore +
    weights.impact * impactScore +
    weights.effort * effortScore +
    weights.deadline * deadlineScore +
    weights.fit * fitScore +
    weights.planned * plannedScore +
    weights.momentum * momentumScore;

  if (input.statusDef?.group === "waiting") {
    score *= 0.35;
    reasons.push(`Waiting: ${input.statusDef.name}`);
  }

  return { score, overdue, dueSoon, fitsRemaining, reasons };
}

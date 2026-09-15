import type { Task } from "../types";

export type QuadrantId = "low-effort-high-impact" | "low-effort-low-impact" | "high-effort-low-impact" | "high-effort-high-impact";

export interface QuadrantDef {
  id: QuadrantId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}

export const QUADRANTS: Record<QuadrantId, QuadrantDef> = {
  "low-effort-high-impact": {
    id: "low-effort-high-impact",
    label: "Quick Wins",
    shortLabel: "Low Effort · High Impact",
    description: "Small changes requiring little effort but providing significant value.",
    color: "#0ca30c",
  },
  "high-effort-high-impact": {
    id: "high-effort-high-impact",
    label: "Major Projects",
    shortLabel: "High Effort · High Impact",
    description: "Important tasks requiring significant effort and providing significant value.",
    color: "#2a78d6",
  },
  "low-effort-low-impact": {
    id: "low-effort-low-impact",
    label: "Fill-ins",
    shortLabel: "Low Effort · Low Impact",
    description: "Easy tasks with relatively low value.",
    color: "#898781",
  },
  "high-effort-low-impact": {
    id: "high-effort-low-impact",
    label: "Reconsider",
    shortLabel: "High Effort · Low Impact",
    description: "Tasks requiring significant effort but providing relatively low value.",
    color: "#d03b3b",
  },
};

/** Effort/impact are scored 1-10; `threshold` (default 5.5) is the split between "low" and "high". */
export function classifyQuadrant(effort: number | null, impact: number | null, threshold = 5.5): QuadrantId | null {
  if (effort === null || impact === null) return null;
  const highEffort = effort >= threshold;
  const highImpact = impact >= threshold;
  if (!highEffort && highImpact) return "low-effort-high-impact";
  if (highEffort && highImpact) return "high-effort-high-impact";
  if (!highEffort && !highImpact) return "low-effort-low-impact";
  return "high-effort-low-impact";
}

export function quadrantOf(task: Pick<Task, "effort" | "impact">, threshold?: number): QuadrantDef | null {
  const id = classifyQuadrant(task.effort, task.impact, threshold);
  return id ? QUADRANTS[id] : null;
}

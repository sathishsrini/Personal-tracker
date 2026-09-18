import { milestoneToRow, projectToRow, rowToMilestone, rowToProject } from "../mappers";
import { getStorage } from "../storage";
import { toLocalIso } from "../time";
import type { Milestone, Project } from "../types";
import { newId } from "./ids";

const DONE_LIKE = new Set(["done", "cancelled"]);

async function statusGroup(statusName: string): Promise<string | undefined> {
  const statuses = await getStorage().readTable("Statuses");
  return statuses.find((s) => s.name === statusName)?.group;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  status?: string;
  startDate?: string | null;
  targetDate?: string | null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (!input.name?.trim()) throw new Error("Project name is required");
  const storage = getStorage();
  const existing = await storage.readTable("Projects");
  const now = toLocalIso(Date.now());

  const project: Project = {
    id: newId(),
    name: input.name.trim(),
    description: input.description ?? "",
    color: input.color ?? "",
    status: input.status ?? "Yet to Start",
    startDate: input.startDate ?? null,
    targetDate: input.targetDate ?? null,
    order: existing.length,
    createdAt: now,
    updatedAt: now,
    completedAt: "",
    archived: false,
  };

  await storage.insertRow("Projects", projectToRow(project));
  return project;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  color?: string;
  status?: string;
  startDate?: string | null;
  targetDate?: string | null;
  order?: number;
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  const storage = getStorage();
  const rows = await storage.readTable("Projects");
  const existingRow = rows.find((r) => r.id === id);
  if (!existingRow) throw new Error(`Project ${id} not found`);
  const before = rowToProject(existingRow);

  const now = toLocalIso(Date.now());
  const next: Project = { ...before, ...patch, updatedAt: now };

  if (patch.status && patch.status !== before.status) {
    const group = await statusGroup(patch.status);
    next.completedAt = group && DONE_LIKE.has(group) ? before.completedAt || now : "";
  }

  await storage.updateRow("Projects", id, projectToRow(next));
  return next;
}

export async function archiveProject(id: string): Promise<void> {
  await getStorage().updateRow("Projects", id, { archived: "true", updatedAt: toLocalIso(Date.now()) });
}

export async function restoreProject(id: string): Promise<void> {
  await getStorage().updateRow("Projects", id, { archived: "false", updatedAt: toLocalIso(Date.now()) });
}

/**
 * Removes the project and its milestones, then unlinks — never deletes — the
 * tasks that pointed at them. A project is a grouping, so losing it must not
 * take the underlying work (and its tracked time) with it.
 */
export async function deleteProjectPermanently(id: string): Promise<void> {
  const storage = getStorage();
  const [milestones, tasks] = await Promise.all([storage.readTable("Milestones"), storage.readTable("Tasks")]);
  const now = toLocalIso(Date.now());

  await Promise.all([
    ...milestones.filter((m) => m.projectId === id).map((m) => storage.deleteRow("Milestones", m.id)),
    ...tasks.filter((t) => t.projectId === id).map((t) => storage.updateRow("Tasks", t.id, { projectId: "", milestoneId: "", updatedAt: now })),
  ]);
  await storage.deleteRow("Projects", id);
}

export interface CreateMilestoneInput {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  dueDate?: string | null;
  order?: number;
}

export async function createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
  if (!input.title?.trim()) throw new Error("Milestone title is required");
  if (!input.projectId?.trim()) throw new Error("A milestone must belong to a project");
  const storage = getStorage();
  const projects = await storage.readTable("Projects");
  if (!projects.some((p) => p.id === input.projectId)) throw new Error(`Project ${input.projectId} not found`);

  const existing = await storage.readTable("Milestones");
  const now = toLocalIso(Date.now());

  const milestone: Milestone = {
    id: newId(),
    projectId: input.projectId,
    title: input.title.trim(),
    description: input.description ?? "",
    status: input.status ?? "Yet to Start",
    dueDate: input.dueDate ?? null,
    order: input.order ?? existing.filter((m) => m.projectId === input.projectId).length,
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };

  await storage.insertRow("Milestones", milestoneToRow(milestone));
  return milestone;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  status?: string;
  dueDate?: string | null;
  order?: number;
}

export async function updateMilestone(id: string, patch: UpdateMilestoneInput): Promise<Milestone> {
  const storage = getStorage();
  const rows = await storage.readTable("Milestones");
  const existingRow = rows.find((r) => r.id === id);
  if (!existingRow) throw new Error(`Milestone ${id} not found`);
  const before = rowToMilestone(existingRow);

  const now = toLocalIso(Date.now());
  const next: Milestone = { ...before, ...patch, updatedAt: now };

  if (patch.status && patch.status !== before.status) {
    const group = await statusGroup(patch.status);
    next.completedAt = group && DONE_LIKE.has(group) ? before.completedAt || now : "";
  }

  await storage.updateRow("Milestones", id, milestoneToRow(next));
  return next;
}

/** Deletes the milestone and unlinks its tasks, which stay in their project. */
export async function deleteMilestone(id: string): Promise<void> {
  const storage = getStorage();
  const tasks = await storage.readTable("Tasks");
  const now = toLocalIso(Date.now());
  await Promise.all(tasks.filter((t) => t.milestoneId === id).map((t) => storage.updateRow("Tasks", t.id, { milestoneId: "", updatedAt: now })));
  await storage.deleteRow("Milestones", id);
}

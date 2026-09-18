import type { TableName } from "./types";

/**
 * Canonical spreadsheet schema.
 *
 * Each table's `columns` are written verbatim as the header row by the
 * schema-repair routine (see storage/sheets.ts `ensureSchema`). `aliases`
 * lets a column you already typed by hand (e.g. a bare "Task" or "Point"
 * column, per the "keep the sheet extremely simple" requirement) map onto
 * the canonical field without losing your data: the repair step renames
 * the header cell in place instead of adding a duplicate column.
 */
export interface ColumnSpec {
  /** Canonical header text written to the sheet. */
  header: string;
  /** Internal field key used everywhere else in the app. */
  key: string;
  /** Other header spellings that should be treated as this column. */
  aliases?: string[];
}

export interface TableSpec {
  sheetTitle: string;
  columns: ColumnSpec[];
  /** Column key that uniquely identifies a row, used for update-by-id. */
  idKey: string;
}

const col = (header: string, key: string, aliases?: string[]): ColumnSpec => ({ header, key, aliases });

export const PROJECTS_TABLE: TableSpec = {
  sheetTitle: "Projects",
  idKey: "id",
  columns: [
    col("Project ID", "id"),
    col("Project", "name", ["name", "project name", "title"]),
    col("Description", "description", ["desc"]),
    col("Color", "color", ["colour"]),
    col("Status", "status"),
    col("Start Date", "startDate", ["start", "kickoff"]),
    col("Target Date", "targetDate", ["target", "deadline", "end date"]),
    col("Order", "order", ["sort order"]),
    col("Created At", "createdAt", ["created"]),
    col("Updated At", "updatedAt"),
    col("Completed At", "completedAt"),
    col("Archived", "archived"),
  ],
};

export const MILESTONES_TABLE: TableSpec = {
  sheetTitle: "Milestones",
  idKey: "id",
  columns: [
    col("Milestone ID", "id"),
    col("Project ID", "projectId"),
    col("Milestone", "title", ["title", "name", "milestone name"]),
    col("Description", "description", ["desc"]),
    col("Status", "status"),
    col("Due Date", "dueDate", ["due", "target date"]),
    col("Order", "order", ["sort order"]),
    col("Created At", "createdAt", ["created"]),
    col("Updated At", "updatedAt"),
    col("Completed At", "completedAt"),
  ],
};

export const TASKS_TABLE: TableSpec = {
  sheetTitle: "Tasks",
  idKey: "id",
  columns: [
    col("Task ID", "id", ["id", "task id"]),
    col("Task", "title", ["title", "task", "point", "task name", "name", "task/point", "task / point"]),
    col("Description", "description", ["desc"]),
    col("Category", "category", ["project", "category/project"]),
    col("Project ID", "projectId"),
    col("Milestone ID", "milestoneId"),
    col("Type", "type", ["weekly or daily", "task type", "weekly/daily"]),
    col("Priority", "priority"),
    col("Status", "status"),
    col("Effort", "effort", ["effort/time", "effort score"]),
    col("Impact", "impact", ["impact score", "business impact", "weight"]),
    col("Estimate (min)", "estimateMinutes", ["estimated effort/time", "estimate", "estimated minutes"]),
    col("Due Date", "dueDate", ["due"]),
    col("Notes", "notes"),
    col("Progress %", "progress", ["progress"]),
    col("Order", "order", ["sort order", "priority order"]),
    col("Created Date", "createdAt", ["created"]),
    col("Updated At", "updatedAt"),
    col("Completed At", "completedAt"),
    col("Archived", "archived"),
  ],
};

export const SUBTASKS_TABLE: TableSpec = {
  sheetTitle: "Subtasks",
  idKey: "id",
  columns: [
    col("Subtask ID", "id"),
    col("Task ID", "taskId"),
    col("Title", "title", ["subtask"]),
    col("Status", "status"),
    col("Estimate (min)", "estimateMinutes"),
    col("Order", "order"),
    col("Notes", "notes"),
    col("Created At", "createdAt"),
    col("Updated At", "updatedAt"),
    col("Completed At", "completedAt"),
  ],
};

export const TIME_ENTRIES_TABLE: TableSpec = {
  sheetTitle: "TimeEntries",
  idKey: "id",
  columns: [
    col("Entry ID", "id"),
    col("Task ID", "taskId"),
    col("Subtask ID", "subtaskId"),
    col("Session ID", "sessionId"),
    col("Tag", "tag"),
    col("Check-in", "checkIn"),
    col("Check-out", "checkOut"),
    col("Duration (sec)", "durationSeconds"),
    col("End Reason", "endReason"),
    col("Source", "source"),
    col("Date", "date"),
    col("Note", "note"),
    col("Op ID", "opId"),
    col("Deleted", "deleted"),
    col("Created At", "createdAt"),
    col("Updated At", "updatedAt"),
  ],
};

export const DAILY_PLAN_TABLE: TableSpec = {
  sheetTitle: "DailyPlan",
  idKey: "id",
  columns: [
    col("Plan ID", "id"),
    col("Date", "date"),
    col("Task ID", "taskId"),
    col("Subtask ID", "subtaskId"),
    col("Planned (min)", "plannedMinutes"),
    col("Start Time", "startTime"),
    col("End Time", "endTime"),
    col("Parallel Group", "parallelGroup"),
    col("Order", "order"),
    col("Carried From", "carriedFrom"),
    col("Notes", "notes"),
    col("Created At", "createdAt"),
    col("Updated At", "updatedAt"),
  ],
};

export const WEEKLY_PLAN_TABLE: TableSpec = {
  sheetTitle: "WeeklyPlan",
  idKey: "id",
  columns: [
    col("Plan ID", "id"),
    col("Week Start", "weekStart"),
    col("Task ID", "taskId"),
    col("Planned (min)", "plannedMinutes"),
    col("Order", "order"),
    col("Carried From", "carriedFrom"),
    col("Notes", "notes"),
    col("Created At", "createdAt"),
    col("Updated At", "updatedAt"),
  ],
};

export const TASK_HISTORY_TABLE: TableSpec = {
  sheetTitle: "TaskHistory",
  idKey: "id",
  columns: [
    col("Event ID", "id"),
    col("Task ID", "taskId"),
    col("Timestamp", "timestamp"),
    col("Type", "type"),
    col("Kind", "kind"),
    col("Field", "field"),
    col("From", "from"),
    col("To", "to"),
    col("Message", "message"),
  ],
};

export const CATEGORIES_TABLE: TableSpec = {
  sheetTitle: "Categories",
  idKey: "name",
  columns: [col("Name", "name"), col("Color", "color"), col("Active", "active"), col("Order", "order")],
};

export const PRIORITIES_TABLE: TableSpec = {
  sheetTitle: "Priorities",
  idKey: "name",
  columns: [
    col("Name", "name"),
    col("Rank", "rank"),
    col("Weight", "weight"),
    col("Color", "color"),
  ],
};

export const STATUSES_TABLE: TableSpec = {
  sheetTitle: "Statuses",
  idKey: "name",
  columns: [
    col("Name", "name"),
    col("Group", "group"),
    col("Color", "color"),
    col("Order", "order"),
  ],
};

export const ACTIVITY_TAGS_TABLE: TableSpec = {
  sheetTitle: "ActivityTags",
  idKey: "name",
  columns: [col("Name", "name"), col("Color", "color"), col("Active", "active"), col("Order", "order")],
};

export const SETTINGS_TABLE: TableSpec = {
  sheetTitle: "Settings",
  idKey: "key",
  columns: [col("Key", "key"), col("Value", "value")],
};

// DashboardData and Reports are write-only export targets (#12/#13): the app
// renders reports live from the tables above and snapshots them here on
// request so they're readable/shareable directly from the spreadsheet too.
export const DASHBOARD_DATA_TABLE: TableSpec = {
  sheetTitle: "DashboardData",
  idKey: "metric",
  columns: [col("Metric", "metric"), col("Value", "value"), col("Updated At", "updatedAt")],
};

export const REPORTS_TABLE: TableSpec = {
  sheetTitle: "Reports",
  idKey: "id",
  columns: [
    col("Report ID", "id"),
    col("Generated At", "generatedAt"),
    col("Type", "type"),
    col("Range", "range"),
    col("Summary", "summary"),
  ],
};

export const ALL_TABLES: Record<TableName, TableSpec> = {
  Projects: PROJECTS_TABLE,
  Milestones: MILESTONES_TABLE,
  Tasks: TASKS_TABLE,
  Subtasks: SUBTASKS_TABLE,
  DailyPlan: DAILY_PLAN_TABLE,
  WeeklyPlan: WEEKLY_PLAN_TABLE,
  TimeEntries: TIME_ENTRIES_TABLE,
  TaskHistory: TASK_HISTORY_TABLE,
  Categories: CATEGORIES_TABLE,
  Priorities: PRIORITIES_TABLE,
  Statuses: STATUSES_TABLE,
  ActivityTags: ACTIVITY_TAGS_TABLE,
  DashboardData: DASHBOARD_DATA_TABLE,
  Reports: REPORTS_TABLE,
  Settings: SETTINGS_TABLE,
};

export const DEFAULT_CATEGORIES = ["General", "Work", "Personal", "Learning"];

export const DEFAULT_PRIORITIES: { name: string; rank: number; weight: number; color: string }[] = [
  { name: "Critical", rank: 1, weight: 1, color: "#d03b3b" },
  { name: "High", rank: 2, weight: 0.75, color: "#eb6834" },
  { name: "Medium", rank: 3, weight: 0.5, color: "#eda100" },
  { name: "Low", rank: 4, weight: 0.25, color: "#2a78d6" },
];

export const DEFAULT_STATUSES: { name: string; group: string; color: string; order: number }[] = [
  { name: "Yet to Start", group: "todo", color: "#898781", order: 1 },
  { name: "In Progress", group: "active", color: "#2a78d6", order: 2 },
  { name: "Partially Completed", group: "active", color: "#eda100", order: 3 },
  { name: "Blocked", group: "waiting", color: "#d03b3b", order: 4 },
  { name: "Need Clarity", group: "waiting", color: "#e87ba4", order: 5 },
  { name: "On Hold", group: "waiting", color: "#4a3aa7", order: 6 },
  { name: "Completed", group: "done", color: "#0ca30c", order: 7 },
  { name: "Closed", group: "done", color: "#008300", order: 8 },
  { name: "Cancelled", group: "cancelled", color: "#52514e", order: 9 },
];

export const DEFAULT_TAGS = [
  "Development",
  "Discussion",
  "Meeting",
  "Debugging",
  "Code Review",
  "Research",
  "Testing",
  "Documentation",
  "Planning",
  "Support",
  "Deployment",
  "Learning",
  "Other",
];

export const DEFAULT_TASK_TYPES = ["Daily", "Weekly"];

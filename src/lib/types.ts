export type TableName =
  | "Projects"
  | "Milestones"
  | "Tasks"
  | "Subtasks"
  | "DailyPlan"
  | "WeeklyPlan"
  | "TimeEntries"
  | "TaskHistory"
  | "Categories"
  | "Priorities"
  | "Statuses"
  | "ActivityTags"
  | "DashboardData"
  | "Reports"
  | "Settings";

/** A spreadsheet row keyed by canonical column name. */
export type Row = Record<string, string>;

export type StatusGroup = "todo" | "active" | "waiting" | "done" | "cancelled";

/** Why a time-entry segment ended. Empty while the segment is still running. */
export type EndReason = "" | "pause" | "stop" | "switch" | "auto";

/** A body of work that groups tasks and milestones. Status/colour reuse the shared Statuses lookup. */
export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  archived: boolean;
}

/** A dated checkpoint inside a project; tasks can be pinned to one. */
export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  projectId: string;
  milestoneId: string;
  type: string;
  priority: string;
  status: string;
  /** 1 (tiny) .. 10 (huge) */
  effort: number | null;
  /** 1 (negligible) .. 10 (critical to users/business) */
  impact: number | null;
  estimateMinutes: number | null;
  dueDate: string | null;
  notes: string;
  progress: number | null;
  /** Manual sort position within its priority group (lower = higher up); set by drag-and-drop reordering. */
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  archived: boolean;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  status: string;
  /** How much of the task this subtask represents. null means "not rated" and counts as 1. */
  weight: number | null;
  estimateMinutes: number | null;
  order: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  subtaskId: string;
  sessionId: string;
  tag: string;
  checkIn: number;
  checkOut: number | null;
  durationSeconds: number;
  endReason: EndReason;
  source: "timer" | "manual";
  date: string;
  note: string;
  opId: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DailyPlanItem {
  id: string;
  date: string;
  taskId: string;
  subtaskId: string;
  plannedMinutes: number;
  /** "HH:MM" 24h, or "" if this item is unscheduled (duration-only). When both are set, overlapping ranges are automatically treated as concurrent. */
  startTime: string;
  endTime: string;
  /** Items sharing a group are worked concurrently: the group costs its longest item, not the sum. Manual alternative to startTime/endTime overlap for untimed items. */
  parallelGroup: string;
  order: number;
  carriedFrom: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyPlanItem {
  id: string;
  weekStart: string;
  taskId: string;
  plannedMinutes: number;
  order: number;
  carriedFrom: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type HistoryType = "created" | "field" | "status" | "update" | "timer" | "entry" | "plan" | "subtask";

export interface HistoryItem {
  id: string;
  taskId: string;
  timestamp: string;
  type: HistoryType;
  kind: string;
  field: string;
  from: string;
  to: string;
  message: string;
}

export interface StatusDef {
  name: string;
  group: StatusGroup;
  color: string;
  order: number;
}

export interface PriorityDef {
  name: string;
  rank: number;
  /** 0..1 contribution to the recommendation score */
  weight: number;
  color: string;
}

export interface LookupItem {
  name: string;
  color: string;
  active: boolean;
  order: number;
}

export interface RecommendationWeights {
  priority: number;
  impact: number;
  effort: number;
  deadline: number;
  fit: number;
  planned: number;
  momentum: number;
}

export interface Settings {
  workdayHours: number;
  workdayStart: string;
  /** 0 = Sunday .. 6 = Saturday */
  workDays: number[];
  weekStartsOn: number;
  /** "concurrent" lets several tasks run timers at once; "single" pauses others on start. */
  timerMode: "concurrent" | "single";
  /** "split" divides overlapping time between concurrent tasks so an hour is never counted twice. */
  concurrencyMode: "split" | "full";
  maxTimerHours: number;
  quadrantThreshold: number;
  defaultTag: string;
  defaultCategory: string;
  defaultType: string;
  weights: RecommendationWeights;
}

export interface StorageInfo {
  kind: "sheets" | "local";
  label: string;
  url: string | null;
  lastSyncedAt: number | null;
  error: string | null;
}

/** A plan item that didn't finish on an earlier day and is eligible to carry forward. */
export interface CarrySuggestion {
  sourceDate: string;
  taskId: string;
  plannedMinutes: number;
  targetDate: string;
}

export type TimerAction = "start" | "pause" | "resume" | "stop" | "switch";

/** Client-side shape for a plan row being saved (id optional = server assigns). */
export interface PlanItemLike {
  id?: string;
  taskId: string;
  subtaskId?: string;
  plannedMinutes: number;
  startTime?: string;
  endTime?: string;
  parallelGroup?: string;
  order?: number;
  carriedFrom?: string;
  notes?: string;
}

export interface TimerActionResult {
  ok: boolean;
  action: TimerAction;
  taskId: string;
  /** Set when the op was rejected or could not change state. */
  message?: string;
  /** Set when an earlier identical op (opId) was already applied. */
  alreadyApplied?: boolean;
}

export interface Snapshot {
  serverNow: number;
  storage: StorageInfo;
  settings: Settings;
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  subtasks: Subtask[];
  entries: TimeEntry[];
  dailyPlan: DailyPlanItem[];
  weeklyPlan: WeeklyPlanItem[];
  history: HistoryItem[];
  categories: LookupItem[];
  priorities: PriorityDef[];
  statuses: StatusDef[];
  tags: LookupItem[];
  warnings: string[];
  carry: CarrySuggestion[];
}

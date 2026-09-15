import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Grid2x2,
  LayoutDashboard,
  ListTodo,
  Settings,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "Plan" | "Track" | "Review";
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Plan" },
  { href: "/tasks", label: "Task List", icon: ListTodo, section: "Plan" },
  { href: "/quadrant", label: "Quadrant", icon: Grid2x2, section: "Plan" },
  { href: "/planner/daily", label: "Daily Planner", icon: CalendarDays, section: "Plan" },
  { href: "/planner/weekly", label: "Weekly Planner", icon: CalendarClock, section: "Plan" },
  { href: "/tracker", label: "Time Tracker", icon: Timer, section: "Track" },
  { href: "/reports", label: "Reports", icon: BarChart3, section: "Review" },
  { href: "/settings", label: "Settings", icon: Settings, section: "Review" },
];

/** Pages that live outside the primary nav but are still reachable. */
export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tasks": "Task List",
  "/quadrant": "Effort vs Impact",
  "/planner/daily": "Daily Planner",
  "/planner/weekly": "Weekly Planner",
  "/tracker": "Time Tracker",
  "/reports": "Reports",
  "/settings": "Settings",
};

export function titleFor(pathname: string): string {
  if (pathname.startsWith("/tasks/")) return "Task Detail";
  return PAGE_TITLES[pathname] ?? "My Tracker";
}
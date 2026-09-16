"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Command } from "cmdk";
import { CheckCircle2, Command as CommandIcon, Database, RefreshCw, Search } from "lucide-react";
import { formatDateLabel, dateKey } from "@/lib/time";
import { useSnapshot, useSync } from "@/hooks/use-app";
import { NAV, titleFor } from "./nav";
import { cn } from "./ui";

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-3 py-4 md:px-5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-900 text-sm font-bold text-white">T</span>
      <span className="hidden text-sm font-semibold text-zinc-900 md:block">My Tracker</span>
    </Link>
  );
}

function StorageBadge() {
  const { data } = useSnapshot();
  const storage = data?.storage;
  const icon = storage?.kind === "sheets" ? <Database className="size-3" /> : <CheckCircle2 className="size-3" />;
  return (
    <div className="flex items-center gap-2 px-5 py-3 text-xs text-zinc-500" title={storage?.label ?? "Connecting…"}>
      {icon}
      <span className="hidden truncate md:block">{storage?.kind === "sheets" ? "Google Sheets" : "Local file"}</span>
    </div>
  );
}

function SyncButton() {
  const sync = useSync();
  return (
    <button
      onClick={() => void sync.mutate()}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
      title="Sync now — re-checks the spreadsheet's columns and refreshes all data"
    >
      <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} />
      <span className="hidden sm:inline">Sync</span>
    </button>
  );
}

function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const close = () => setOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-400 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-600"
      >
        <Search className="size-3.5" />
        <span className="hidden lg:inline">Search or jump…</span>
        <kbd className="hidden rounded border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px] text-zinc-400 md:inline">Ctrl K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/30 p-4 pt-[15vh]" onClick={close}>
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Command menu">
              <div className="flex items-center gap-2 border-b border-zinc-100 px-3">
                <Search className="size-4 text-zinc-400" />
                <Command.Input placeholder="Type to jump to a page…" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400" />
              </div>
              <Command.List className="max-h-72 overflow-y-auto p-2">
                <Command.Empty className="p-6 text-center text-sm text-zinc-400">No matches.</Command.Empty>
                <Command.Group heading={<span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pages</span>}>
                  {NAV.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => {
                        close();
                        router.push(item.href);
                      }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-700 aria-selected:bg-zinc-100"
                    >
                      <item.icon className="size-4 text-zinc-400" />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { data, queued } = useSnapshot();
  const runningCount = useMemo(
    () =>
      data
        ? new Set(
            data.entries.filter((e) => e.checkOut === null).map((e) => e.taskId)
          ).size
        : 0,
    [data]
  );

  const groups: ("Plan" | "Track" | "Review")[] = ["Plan", "Track", "Review"];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-16 flex-col border-r border-zinc-200 bg-white md:w-60 print:hidden">
      <Brand />
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2 md:px-3">
        {groups.map((section) => (
          <div key={section}>
            <p className="hidden px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 md:block">{section}</p>
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.section === section).map((item) => {
                const active = pathname === item.href || (item.href === "/tasks" && pathname.startsWith("/tasks/"));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.label}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors md:px-2.5",
                        active ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="hidden truncate md:block">{item.label}</span>
                      {item.href === "/tracker" && runningCount > 0 ? (
                        <span className="ml-auto hidden size-2 rounded-full bg-emerald-500 md:block" title={`${runningCount} timer(s) running`} />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-zinc-100">
        {queued > 0 ? (
          <div className="flex items-center gap-2 px-5 py-2 text-xs text-amber-600">
            <CommandIcon className="size-3" />
            <span>{queued} offline change(s) queued</span>
          </div>
        ) : null}
        <StorageBadge />
      </div>
    </aside>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-16 md:ml-60 print:ml-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur md:px-6 print:hidden">
          <h1 className="text-sm font-semibold text-zinc-800">{titleFor(pathname)}</h1>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-zinc-400 sm:block">{formatDateLabel(dateKey(), "long")}</span>
            <SyncButton />
            <CommandPalette />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
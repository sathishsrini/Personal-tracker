"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RotateCcw } from "lucide-react";
import { useSnapshot, useSync } from "@/hooks/use-app";
import { addLookupItem, deactivateLookupItem, reactivateLookupItem, updateLookupItem, updateSettings, type LookupTableName } from "@/lib/client/api";
import type { RecommendationWeights, Settings, Snapshot } from "@/lib/types";
import { Button, Card, ColorField, Field, Input, PageShell, Pill, Select, SectionHeading, cn } from "@/components/ui";
import { QueryState } from "@/components/page-states";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const WEIGHT_LABELS: { key: keyof RecommendationWeights; label: string; hint: string }[] = [
  { key: "priority", label: "Priority", hint: "Critical/High/Medium/Low weighting" },
  { key: "impact", label: "Impact", hint: "Value to user/business" },
  { key: "effort", label: "Effort", hint: "Favors quick, low-effort tasks" },
  { key: "deadline", label: "Deadline", hint: "Urgency as due date approaches" },
  { key: "fit", label: "Fits available time", hint: "Prefers tasks that fit today" },
  { key: "planned", label: "Already planned", hint: "Reserved for future use" },
  { key: "momentum", label: "Momentum", hint: "Bonus for in-progress work" },
];

export default function SettingsPage() {
  const snap = useSnapshot();
  return (
    <PageShell title="Settings" subtitle="Workday, timer behavior, recommendation weights, and lookup lists.">
      <QueryState isLoading={snap.isLoading} isError={snap.isError} error={snap.error}>
        {snap.data ? <SettingsBody snap={snap.data} /> : null}
      </QueryState>
    </PageShell>
  );
}

function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => updateSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save settings"),
  });
}

function SettingsBody({ snap }: { snap: Snapshot }) {
  const save = useSaveSettings();
  const sync = useSync();
  const s = snap.settings;

  function toggleDay(day: number) {
    const next = s.workDays.includes(day) ? s.workDays.filter((d) => d !== day) : [...s.workDays, day].sort();
    save.mutate({ workDays: next });
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeading title="Storage" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-600">
            <p className="font-medium text-zinc-900">{snap.storage.label}</p>
            {snap.storage.url ? (
              <a href={snap.storage.url} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 hover:underline">
                Open spreadsheet
              </a>
            ) : (
              <p className="text-xs text-zinc-400">Set GOOGLE_SHEETS_SPREADSHEET_ID + credentials to switch to Google Sheets.</p>
            )}
            {snap.storage.error ? <p className="text-xs text-red-500">{snap.storage.error}</p> : null}
          </div>
          <Button variant="secondary" onClick={() => sync.mutate()} loading={sync.isPending}>
            <RotateCcw className="size-4" /> Sync now
          </Button>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Workday" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hours per day">
            <Input type="number" min={1} max={16} defaultValue={s.workdayHours} onBlur={(e) => save.mutate({ workdayHours: Number(e.target.value) || 8 })} />
          </Field>
          <Field label="Start time">
            <Input type="time" defaultValue={s.workdayStart} onChange={(e) => save.mutate({ workdayStart: e.target.value })} />
          </Field>
          <Field label="Week starts on">
            <Select defaultValue={s.weekStartsOn} onChange={(e) => save.mutate({ weekStartsOn: Number(e.target.value) })}>
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">Work days</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                onClick={() => toggleDay(d.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  s.workDays.includes(d.value) ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Timer behavior" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Multiple timers" hint="Concurrent allows several tasks to run at once; single auto-pauses the rest.">
            <Select defaultValue={s.timerMode} onChange={(e) => save.mutate({ timerMode: e.target.value as Settings["timerMode"] })}>
              <option value="concurrent">Concurrent</option>
              <option value="single">Single (auto-pause others)</option>
            </Select>
          </Field>
          <Field label="Auto-close stale timers after" hint="Prevents a forgotten timer from running forever.">
            <Input type="number" min={1} max={24} defaultValue={s.maxTimerHours} onBlur={(e) => save.mutate({ maxTimerHours: Number(e.target.value) || 12 })} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Defaults" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Default category">
            <Select defaultValue={s.defaultCategory} onChange={(e) => save.mutate({ defaultCategory: e.target.value })}>
              {snap.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default type">
            <Select defaultValue={s.defaultType} onChange={(e) => save.mutate({ defaultType: e.target.value })}>
              <option>Daily</option>
              <option>Weekly</option>
            </Select>
          </Field>
          <Field label="Default activity tag">
            <Select defaultValue={s.defaultTag} onChange={(e) => save.mutate({ defaultTag: e.target.value })}>
              {snap.tags.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Quadrant" />
        <Field label={`Low / high split — ${s.quadrantThreshold}`} hint='Effort or impact at or above this counts as "high".'>
          <input
            type="range"
            min={2}
            max={9}
            step={0.5}
            defaultValue={s.quadrantThreshold}
            className="w-full accent-zinc-900"
            onChange={(e) => save.mutate({ quadrantThreshold: Number(e.target.value) })}
          />
        </Field>
      </Card>

      <Card>
        <SectionHeading title={'"What should I work on?" weighting'} />
        <div className="grid gap-4 sm:grid-cols-2">
          {WEIGHT_LABELS.map((w) => (
            <Field key={w.key} label={`${w.label} — ${s.weights[w.key].toFixed(2)}`} hint={w.hint}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                defaultValue={s.weights[w.key]}
                className="w-full accent-zinc-900"
                onChange={(e) => save.mutate({ weights: { ...s.weights, [w.key]: Number(e.target.value) } })}
              />
            </Field>
          ))}
        </div>
      </Card>

      <LookupsCard snap={snap} />
    </div>
  );
}

const TABLES: { key: LookupTableName; label: string }[] = [
  { key: "Categories", label: "Categories" },
  { key: "Priorities", label: "Priorities" },
  { key: "Statuses", label: "Statuses" },
  { key: "ActivityTags", label: "Activity tags" },
];

function LookupsCard({ snap }: { snap: Snapshot }) {
  const [table, setTable] = useState<LookupTableName>("Categories");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["snapshot"] });

  const items =
    table === "Categories" ? snap.categories : table === "ActivityTags" ? snap.tags : table === "Priorities" ? snap.priorities : snap.statuses;

  const toggle = useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) => (active ? reactivateLookupItem(table, name) : deactivateLookupItem(table, name)),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update"),
  });

  const recolor = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => updateLookupItem(table, name, { color }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not change color"),
  });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title="Lists" />
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {TABLES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTable(t.key)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", table === t.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mb-4 divide-y divide-zinc-100">
        {items.map((item) => {
          const active = "active" in item ? item.active : true;
          return (
            <li key={item.name} className="flex items-center gap-2.5 py-2">
              {"color" in item ? (
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : "#898781"}
                  onChange={(e) => recolor.mutate({ name: item.name, color: e.target.value })}
                  title="Change color"
                  className="size-5 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
                />
              ) : null}
              <Pill label={item.name} color={"color" in item ? item.color : undefined} className={cn(!active && "opacity-40")} />
              {table === "Priorities" && "rank" in item ? <span className="text-xs text-zinc-400">rank {item.rank} · weight {item.weight}</span> : null}
              {table === "Statuses" && "group" in item ? <span className="text-xs text-zinc-400">{item.group}</span> : null}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
                <input type="checkbox" checked={active} onChange={(e) => toggle.mutate({ name: item.name, active: e.target.checked })} />
                Active
              </label>
            </li>
          );
        })}
      </ul>

      <AddLookupForm table={table} onAdded={invalidate} />
    </Card>
  );
}

function AddLookupForm({ table, onAdded }: { table: LookupTableName; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [rank, setRank] = useState("5");
  const [weight, setWeight] = useState("0.5");
  const [group, setGroup] = useState("todo");

  const add = useMutation({
    mutationFn: () => {
      const values: Record<string, string | number> = { name: name.trim() };
      if (color) values.color = color;
      if (table === "Priorities") {
        values.rank = Number(rank);
        values.weight = Number(weight);
      }
      if (table === "Statuses") values.group = group;
      return addLookupItem(table, values);
    },
    onSuccess: () => {
      setName("");
      onAdded();
      toast.success(`Added to ${table}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add"),
  });

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) add.mutate();
      }}
    >
      <Field label="Name" className="min-w-40 flex-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${table.toLowerCase()}…`} />
      </Field>
      <Field label="Color" className="w-44">
        <ColorField value={color} onChange={setColor} />
      </Field>
      {table === "Priorities" ? (
        <>
          <Field label="Rank" className="w-20">
            <Input type="number" value={rank} onChange={(e) => setRank(e.target.value)} />
          </Field>
          <Field label="Weight" className="w-24">
            <Input type="number" min={0} max={1} step={0.05} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </>
      ) : null}
      {table === "Statuses" ? (
        <Field label="Group" className="w-40">
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="todo">To do</option>
            <option value="active">Active</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
      ) : null}
      <Button type="submit" variant="secondary" disabled={!name.trim()} loading={add.isPending}>
        <Plus className="size-4" /> Add
      </Button>
    </form>
  );
}

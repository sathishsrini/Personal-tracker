"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { reorderTasks } from "@/lib/client/api";
import { formatHM } from "@/lib/time";
import { summarizeTaskTime } from "@/lib/domain/timer";
import { todayKey } from "@/lib/derive";
import type { Snapshot, Task } from "@/lib/types";
import { Card, Pill, cn } from "@/components/ui";
import { SubtaskBadge } from "@/components/task-fragments";

type Columns = Record<string, string[]>;

function buildColumns(tasks: Task[], priorityNames: string[]): Columns {
  const cols: Columns = Object.fromEntries(priorityNames.map((p) => [p, []]));
  for (const p of priorityNames) {
    cols[p] = tasks
      .filter((t) => t.priority === p)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);
  }
  return cols;
}

/**
 * A priority-by-column board — drag a card up/down to reorder within a
 * priority, or across columns to re-prioritize it. Reorders are optimistic
 * (the column state updates immediately) and persisted as one batched
 * /api/tasks/reorder call once the drag ends.
 */
export function PriorityBoard({ tasks, snap, now }: { tasks: Task[]; snap: Snapshot; now: number }) {
  const priorityNames = useMemo(() => snap.priorities.map((p) => p.name), [snap.priorities]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [columns, setColumns] = useState<Columns>(() => buildColumns(tasks, priorityNames));
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragging = useRef(false);
  const qc = useQueryClient();

  // Re-seed from fresh server data whenever it changes — but never mid-drag,
  // which would yank cards out from under the pointer.
  useEffect(() => {
    if (dragging.current) return;
    setColumns(buildColumns(tasks, priorityNames));
  }, [tasks, priorityNames]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function locate(id: string): string | undefined {
    return Object.keys(columns).find((col) => columns[col].includes(id));
  }

  function handleDragStart(e: DragStartEvent) {
    dragging.current = true;
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeCol = locate(String(active.id));
    const overCol = columns[String(over.id)] ? String(over.id) : locate(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    setColumns((prev) => {
      const from = prev[activeCol].filter((id) => id !== active.id);
      const overIndex = prev[overCol].indexOf(String(over.id));
      const to = [...prev[overCol]];
      to.splice(overIndex >= 0 ? overIndex : to.length, 0, String(active.id));
      return { ...prev, [activeCol]: from, [overCol]: to };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    dragging.current = false;
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeCol = locate(String(active.id));
    const overCol = columns[String(over.id)] ? String(over.id) : locate(String(over.id));
    if (!activeCol || !overCol) return;

    let finalColumns = columns;
    if (activeCol === overCol && active.id !== over.id) {
      const items = columns[activeCol];
      const from = items.indexOf(String(active.id));
      const to = items.indexOf(String(over.id));
      if (from !== -1 && to !== -1) {
        finalColumns = { ...columns, [activeCol]: arrayMove(items, from, to) };
        setColumns(finalColumns);
      }
    }

    // Persist every touched column's order, plus a priority change if the card moved columns.
    const touchedCols = new Set([activeCol, overCol]);
    const updates = Array.from(touchedCols).flatMap((col) =>
      finalColumns[col].map((id, index) => ({
        id,
        order: index,
        priority: taskById.get(id)?.priority !== col ? col : undefined,
      }))
    );
    if (updates.length === 0) return;
    reorderTasks(updates)
      .then(() => qc.invalidateQueries({ queryKey: ["snapshot"] }))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save the new order"));
  }

  const activeTask = activeId ? taskById.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        dragging.current = false;
        setActiveId(null);
      }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {priorityNames.map((name) => (
          <PriorityColumn
            key={name}
            name={name}
            color={snap.priorities.find((p) => p.name === name)?.color}
            taskIds={columns[name] ?? []}
            taskById={taskById}
            snap={snap}
            now={now}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} snap={snap} now={now} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function PriorityColumn({
  name,
  color,
  taskIds,
  taskById,
  snap,
  now,
}: {
  name: string;
  color: string | undefined;
  taskIds: string[];
  taskById: Map<string, Task>;
  snap: Snapshot;
  now: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: name });
  return (
    <div ref={setNodeRef} className={cn("flex min-h-40 flex-col gap-2 rounded-xl border border-dashed p-2.5 transition-colors", isOver ? "border-zinc-400 bg-zinc-50" : "border-zinc-200")}>
      <div className="flex items-center gap-1.5 px-1">
        <span className="size-2 rounded-full" style={{ backgroundColor: color || "#898781" }} />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{name}</span>
        <span className="ml-auto text-xs tabular-nums text-zinc-300">{taskIds.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {taskIds.map((id) => {
            const task = taskById.get(id);
            return task ? <SortableTaskCard key={id} task={task} snap={snap} now={now} /> : null;
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({ task, snap, now }: { task: Task; snap: Snapshot; now: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <TaskCard task={task} snap={snap} now={now} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TaskCard({
  task,
  snap,
  now,
  overlay = false,
  dragHandleProps,
}: {
  task: Task;
  snap: Snapshot;
  now: number;
  overlay?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  const total = summarizeTaskTime(snap.entries.filter((e) => e.taskId === task.id), task.id, now).totalSeconds;
  const overdue = task.dueDate && task.dueDate < todayKey();
  const statusColor = snap.statuses.find((s) => s.name === task.status)?.color;
  const subtasks = snap.subtasks.filter((s) => s.taskId === task.id);
  const doneStatus = snap.statuses.find((s) => s.group === "done")?.name;
  const subtasksDone = subtasks.filter((s) => s.status === doneStatus).length;

  return (
    <Card className={cn("space-y-1.5 p-2.5", overlay && "rotate-2 shadow-xl")}>
      <div className="flex items-start gap-1.5">
        <button {...dragHandleProps} className="mt-0.5 shrink-0 cursor-grab touch-none text-zinc-300 hover:text-zinc-500 active:cursor-grabbing" aria-label="Drag to reorder">
          <GripVertical className="size-3.5" />
        </button>
        <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 hover:underline" onClick={(e) => overlay && e.preventDefault()}>
          {task.title}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <Pill label={task.status} color={statusColor} />
        {subtasks.length > 0 ? <SubtaskBadge done={subtasksDone} total={subtasks.length} /> : null}
        {task.estimateMinutes !== null || total > 0 ? (
          <span className="text-xs tabular-nums text-zinc-400">{formatHM(total)}{task.estimateMinutes !== null ? ` / ${formatHM(task.estimateMinutes * 60)}` : ""}</span>
        ) : null}
        {task.dueDate ? <span className={cn("text-xs tabular-nums", overdue ? "font-medium text-red-500" : "text-zinc-400")}>{task.dueDate}</span> : null}
      </div>
    </Card>
  );
}

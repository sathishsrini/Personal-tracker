"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Spinner } from "./ui";

export function QueryState({
  isLoading,
  isError,
  error,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-400">
        <Spinner /> Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-red-600">
        <AlertTriangle className="size-4" />
        {error?.message ?? "Could not load data"}
      </div>
    );
  }
  return <>{children}</>;
}
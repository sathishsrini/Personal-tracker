"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { startOfflineHandler } from "@/hooks/use-app";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 2, staleTime: 5_000, refetchOnWindowFocus: false } },
      })
  );

  useEffect(() => {
    startOfflineHandler();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
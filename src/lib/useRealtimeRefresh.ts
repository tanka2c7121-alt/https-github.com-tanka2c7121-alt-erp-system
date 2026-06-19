"use client";

import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

type RealtimeEvent = "*" | "INSERT" | "UPDATE" | "DELETE";

export type RealtimeRefreshTable = {
  table: string;
  event?: RealtimeEvent;
  filter?: string;
};

type UseRealtimeRefreshOptions = {
  channelName: string;
  tables: RealtimeRefreshTable[];
  onRefresh: () => void | Promise<void>;
  debounceMs?: number;
  enabled?: boolean;
};

export function useRealtimeRefresh({
  channelName,
  tables,
  onRefresh,
  debounceMs = 1200,
  enabled = true,
}: UseRealtimeRefreshOptions) {
  const refreshRef = useRef(onRefresh);
  const timerRef = useRef<number | null>(null);
  const channelInstanceRef = useRef(0);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    channelInstanceRef.current += 1;
    const channel = supabase.channel(
      `${channelName}-${channelInstanceRef.current}-${Date.now()}`
    );
    const scheduleRefresh = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        void refreshRef.current();
      }, debounceMs);
    };

    tables.forEach(({ table, event = "*", filter }) => {
      channel.on(
        "postgres_changes",
        {
          event,
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        scheduleRefresh
      );
    });

    void channel.subscribe();

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled, tables]);
}

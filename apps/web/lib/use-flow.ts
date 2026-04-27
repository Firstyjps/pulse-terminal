"use client";

import { useEffect, useState } from "react";

export interface FlowState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFlow<T>(url: string, refreshKey?: number): FlowState<T> {
  const [state, setState] = useState<FlowState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : "Error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, refreshKey]);

  return state;
}

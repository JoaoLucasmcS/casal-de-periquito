import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { Me } from "./types";

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

/** O "me" já carregado (as telas internas só aparecem com login) */
export function useMeStrict(): Me {
  const { data } = useMe();
  if (!data) throw new Error("useMeStrict fora da área logada");
  return data;
}

export function usePending() {
  return useQuery({ queryKey: ["pending"], queryFn: api.pending });
}

export function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["event"] });
    qc.invalidateQueries({ queryKey: ["pending"] });
    qc.invalidateQueries({ queryKey: ["rejected"] });
    qc.invalidateQueries({ queryKey: ["reset-requests"] });
  };
}

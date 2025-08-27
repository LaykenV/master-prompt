import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useSelfStatus() {
  const selfStatus = useQuery(api.usage.getSelfStatus);

  const percentRemaining = selfStatus?.usage?.limitCents 
    ? Math.max(0, Math.min(100, Math.round((Number(selfStatus.usage.limitCents) - Number(selfStatus.usage.totalCents)) / Number(selfStatus.usage.limitCents) * 100)))
    : 0;

  const isOverLimit = selfStatus ? !selfStatus.canSend : false;

  return {
    ...selfStatus,
    percentRemaining,
    isOverLimit,
  };
}

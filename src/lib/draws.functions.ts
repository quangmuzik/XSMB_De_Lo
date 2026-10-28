import { createServerFn } from "@tanstack/react-start";

export const loadDraws = createServerFn({ method: "GET" }).handler(async () => {
  const { syncDraws } = await import("@/lib/xsmb-sync.server");
  return syncDraws(false);
});

export const refreshDraws = createServerFn({ method: "POST" }).handler(async () => {
  const { syncDraws } = await import("@/lib/xsmb-sync.server");
  return syncDraws(true);
});

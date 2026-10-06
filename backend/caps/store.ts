import type { CapRegistry } from "./types.ts";

const data = new Map<string, unknown>();

export const storeCaps: CapRegistry = {
  "store.get": async (p: { key: string }) => (data.has(p.key) ? data.get(p.key) : null),

  "store.set": async (p: { key: string; value: unknown }) => {
    data.set(p.key, p.value);
    return true;
  },

  "store.delete": async (p: { key: string }) => data.delete(p.key),

  "store.has": async (p: { key: string }) => data.has(p.key),

  "store.keys": async () => [...data.keys()],
};

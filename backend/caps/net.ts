import type { CapRegistry } from "./types.ts";

export const netCaps: CapRegistry = {
  "nw.fetch": async (p: { url: string }) => {
    const res = await fetch(p.url);
    const text = await res.text();
    return { status: res.status, url: res.url, text };
  },
};

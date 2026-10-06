import { fsCaps } from "./fs.ts";
import { netCaps } from "./net.ts";
import { storeCaps } from "./store.ts";
import type { CapRegistry } from "./types.ts";

export type { CapHandler, CapRegistry } from "./types.ts";

export const capabilities: CapRegistry = {
  ...fsCaps,
  ...netCaps,
  ...storeCaps,
};

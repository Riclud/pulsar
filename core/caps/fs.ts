import { promises as fs } from "node:fs";
import type { CapRegistry } from "./types.ts";

export const fsCaps: CapRegistry = {
  "fs.readFile": async (p: { path: string }) => fs.readFile(p.path, "utf8"),

  "fs.writeFile": async (p: { path: string; content: string }) => {
    await fs.writeFile(p.path, p.content, "utf8");
    return true;
  },

  "fs.listDir": async (p: { path?: string }) => {
    const entries = await fs.readdir(p.path ?? ".", { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
  },

  "fs.exists": async (p: { path: string }) => {
    try {
      await fs.access(p.path);
      return true;
    } catch {
      return false;
    }
  },
};

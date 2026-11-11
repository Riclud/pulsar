#!/usr/bin/env bun
import { spawnSync } from "child_process"
import { resolve } from "path"
import { cmakeParallel } from "../cli/jobs.ts"

const root = resolve(import.meta.dir, "..")

const run = (args: string[]): void => {
  const result = spawnSync("cmake", args, { cwd: root, stdio: "inherit" })

  if (result.status !== 0) process.exit(result.status ?? 1)
}

// The job count follows the cores and the free memory; PULSAR_BUILD_JOBS overrides it.
run(["-S", ".", "-B", "build", "-DCMAKE_BUILD_TYPE=Release"])
run(["--build", "build", ...cmakeParallel()])

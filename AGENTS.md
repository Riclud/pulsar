# Pulsar: notes for coding agents

Pulsar builds native desktop and Android apps from TypeScript, drawn by Qt. Code style: `~/.claude/skills/my-code-style/SKILL.md` for TS/JS and commits.

## Build

- First time: `bun install`, then `bun run setup` (cmake configure into `build/`, Unix Makefiles; do not change that generator).
- Rebuild: `bun run build` (Release). Tests rebuild what they need on their own.
- ccache is used automatically when installed (CMakeLists.txt); nothing to configure.
- Parallel compile jobs (`bun run build`, the test runner, `pulsar build --target android`) follow the cores and the available memory, about 1.5 GB per job (`cli/jobs.ts`). `PULSAR_BUILD_JOBS=n` overrides it. A machine without swap can freeze under heavy parallel builds: enable swap (zram is enough) or lower the count.

## Quick check after each step

Run `bun run test:changed`. It selects suites from files changed against main (committed, staged, unstaged, untracked) and runs only those. `--dry-run` prints the selection; `--files a b` tries a list without changing anything. Unknown paths select the full suite.

| Changed                                 | Selected                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| docs, site, markdown                    | nothing                                                                                               |
| `*.test.ts` in core or cli              | unit                                                                                                  |
| `core/sdk`                              | unit (UI tree files: ui, jsx, reactive, nav, theme, responsive also run regressions and embedded-qml) |
| `core/caps`                             | unit, portable, embedded                                                                              |
| `core/runtime`, `core/platform`         | unit, portable, embedded, embedded-qml, smoke                                                         |
| `cli`                                   | unit, smoke                                                                                           |
| `host/`, QML, `CMakeLists.txt`          | rebuild, then embedded, embedded-qml, regressions, error-overlay, smoke                               |
| `tests/` fixtures, `scripts/<suite>.ts` | that suite                                                                                            |

Single suites: `bun scripts/test.ts regressions smoke`, or `bun scripts/embedded-regressions.ts <scenario>` for one scenario.
Type and style: `bun run typecheck`, `bun run lint`, `bun run fmt:check`.

## Full suite

`bun run test` builds once, then runs unit, portable, embedded, embedded-qml, regressions, error-overlay and smoke concurrently and prints a summary. Run it once at the end of a batch of changes and before every push, not after each edit.

- `PULSAR_TEST_JOBS=n` sets the parallelism of the runner, regressions and smoke (default: half the cores, and at most one job per 2.5 GB of available RAM). `PULSAR_TEST_JOBS=1` is the old strictly serial run; use it to tell a real failure from a load-related one.
- Timing-sensitive regression scenarios (`serial: true` in `scripts/embedded-regressions.ts`) run one at a time in their own lane.
- `PULSAR_TEST_PREBUILT=1` makes the scripts skip their own cmake build (the runner sets it).

## Offscreen testing

Run the host without a display: `QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software`. The scripts set `QT_QPA_PLATFORM` themselves.

## Known flaky tests

- smoke: the auto-click check (JS-built UI step, `PULSAR_UI_AUTOCLICK_MS`) can miss under load.
- regressions: `canvas` can fail on a loaded machine.

Re-run the single suite or scenario, and with `PULSAR_TEST_JOBS=1`, before treating either as a real failure.

## Releases and git

- Pushing to main ships `install.sh` and `install.ps1` at once. Do not push without being asked; no tags, no publishing.
- Conventional Commits, small commits, no `Co-Authored-By` line, no `--no-verify`, no amend of pushed history.

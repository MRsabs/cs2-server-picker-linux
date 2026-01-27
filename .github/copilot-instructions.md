# Copilot instructions — cs2-server-picker-linux

Purpose
- Short: single-file Deno tool to fetch CS2 relay servers by location and optionally block them via kernel "blackhole" routes.

Big picture
- Single entry: [main.ts](main.ts). The script fetches Steam SDR config, writes it to `/tmp/cs2_relays.json`, parses `data.pops` to build a Map<code, ips[]>, pings the first IP per location, and exposes an interactive menu to block/unblock by location code.
- Blocking mechanism: `ip route add blackhole <ip>` / `ip route del blackhole <ip>` (kernel-level, system `ip` command). Blocked IPs are persisted to `/var/lib/cs2-blocker/blocked_ips.txt`.

Key files
- [main.ts](main.ts): entire program and the authoritative place for behavior and constants (API_URL, TEMP_JSON, STATE_DIR, STATE_FILE).
- [deno.json](deno.json): defined `tasks` (build, build-linux, start) and formatting settings. Use these for consistent builds.

Runtime & permissions
- This tool requires root for route changes. The script checks `Deno.uid()` and will exit if not root when needed.
- Required system binaries: `ping` (iputils expected) and `ip` (iproute2). The script validates `ping -V` contains "iputils".
- Deno permissions: `--allow-net --allow-run --allow-read --allow-write --allow-sys` (see `deno.json` tasks).

Developer workflows
- Build a native binary (Linux x86_64): `deno task build-linux` (uses the `build-linux` task in [deno.json](deno.json)).
- Build generic executable: `deno task build`.
- Run interactively (recommended via sudo):
  - `sudo deno run --allow-net --allow-run --allow-read --allow-write --allow-sys main.ts`
  - or use the `start` task defined in `deno.json`.
- Quick checks before running: `which ping` and `which ip`. If blocking code is being changed, test non-blocking flows first (fetch/parse/ping) without root.

Project-specific conventions & patterns
- Minimal, single-file implementation. New features should preserve the simple structure unless adding substantial functionality.
- State persistence: use `STATE_DIR` and `STATE_FILE` constants in `main.ts`. The code expects one IP per line in the state file.
- Location handling: the tool only pings and shows the first IP for each location code; blocking/unblocking acts on all reported IPs for a code but status/summary is based on the first IP.
- IP filtering: uses `isValidIP()` and `isPrivateIP()` helper functions — private/local addresses are explicitly skipped.
- External commands invoked with `Deno.Command`/`output()` and `outputSync()`; return codes are used to decide success.

Editing guidance for AI agents
- Prefer small, focused edits to `main.ts`. If you change behavior that affects persisted state or the system commands, update constants at the top (`TEMP_JSON`, `STATE_DIR`, `STATE_FILE`) and adjust permission hints in `deno.json`.
- When adding tests or automation, avoid running `blockIp`/`unblockIp` in CI; instead mock `Deno.Command` or isolate routes to a test namespace.
- If introducing dependencies, prefer standard Deno std modules and document added permissions in `deno.json` tasks.

Examples (use as direct references)
- Where parsing occurs: see `parseRelays()` in [main.ts](main.ts).
- Where block state is stored: `STATE_FILE` constant at top of [main.ts](main.ts).
- How pinging is done: `pingAll()` calls `ping()` which runs `ping -c 2 -W 1 <ip>` and parses output for average latency.

If anything in these notes is unclear or you'd like more detail (examples of test mocks, alternate unblock strategies, or a small refactor plan), tell me which part to expand.

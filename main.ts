#!/usr/bin/env -S deno run --allow-net --allow-run --allow-read --allow-write=/var/lib/cs2-blocker

// Simplified CS2 Server Picker - minimal, inline style
// Features: fetch relays, parse IPv4, ping, block/unblock (kernel blackhole), state file-based unblock-all

const API_URL = "https://api.steampowered.com/ISteamApps/GetSDRConfig/v1?appid=730";
const TEMP_JSON = "/tmp/cs2_relays.json";
const STATE_DIR = "/var/lib/cs2-blocker";
const STATE_FILE = `${STATE_DIR}/blocked_ips.txt`;

const colors = {
  RED: "\x1b[0;31m",
  GREEN: "\x1b[0;32m",
  YELLOW: "\x1b[1;33m",
  CYAN: "\x1b[0;36m",
  NC: "\x1b[0m",
};

function print(msg: string) {
  console.log(msg);
}
function info(msg: string) {
  console.log(`${colors.YELLOW}[INFO]${colors.NC} ${msg}`);
}
function success(msg: string) {
  console.log(`${colors.GREEN}[OK]${colors.NC} ${msg}`);
}
function error(msg: string) {
  console.log(`${colors.RED}[ERR]${colors.NC} ${msg}`);
}

function isValidIP(ip: string) {
  return /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);
}

function isPrivateIP(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4) return false;
  if (p[0] === 127) return true;
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  return false;
}

async function ensureStateDir() {
  try {
    await Deno.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  } catch {}
}

async function readState(): Promise<string[]> {
  try {
    const txt = await Deno.readTextFile(STATE_FILE);
    return txt.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeState(ips: string[]) {
  await ensureStateDir();
  await Deno.writeTextFile(STATE_FILE, ips.join("\n") + (ips.length ? "\n" : ""), { mode: 0o600 });
}

async function addState(ip: string) {
  const ips = await readState();
  if (!ips.includes(ip)) {
    ips.push(ip);
    await writeState(ips);
  }
}

async function removeState(ip: string) {
  const ips = (await readState()).filter((i) => i !== ip);
  await writeState(ips);
}

async function fetchRelays() {
  info("Fetching relay list...");
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const txt = await res.text();
    await Deno.writeTextFile(TEMP_JSON, txt);
    success("Relay data fetched");
  } catch (e) {
    error(`Failed fetch: ${e}`);
    Deno.exit(1);
  }
}

function parseRelays(): Map<string, { name: string; ips: string[] }> {
  const map = new Map<string, { name: string; ips: string[] }>();
  try {
    const txt = Deno.readTextFileSync(TEMP_JSON);
    const data = JSON.parse(txt);
    if (!data.pops) return map;
    for (const [code, pop] of Object.entries(data.pops)) {
      const popRec = pop as Record<string, unknown>;
      const relays = popRec.relays as unknown;
      if (!Array.isArray(relays)) continue;
      const ips: string[] = [];
      const name = typeof popRec.desc === "string" ? popRec.desc : (typeof popRec.name === "string" ? popRec.name : "");
      for (const r of relays as Array<unknown>) {
        if (!r || typeof r !== "object") continue;
        const rRec = r as Record<string, unknown>;
        const ipv4 = typeof rRec.ipv4 === "string" ? (rRec.ipv4 as string) : undefined;
        if (ipv4 && isValidIP(ipv4) && !isPrivateIP(ipv4)) ips.push(ipv4);
      }
      if (ips.length) map.set(String(code), { name, ips });
    }
  } catch {
    // ignore
  }
  return map;
}

async function ping(ip: string): Promise<number | null> {
  try {
    const cmd = new Deno.Command("ping", { args: ["-c", "5", "-W", "1", ip], stdout: "piped", stderr: "piped" });
    const { stdout } = await cmd.output();
    const out = new TextDecoder().decode(stdout);
    const m = out.match(/avg[^=]*=\s*[\d.]+\/(\d+\.\d+)/) || out.match(/= [\d.]+\/(\d+\.\d+)\//);
    if (m) return Math.round(parseFloat(m[1]));
    return null;
  } catch {
    return null;
  }
}

async function pingAll(locMap: Map<string, { name: string; ips: string[] }>) {
  info("Pinging first IP of each location...");
  const results = new Map<string, string>();
  await Promise.all(
    Array.from(locMap.entries()).map(async ([code, obj]) => {
      const first = obj.ips[0];
      const p = await ping(first);
      results.set(code, p === null ? "TIMEOUT" : `${p}ms`);
    }),
  );
  return results;
}

function showTable(locMap: Map<string, { name: string; ips: string[] }>, pings: Map<string, string>, blocked: Map<string, string>) {
  // Sort entries by ping (lowest to highest)
  const entries = Array.from(locMap.entries()).sort(([codeA], [codeB]) => {
    const pingA = pings.get(codeA) || "N/A";
    const pingB = pings.get(codeB) || "N/A";
    const numA = pingA === "TIMEOUT" ? Infinity : pingA === "N/A" ? Infinity : parseInt(pingA);
    const numB = pingB === "TIMEOUT" ? Infinity : pingB === "N/A" ? Infinity : parseInt(pingB);
    return numA - numB;
  });

  const rows = entries.map(([code, obj]) => {
    const ping = pings.get(code) || "N/A";
    const status = blocked.get(code) || "UNKN";
    const label = obj.name || "";
    return {
      Code: code,
      Label: label,
      Ping: ping,
      Status: status,
    };
  });

  console.table(rows);
}

async function isBlockedIp(ip: string) {
  try {
    const cmd = new Deno.Command("ip", { args: ["route", "show", ip], stdout: "piped", stderr: "piped" });
    const { stdout } = await cmd.output();
    const out = new TextDecoder().decode(stdout);
    return out.includes("blackhole");
  } catch {
    return false;
  }
}

async function blockIp(ip: string) {
  try {
    const check = await isBlockedIp(ip);
    if (check) return false;
    const cmd = new Deno.Command("ip", { args: ["route", "add", "blackhole", ip] });
    const r = await cmd.output();
    return r.code === 0;
  } catch {
    return false;
  }
}

async function unblockIp(ip: string) {
  try {
    const check = await isBlockedIp(ip);
    if (!check) return false;
    const cmd = new Deno.Command("ip", { args: ["route", "del", "blackhole", ip] });
    const r = await cmd.output();
    return r.code === 0;
  } catch {
    return false;
  }
}

async function readLine(prompt: string) {
  await Deno.stdout.write(new TextEncoder().encode(prompt));
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n === null) return "";
  return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

async function main() {
  // Require root privileges for `ip route` operations
  try {
    if (Deno.uid && Deno.uid() !== 0) {
      error("Please run as root or with sudo");
      Deno.exit(1);
    }
  } catch {
    // If uid() isn't available for some reason, continue and let commands fail
  }
  try {
    new Deno.Command("which", { args: ["ping"] }).outputSync();
  } catch {
    error("`ping` not found");
    Deno.exit(1);
  }
  try {
    new Deno.Command("which", { args: ["ip"] }).outputSync();
  } catch {
    error("`ip` not found");
    Deno.exit(1);
  }

  // Verify `ping` is from iputils (common on Debian/Ubuntu/CentOS/Arch)
  try {
    const { stdout, stderr } = await new Deno.Command("ping", { args: ["-V"], stdout: "piped", stderr: "piped" }).output();
    const out = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
    if (!/iputils/i.test(out)) {
      error("`ping` does not appear to be iputils; aborting");
      Deno.exit(1);
    }
  } catch {
    error("Failed to execute `ping -V` to verify implementation");
    Deno.exit(1);
  }

  await fetchRelays();
  const locs = parseRelays();
  if (locs.size === 0) {
    error("No locations found");
    Deno.exit(1);
  }

  const pings = await pingAll(locs);

  const blocked = new Map<string, string>();
  for (const [code, obj] of locs.entries()) {
    const ip = obj.ips[0];
    const b = await isBlockedIp(ip);
    blocked.set(code, b ? "BLOCKED" : "UNBLOCKED");
  }

  // clear screen
  console.clear();
  print("\nCurrent server locations and statuses:");
  showTable(locs, pings, blocked);
  while (true) {
    // horizontal separator
    print("\n----------------------------------------");
    print("\nMenu:");
    print("1) Ping all locations");
    print("2) Block location (enter code)");
    print("3) Unblock location (enter code)");
    print("4) Show blocked routes (state file)");
    print("5) Unblock all (state file)");
    print("0) Exit");

    const choice = await readLine("\nSelect: ");
    if (choice === "0") break;

    if (choice === "1") {
      // clear screen
      console.clear();
      const newPings = await pingAll(locs);
      for (const [k, v] of newPings) pings.set(k, v);
      info("Pinged all");
      showTable(locs, pings, blocked);
      continue;
    }

    if (choice === "2") {
      // clear screen
      console.clear();
      // show table
      showTable(locs, pings, blocked);
      const code = (await readLine("Enter location code to block: ")).trim();
      const loc = locs.get(code);
      const ips = loc?.ips;
      if (!ips) {
        error("Unknown code");
        continue;
      }
      for (const ip of ips) {
        if (!isValidIP(ip) || isPrivateIP(ip)) {
          error(`Skipping ${ip}`);
          continue;
        }
        const ok = await blockIp(ip);
        if (ok) {
          await addState(ip);
          print(`Blocked ${ip}`);
        } else print(`Failed ${ip}`);
      }
      blocked.set(code, "BLOCKED");
      showTable(locs, pings, blocked);
      continue;
    }

    if (choice === "3") {
      // clear screen
      console.clear();
      // show table
      showTable(locs, pings, blocked);
      const code = (await readLine("Enter location code to unblock: ")).trim();
      const loc = locs.get(code);
      const ips = loc?.ips;
      if (!ips) {
        error("Unknown code");
        continue;
      }
      for (const ip of ips) {
        if (!isValidIP(ip)) {
          error(`Skipping ${ip}`);
          continue;
        }
        const ok = await unblockIp(ip);
        if (ok) {
          await removeState(ip);
          print(`Unblocked ${ip}`);
        } else print(`Not blocked ${ip}`);
      }
      blocked.set(code, "UNBLOCKED");
      continue;
    }

    if (choice === "4") {
      // clear screen
      console.clear();
      const ips = await readState();
      if (ips.length === 0) {
        print("No blocked routes recorded");
        continue;
      }
      print(`Recorded ${ips.length} IP(s):`);
      for (const ip of ips) {
        const b = await isBlockedIp(ip);
        print(`  ${ip} - ${b ? "BLOCKED" : "MISSING"}`);
      }
      continue;
    }

    if (choice === "5") {
      // clear screen
      console.clear();
      // show table
      showTable(locs, pings, blocked);
      const ips = await readState();
      if (ips.length === 0) {
        print("No blocked routes recorded");
        continue;
      }
      // Filter valid IPs, then unblock in parallel
      const valid = ips.filter(isValidIP);
      const results = await Promise.all(valid.map(async (ip) => ({ ip, ok: await unblockIp(ip) })));
      let unblocked = 0;
      for (const r of results) {
        if (r.ok) {
          unblocked++;
          print(`Unblocked ${r.ip}`);
        } else print(`Failed ${r.ip}`);
      }
      // Remaining IPs are those that either were invalid or failed to unblock
      const remaining = ips.filter((ip) => !results.some((r) => r.ip === ip && r.ok));
      await writeState(remaining);
      success(`Unblocked ${unblocked} IP(s)`);
      // Refresh blocked map for first IPs
      await Promise.all(
        Array.from(locs.entries()).map(async ([code, obj]) => {
          const b = await isBlockedIp(obj.ips[0]);
          blocked.set(code, b ? "BLOCKED" : "UNBLOCKED");
        }),
      );
      continue;
    }

    print("Unknown option");
  }

  success("Goodbye");
}

if (import.meta.main) main();

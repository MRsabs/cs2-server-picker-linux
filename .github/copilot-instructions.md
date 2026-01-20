# CS2 Server Picker - AI Agent Instructions

## Project Overview
Tool to block CS2 relay servers by location using **kernel-level IP route blackholes**, not iptables. Critical distinction: iptables doesn't work because CS2 runs in Steam's pressure-vessel container which bypasses OUTPUT chain rules. Blackholes operate at the kernel routing layer before network namespaces.

## Architecture & Key Files
- **main.ts**: Interactive CLI for blocking/unblocking CS2 relay IPs (~800 lines)
  - Includes "Unblock all" functionality (menu option 5) to remove all blocks
- **State file**: `/var/lib/cs2-blocker/blocked_ips.txt` (mode 0o600, dir mode 0o700)
- **API**: `https://api.steampowered.com/ISteamApps/GetSDRConfig/v1?appid=730`

## Critical Technical Decisions

### Why Blackholes, Not Iptables
- CS2 runs in containerized environment (Steam pressure-vessel)
- Iptables OUTPUT chain rules show 0 packet counters → traffic bypasses them
- IP route blackholes: `ip route add blackhole <ip>` works at kernel level BEFORE containers
- Blocks ALL protocols (TCP, UDP, ICMP) with one command

### State Management Pattern
Since blackhole routes have no comment system (unlike iptables), use dedicated state file at `/var/lib/cs2-blocker/blocked_ips.txt` to track script-managed routes. This distinguishes our routes from user-created ones and survives reboots (don't use `/tmp`).

## Security Patterns (DO NOT SKIP)
Always validate IPs before blocking/unblocking:

```typescript
// IP validation regex - IPv4 only
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Private/localhost ranges to REFUSE blocking
- 127.0.0.0/8 (localhost)
- 10.0.0.0/8 (private)
- 172.16.0.0/12 (private)
- 192.168.0.0/16 (private)
- 169.254.0.0/16 (link-local)
```

Apply validation in: `parseLocations()`, `blockLocation()`, `unblockLocation()`, and unblock all functionality.

## Key Commands
```bash
# Block IP (kernel blackhole)
ip route add blackhole <ip>

# Check if blocked
ip route show <ip>  # Output contains "blackhole" if blocked

# Unblock
ip route del blackhole <ip>

# Run main script
sudo deno run --allow-net --allow-run --allow-read --allow-write=/var/lib/cs2-blocker main.ts

# Or use compiled version
sudo ./cs2-blocker
```

## Data Flow
1. Fetch relay data from Steam API → `/tmp/cs2_relays.json`
2. Parse `pops` object, extract IPv4 from `relays[]` array
3. Validate IPs (skip private ranges from API)
4. Concurrent ping all locations with `Promise.all()`
5. Sort display by ping (low to high)
6. Block: `ip route add blackhole <ip>` + add to state file
7. Unblock: `ip route del blackhole <ip>` + remove from state file

## Conventions
- **Colors**: Use existing `colors` object for consistent terminal output
- **Permissions**: State dir 0o700, state file 0o600
- **Ping display**: Integer values only (`Math.round()`)
- **Location sorting**: By ping value (low to high) in both display and selection
- **Index selection**: 1-based (match displayed table numbers)
- **Error handling**: Always validate IPs, catch all `Deno.Command` errors

## Important Gotchas
- **Steam API parsing**: Check `data.pops[popCode].relays` is array before iterating
- **Container bypass**: Never suggest iptables for this use case - blackholes only
- **State file location**: `/var/lib/` not `/tmp/` (survives reboot)
- **Menu option 4**: Shows blocked routes (state file), not all iptables rules
- **Relay routing**: CS2 may route through alternate relays even when one is blocked (e.g., Dubai → Mumbai fallback). Acknowledge this limitation in docs.

## Testing Workflow
1. Run as non-root → should fail with "run as root or with sudo"
2. Block location → verify `ip route show <ip>` contains "blackhole"
3. Check state file → should contain blocked IP
4. Unblock → verify route removed and IP removed from state file
5. Use option 5 (Unblock all) → should remove all routes tracked in state file

## Debugging
- Check iptables packet counters: If 0, iptables isn't seeing traffic (containerization issue)
- Test blackhole: `ping <blocked-ip>` should show "Network is unreachable"
- State file missing: Script creates it automatically on first block
- Permission denied: Need sudo for `ip route` commands

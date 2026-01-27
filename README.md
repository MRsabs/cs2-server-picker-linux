CS2 Server Picker

Small Deno tool to fetch CS2/Steam relay POPs, show ping/status, and optionally block POP IPs via kernel blackhole routes.

Quick start

- Recommended: download the prebuilt binary from the Releases page:

	Visit https://github.com/MRsabs/cs2-server-picker-linux/releases and download `cs2-server-picker-linux`.

- Make it executable:

```bash
chmod +x cs2-server-picker-linux
```

- Run with elevated privileges (required for kernel route changes):

```bash
sudo ./cs2-server-picker-linux
```

- Alternative (build/run from source): clone the repo and run the script with `deno`:

```bash
git clone https://github.com/MRsabs/cs2-server-picker-linux.git
cd cs2-server-picker-linux
sudo deno run --allow-net --allow-run --allow-read --allow-write=/var/lib/cs2-blocker --allow-sys main.ts
```

Notes

- Blocking/unblocking requires root (uses `ip route add|del blackhole`).
- Requires system binaries: `ping` (iputils) and `ip` (iproute2).
- Blocked IPs are persisted to `/var/lib/cs2-blocker/blocked_ips.txt`.
- The script only pings the first public IPv4 per POP and uses the POP `desc`/`name` for display.
# CS2 Server Picker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deno](https://img.shields.io/badge/deno-v1.x-blue.svg)](https://deno.land/)
[![GitHub release](https://img.shields.io/github/v/release/YOUR_USERNAME/cs2-server-picker-linux)](https://github.com/YOUR_USERNAME/cs2-server-picker-linux/releases)

Block high-ping CS2 servers by location using kernel-level IP route blackholes.

## Features

- Ping test all CS2 relay locations
- Block/unblock servers by location
- Interactive menu
- Persistent across reboots
- Safe IP validation (won't block localhost/private networks)

## Requirements

- Linux (x86_64)
- sudo/root access

## Installation

Download from [releases](https://github.com/YOUR_USERNAME/cs2-server-picker-linux/releases):

```bash
chmod +x cs2-server-picker-linux
sudo ./cs2-server-picker-linux
```

Or build from source:

```bash
curl -fsSL https://deno.land/install.sh | sh
git clone https://github.com/YOUR_USERNAME/cs2-server-picker-linux.git
cd cs2-server-picker-linux
deno task build
sudo ./cs2-server-picker
```

## Usage

```bash
sudo ./cs2-server-picker-linux
```

Menu options:
1. Ping all locations
2. Block selection (e.g., `1,3,5`)
3. Unblock selection
4. Show blocked routes
5. Unblock all
6. Refresh data
0. Exit

## How It Works

Uses `ip route add blackhole <ip>` to block relay servers at kernel level. Works with containerized apps (iptables doesn't). State tracked in `/var/lib/cs2-blocker/blocked_ips.txt`.

## Troubleshooting

**Can't connect to any servers?**  
Use option 5 to unblock all.

**Not working?**  
Restart CS2, re-apply blocks, then search for a new match.

**API fetch failed?**  
Check internet connection, try again.

## Limitations

- IPv4 only
- Linux only
- CS2 may route around blocks through alternate relays (e.g., Dubai → Mumbai fallback)

## Uninstall

```bash
sudo ./cs2-server-picker-linux  # Option 5 to unblock all
rm cs2-server-picker-linux
sudo rm -rf /var/lib/cs2-blocker
```

## License

MIT - see [LICENSE](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

---

**Not affiliated with Valve Corporation or Counter-Strike 2.**
# cs2-server-picker-linux
# cs2-server-picker-linux

# CS2 Server Picker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deno](https://img.shields.io/badge/deno-v1.x-blue.svg)](https://deno.land/)
[![GitHub release](https://img.shields.io/github/v/release/YOUR_USERNAME/cs2-server-picker-linux)](https://github.com/YOUR_USERNAME/cs2-server-picker-linux/releases)

A simple tool to block high-ping Counter-Strike 2 servers by location. Stop getting matched to laggy servers far away from you!

## What Does This Do?

This tool lets you:
- See all CS2 server locations and their ping
- Block specific locations (like Dubai, Singapore, etc.)
- Unblock them anytime
- Check which locations are currently blocked

**Example:** If you're in Europe and keep getting matched to Asian servers with 200+ ping, you can block those locations and improve your matchmaking experience.

## Requirements

- **Linux** computer (Ubuntu, Debian, Fedora, etc.)
- **Deno** - A modern JavaScript/TypeScript runtime (installation shown below)
- **sudo/root access** - Administrator privileges required for network routing
- **IPv4 network** - Currently supports IPv4 relay addresses only

That's it! No complicated setup.

## Installation

### Option 1: Download Pre-compiled Executables (Recommended)

1. **Download** the latest release from [GitHub releases](https://github.com/YOUR_USERNAME/cs2-server-picker-linux/releases)
2. **Make executable** (if needed):
   ```bash
   chmod +x cs2-server-picker-linux
   ```
3. **Run** the tool:
   ```bash
   sudo ./cs2-server-picker-linux
   ```
   
   Or double-click the executable from your file manager (it will open a terminal automatically)

### Option 2: Build from Source

1. **Install Deno** (if not already installed):
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```Tool

If using compiled executable:
```bash
sudo ./cs2-server-picker-linux
```

If running from source:
```bash
sudo deno run --allow-net --allow-run --allow-read --allow-write=/var/lib/cs2-blocker main.ts
```

Note: State directory remains `/var/lib/cs2-blocker` for compatibility.
   ```bash
   ./build.sh
   ```

4. **Run** the compiled executables:
   ```bash
   sudo ./cs2-blocker
   sudo ./cs2-blocker-reset
   ```

### Option 3: Run from Source (Development)

If you want to modify the code or run directly:
```bash
sudo deno run --allow-net --allow-run --allow-read --allow-write=/var/lib/cs2-blocker main.ts
```

Note: State directory remains `/var/lib/cs2-blocker` for compatibility.

## Usage

### Main Script

Run the main blocking tool:

```bash
sudo deno run --allow-net --allow-run --allow-read --allow-write=/var/lib/cs2-blocker main.ts
```

**Menu Options:**
1. **Ping all locations** - Tests latency to all relay servers
2. **Block selection** - Block servers by entering location numbers (e.g., `1,3,5`)
3. **Unblock selection** - Unblock previously blocked servers
4. **Show blocked routes** - Display currently blocked CS2 relay IPs
5. **UnbloTool

If using compiled executable:
```bash
sudo ./cs2-blocker-reset
```

If running from source:
### Reset Script

Remove all blocks created by this tool:

```bash
sudo deno run --allow-run reset.ts
```

This will:
- Remove all blackhole routes tracked in the state file
- Clear the state file
- Not touch any routes created by other tools

## How It Works

### Blocking Mechanism

The tool uses **IP route blackholes** at the kernel level:

```bash
ip route add blackhole <relay-ip>
```

This approach:
- Operates at the kernel routing layer (before iptables)
- Works with containerized applications (Steam pressure-vessel)
- Blocks ALL protocols (TCP, UDP, ICMP, etc.)
- Cannot be bypassed by application-level routing

### State Management

Blocked IPs are tracked in: `/var/lib/cs2-blocker/blocked_ips.txt`

- Persists across reboots
- Only manages routes created by this tool
- Restrictive permissions (600) for security

## Security Features

✅ **IP Validation**
- Validates IPv4 format before blocking
- Refuses to block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Refuses to block localhost (127.0.0.0/8)
- Refuses to block link-local addresses (169.254.0.0/16)

✅ **Safe Operations**
- Only removes routes tracked in state file
- Validates all IPs from Steam API
- Requires explicit sudo/root privileges
- State file has restrictive permissions (700 for directory, 600 for file)

✅ **Error Handling**
- Graceful handling of missing dependencies
- Non-destructive failures
- Clear error messages

## Troubleshooting

### "Please run as root or with sudo"
The script requires root privileges to modify routing tables. Always run with `sudo`.

### "Missing dependencies"
Install required packages:
```bash
# Ubuntu/Debian
sudo apt-get install iptables iputils-ping

# RHEL/CentOS/Fedora
sudo yum install iptables iputils
```

### Blocks not working in CS2
1. Use option 5 to unblock all locations (clears state)
2. Restart CS2 completely
3. Re-run the tool and re-apply blocks
4. Test in matchmaking (blocks may take effect on next match search)

### "Failed to fetch data from Steam API"
- Check your internet connection
- Steam API may be temporarily down
- Try again in a few moments

### Can't ping/connect to any servers
Use option 5 in the menu (Unblock all locations) to remove all blocks, or run from terminal:
```bash
sudo ./cs2-server-picker-linux
# Then select option 5
```

## Uninstallation
** using the tool:
   ```bash
   sudo ./cs2-blocker
   # Select option 5 (Unblock all locations)
   ```

2. **Delete the executable:**
   ```bash
   rm cs2-blocker
   rm -rf ~/Desktop/cs2
   ```

3. **Remove state directory (optional):**
   ```bash
   sudo rm -rf /var/lib/cs2-blocker
   ```
Disclaimer

This tool modifies system network routing. Use at your own risk. Always:
- Test in a safe environment first
- Keep the reset script handy
- Don't block too many locations (may prevent matchmaking)
- Understand that this blocks relay infrastructure, not specific game servers
- **Note:** CS2 may still connect you to a blocked region by routing through another relay node. For example, blocking Dubai servers might not prevent connections to Dubai game servers if CS2 routes your traffic through Mumbai or another nearby relay instead.

**Not affiliated with Valve Corporation or Counter-Strike 2.**

---

## For Technical Users
# Limitations

- **IPv4 only** - Currently only blocks IPv4 relay addresses
- **Linux only** - Uses Linux-specific `ip route` commands
- **Relay servers only** - Blocks relay infrastructure, not game server IPs directly
- **No GUI** - Terminal/command-line interface only

### Contributing

Contributions welcome! Areas for improvement:
- IPv6 support
- GUI/TUI interface
- Whitelist management
- Auto-block high ping servers
- Systemd service integration
- GUI/TUI interface
- Whitelist management
- Auto-block high ping servers
- Systemd service integration

## Disclaimer

This tool modifies system network routing. Use at your own risk. Always:
- Test in a safe environment first
- Keep the reset script handy
- Don't block too many locations (may prevent matchmaking)
- Understand that this blocks relay infrastructure, not specific game servers
- **Note:** CS2 may still connect you to a blocked region by routing through another relay node. For example, blocking Dubai servers might not prevent connections to Dubai game servers if CS2 routes your traffic through Mumbai or another nearby relay instead.

**Not affiliated with Valve Corporation or Counter-Strike 2.**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions, please open an issue on the [GitHub repository](https://github.com/YOUR_USERNAME/cs2-server-picker-linux).

---

**Made with ❤️ for the CS2 community**
# cs2-server-picker-linux
# cs2-server-picker-linux
# cs2-server-picker-linux

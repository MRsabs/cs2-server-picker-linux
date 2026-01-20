#!/usr/bin/env -S deno run --allow-net --allow-run --allow-read --allow-write=/tmp

/**
 * CS2 Server Picker
 * Block CS2 relay servers by location to control matchmaking
 * Run with sudo privileges
 */

// Auto-launch in terminal if double-clicked
async function ensureTerminal() {
  // Check if running in terminal
  if (!Deno.stdin.isTerminal()) {
    const execPath = Deno.execPath();
    
    // Try different terminal emulators
    const terminals = [
      ['gnome-terminal', '--', 'bash', '-c', `sudo '${execPath}'; echo ''; echo 'Press Enter to exit...'; read`],
      ['konsole', '-e', 'bash', '-c', `sudo '${execPath}'; echo ''; echo 'Press Enter to exit...'; read`],
      ['xfce4-terminal', '-e', `bash -c "sudo '${execPath}'; echo ''; echo 'Press Enter to exit...'; read"`],
      ['xterm', '-e', `bash -c "sudo '${execPath}'; echo ''; echo 'Press Enter to exit...'; read"`],
    ];
    
    for (const [cmd, ...args] of terminals) {
      try {
        const process = new Deno.Command(cmd, { args });
        await process.spawn();
        Deno.exit(0);
      } catch {
        // Try next terminal
      }
    }
    
    // No terminal found, exit
    console.error('No terminal emulator found. Please run from terminal with: sudo ' + execPath);
    Deno.exit(1);
  }
}

await ensureTerminal();

// Colors for output
const colors = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  CYAN: '\x1b[0;36m',
  NC: '\x1b[0m', // No Color
};

// API URL
const API_URL = 'https://api.steampowered.com/ISteamApps/GetSDRConfig/v1?appid=730';

// Temporary files
const TEMP_JSON = '/tmp/cs2_relays.json';
const STATE_DIR = '/var/lib/cs2-blocker';
const STATE_FILE = `${STATE_DIR}/blocked_ips.txt`;

// Configuration
// Routes are managed using 'ip route' blackhole entries

// Ensure state directory exists
async function ensureStateDir() {
  try {
    await Deno.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // Directory already exists or error - ignore
  }
}

// Validate IP address format
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

// Check if IP is private/localhost to prevent blocking critical addresses
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  // Localhost
  if (parts[0] === 127) return true;
  // Private ranges
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  // Link local
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}

// State file management
async function addToStateFile(ip: string) {
  try {
    await ensureStateDir();
    
    let ips: string[] = [];
    try {
      const content = await Deno.readTextFile(STATE_FILE);
      ips = content.split('\n').filter(line => line.trim());
    } catch {
      // File doesn't exist yet
    }
    
    if (!ips.includes(ip)) {
      ips.push(ip);
      await Deno.writeTextFile(STATE_FILE, ips.join('\n') + '\n', { mode: 0o600 });
    }
  } catch (error) {
    printError(`Failed to update state file: ${error}`);
  }
}

async function removeFromStateFile(ip: string) {
  try {
    let ips: string[] = [];
    try {
      const content = await Deno.readTextFile(STATE_FILE);
      ips = content.split('\n').filter(line => line.trim());
    } catch {
      return;
    }
    
    ips = ips.filter(i => i !== ip);
    await Deno.writeTextFile(STATE_FILE, ips.join('\n') + '\n');
  } catch (error) {
    printError(`Failed to update state file: ${error}`);
  }
}

async function isInStateFile(ip: string): Promise<boolean> {
  try {
    const content = await Deno.readTextFile(STATE_FILE);
    const ips = content.split('\n').filter(line => line.trim());
    return ips.includes(ip);
  } catch {
    return false;
  }
}

// Location data storage
interface LocationData {
  names: Map<string, string>;
  ips: Map<string, string[]>;
  pings: Map<string, string>;
  blocked: Map<string, string>;
}

const locationData: LocationData = {
  names: new Map(),
  ips: new Map(),
  pings: new Map(),
  blocked: new Map(),
};

// Helper functions
function printHeader() {
  console.log(`${colors.BLUE}`);
  console.log('=========================================');
  console.log('    CS2 Server Picker v1.0.0');
  console.log('=========================================');
  console.log(`${colors.NC}`);
}

function printError(msg: string) {
  console.log(`${colors.RED}[ERROR]${colors.NC} ${msg}`);
}

function printSuccess(msg: string) {
  console.log(`${colors.GREEN}[SUCCESS]${colors.NC} ${msg}`);
}

function printInfo(msg: string) {
  console.log(`${colors.YELLOW}[INFO]${colors.NC} ${msg}`);
}

async function checkDependencies() {
  const commands = ['iptables', 'ip6tables', 'ping'];
  const missing: string[] = [];

  for (const cmd of commands) {
    try {
      const process = new Deno.Command('which', { args: [cmd] });
      const { code } = await process.output();
      if (code !== 0) {
        missing.push(cmd);
      }
    } catch {
      missing.push(cmd);
    }
  }

  if (missing.length > 0) {
    printError('Missing dependencies:');
    for (const dep of missing) {
      console.log(`  - ${dep}`);
    }
    console.log('\nPlease install missing packages:');
    console.log('  Ubuntu/Debian: sudo apt-get install iptables iputils-ping');
    console.log('  RHEL/CentOS: sudo yum install iptables iputils');
    Deno.exit(1);
  }
}

function checkRoot() {
  if (Deno.uid() !== 0) {
    printError('Please run as root or with sudo');
    Deno.exit(1);
  }
}

async function fetchRelays() {
  printInfo('Fetching CS2 relay information from Steam API...');

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.text();
    await Deno.writeTextFile(TEMP_JSON, data);
    
    // Validate JSON
    JSON.parse(data);
    
    printSuccess('API data fetched successfully');
  } catch (error) {
    printError(`Failed to fetch data from Steam API: ${error}`);
    Deno.exit(1);
  }
}

async function parseLocations() {
  printInfo('Parsing relay locations...');

  try {
    const jsonText = await Deno.readTextFile(TEMP_JSON);
    const data = JSON.parse(jsonText);

    if (!data.pops) {
      printError('No relay locations found');
      Deno.exit(1);
    }

    for (const [popCode, popData] of Object.entries(data.pops as Record<string, any>)) {
      const locationDesc = popData.desc;
      const ipv4List: string[] = [];

      if (popData.relays && Array.isArray(popData.relays)) {
        for (const relay of popData.relays) {
          if (relay.ipv4) {
            const ip = relay.ipv4;
            // Validate IP format and ensure it's not private/localhost
            if (isValidIP(ip) && !isPrivateIP(ip)) {
              ipv4List.push(ip);
            } else if (isPrivateIP(ip)) {
              printError(`Skipping private/localhost IP: ${ip}`);
            }
          }
        }
      }

      if (ipv4List.length > 0) {
        locationData.names.set(popCode, locationDesc);
        locationData.ips.set(popCode, ipv4List);
      }
    }

    printSuccess(`Found ${locationData.names.size} relay locations`);
  } catch (error) {
    printError(`Failed to parse locations: ${error}`);
    Deno.exit(1);
  }
}

async function pingLocation(popCode: string) {
  const ips = locationData.ips.get(popCode);
  if (!ips || ips.length === 0) {
    locationData.pings.set(popCode, 'N/A');
    return;
  }

  const firstIp = ips[0];

  try {
    const command = new Deno.Command('ping', {
      args: ['-c', '2', '-W', '1', firstIp],
      stdout: 'piped',
      stderr: 'piped',
    });

    const { stdout } = await command.output();
    const output = new TextDecoder().decode(stdout);
    
    const match = output.match(/avg[^=]*=\s*[\d.]+\/([\d.]+)/);
    if (match) {
      const pingValue = Math.round(parseFloat(match[1]));
      locationData.pings.set(popCode, `${pingValue}ms`);
    } else {
      locationData.pings.set(popCode, 'TIMEOUT');
    }
  } catch {
    locationData.pings.set(popCode, 'TIMEOUT');
  }
}

async function pingAllLocations() {
  console.log('');
  printInfo('Pinging all locations (this may take a moment)...');
  console.log('');

  const popCodes = Array.from(locationData.names.keys());
  const total = popCodes.length;

  console.log(`  Starting ${total} ping tests concurrently...`);

  // Ping all locations concurrently
  await Promise.all(popCodes.map(popCode => pingLocation(popCode)));

  console.log('');
  printSuccess('Ping test completed');
}

async function checkLocationBlocked(popCode: string) {
  const ips = locationData.ips.get(popCode);
  if (!ips || ips.length === 0) {
    locationData.blocked.set(popCode, 'UNKNOWN');
    return;
  }

  let allBlocked = true;

  for (const ip of ips) {
    try {
      const checkRoute = new Deno.Command('ip', {
        args: ['route', 'show', ip],
        stdout: 'piped',
        stderr: 'piped',
      });
      const { stdout } = await checkRoute.output();
      const output = new TextDecoder().decode(stdout);
      
      if (!output.includes('blackhole')) {
        allBlocked = false;
        break;
      }
    } catch {
      allBlocked = false;
      break;
    }
  }

  locationData.blocked.set(popCode, allBlocked ? 'BLOCKED' : 'UNBLOCKED');
}

function showLocationsTable() {
  console.log('');
  console.log(`${colors.CYAN}╔════════════════════════════════════════════════════════════════════════╗${colors.NC}`);
  console.log(`${colors.CYAN}║                    CS2 Relay Locations Status                          ║${colors.NC}`);
  console.log(`${colors.CYAN}╠════╦══════════╦══════════════════════════════╦═══════════╦═════════════╣${colors.NC}`);
  console.log(`${colors.CYAN}║ #  ║   Code   ║          Location            ║   Ping    ║   Status    ║${colors.NC}`);
  console.log(`${colors.CYAN}╠════╬══════════╬══════════════════════════════╬═══════════╬═════════════╣${colors.NC}`);

  // Sort by ping value (low to high)
  const sortedPopCodes = Array.from(locationData.names.keys()).sort((a, b) => {
    const pingA = locationData.pings.get(a) || 'N/A';
    const pingB = locationData.pings.get(b) || 'N/A';
    
    // Extract numeric values
    const getNumericPing = (ping: string): number => {
      if (ping === 'N/A') return Infinity;
      if (ping === 'TIMEOUT') return Infinity - 1;
      const match = ping.match(/([\d.]+)ms/);
      return match ? parseFloat(match[1]) : Infinity;
    };
    
    return getNumericPing(pingA) - getNumericPing(pingB);
  });
  let index = 1;

  for (const popCode of sortedPopCodes) {
    let name = locationData.names.get(popCode) || '';
    const ping = locationData.pings.get(popCode) || 'N/A';
    const status = locationData.blocked.get(popCode) || 'UNKNOWN';

    // Truncate name if too long
    if (name.length > 28) {
      name = name.substring(0, 25) + '...';
    }

    // Color code ping
    let pingColor = colors.NC;
    if (ping === 'TIMEOUT') {
      pingColor = colors.RED;
    } else if (ping.endsWith('ms')) {
      const pingVal = parseFloat(ping);
      if (pingVal < 50) {
        pingColor = colors.GREEN;
      } else if (pingVal < 100) {
        pingColor = colors.YELLOW;
      } else {
        pingColor = colors.RED;
      }
    }

    // Color code status
    const statusColor = status === 'BLOCKED' ? colors.RED : colors.GREEN;

    console.log(
      `${colors.CYAN}║${colors.NC} ${index.toString().padStart(2)} ${colors.CYAN}║${colors.NC} ${popCode.padEnd(8)} ${colors.CYAN}║${colors.NC} ${name.padEnd(28)} ${colors.CYAN}║${colors.NC} ${pingColor}${ping.padEnd(9)}${colors.NC} ${colors.CYAN}║${colors.NC} ${statusColor}${status.padEnd(11)}${colors.NC} ${colors.CYAN}║${colors.NC}`
    );
    index++;
  }

  console.log(`${colors.CYAN}╚════╩══════════╩══════════════════════════════╩═══════════╩═════════════╝${colors.NC}`);
  console.log('');
}

function getLocationByIndex(index: number): string | null {
  // Sort by ping value (low to high) - same as showLocationsTable
  const sortedPopCodes = Array.from(locationData.names.keys()).sort((a, b) => {
    const pingA = locationData.pings.get(a) || 'N/A';
    const pingB = locationData.pings.get(b) || 'N/A';
    
    // Extract numeric values
    const getNumericPing = (ping: string): number => {
      if (ping === 'N/A') return Infinity;
      if (ping === 'TIMEOUT') return Infinity - 1;
      const match = ping.match(/([\d.]+)ms/);
      return match ? parseFloat(match[1]) : Infinity;
    };
    
    return getNumericPing(pingA) - getNumericPing(pingB);
  });
  
  if (index >= 1 && index <= sortedPopCodes.length) {
    return sortedPopCodes[index - 1];
  }
  return null;
}

async function blockLocation(popCode: string) {
  const ips = locationData.ips.get(popCode);
  const name = locationData.names.get(popCode);
  
  if (!ips || ips.length === 0) return;

  printInfo(`Blocking location: ${name} (${popCode})`);

  let blockedCount = 0;
  
  for (const ip of ips) {
    // Validate IP before blocking
    if (!isValidIP(ip)) {
      printError(`Invalid IP format: ${ip} - skipping`);
      continue;
    }
    
    if (isPrivateIP(ip)) {
      printError(`Refusing to block private/localhost IP: ${ip}`);
      continue;
    }
    
    try {
      // Check if route blackhole already exists
      const checkRoute = new Deno.Command('ip', {
        args: ['route', 'show', ip],
        stdout: 'piped',
        stderr: 'piped',
      });
      const { stdout } = await checkRoute.output();
      const output = new TextDecoder().decode(stdout);
      
      if (output.includes('blackhole')) {
        console.log(`  ${ip} - Already blocked`);
      } else {
        // Add route blackhole - this prevents ANY routing to this IP at kernel level
        const blockRoute = new Deno.Command('ip', {
          args: ['route', 'add', 'blackhole', ip],
        });
        const result = await blockRoute.output();
        
        if (result.code === 0) {
          await addToStateFile(ip);
          console.log(`  ${ip} - Blocked (blackhole route)`);
          blockedCount++;
        } else {
          console.log(`  ${ip} - Failed to block`);
        }
      }
    } catch (error) {
      printError(`Failed to block ${ip}: ${error}`);
    }
  }

  locationData.blocked.set(popCode, 'BLOCKED');
  printSuccess(`Blocked ${blockedCount} new IPs for ${popCode}`);
}

async function unblockLocation(popCode: string) {
  const ips = locationData.ips.get(popCode);
  const name = locationData.names.get(popCode);
  
  if (!ips || ips.length === 0) return;

  printInfo(`Unblocking location: ${name} (${popCode})`);

  let unblockedCount = 0;
  
  for (const ip of ips) {
    // Validate IP before unblocking
    if (!isValidIP(ip)) {
      printError(`Invalid IP format: ${ip} - skipping`);
      continue;
    }
    
    try {
      // Check if route blackhole exists
      const checkRoute = new Deno.Command('ip', {
        args: ['route', 'show', ip],
        stdout: 'piped',
        stderr: 'piped',
      });
      const { stdout } = await checkRoute.output();
      const output = new TextDecoder().decode(stdout);
      
      if (output.includes('blackhole')) {
        // Remove blackhole route
        const unblockRoute = new Deno.Command('ip', {
          args: ['route', 'del', 'blackhole', ip],
        });
        const result = await unblockRoute.output();
        
        if (result.code === 0) {
          await removeFromStateFile(ip);
          console.log(`  ${ip} - Unblocked`);
          unblockedCount++;
        } else {
          console.log(`  ${ip} - Failed to unblock`);
        }
      } else {
        console.log(`  ${ip} - Not blocked`);
      }
    } catch (error) {
      printError(`Failed to unblock ${ip}: ${error}`);
    }
  }

  locationData.blocked.set(popCode, 'UNBLOCKED');
  printSuccess(`Unblocked ${unblockedCount} IPs for ${popCode}`);
}

async function showBlockedRoutes() {
  console.log('');
  printInfo('CS2 relay routes blocked by this script...');
  console.log('');

  try {
    let content: string;
    try {
      content = await Deno.readTextFile(STATE_FILE);
    } catch {
      console.log('No blocked routes found');
      return;
    }
    
    const ips = content.split('\n').filter(line => line.trim());
    
    if (ips.length === 0) {
      console.log('No blocked routes found');
      return;
    }
    
    console.log(`Found ${ips.length} blocked route(s):\n`);
    
    for (const ip of ips) {
      // Verify route still exists
      const checkRoute = new Deno.Command('ip', {
        args: ['route', 'show', ip],
        stdout: 'piped',
        stderr: 'piped',
      });
      const { stdout } = await checkRoute.output();
      const output = new TextDecoder().decode(stdout);
      
      const status = output.includes('blackhole') ? `${colors.RED}BLOCKED${colors.NC}` : `${colors.YELLOW}MISSING${colors.NC}`;
      console.log(`  ${ip} - ${status}`);
    }
  } catch (error) {
    printError(`Failed to retrieve routes: ${error}`);
  }
}

async function unblockAll() {
  console.log('');
  printInfo('Unblocking all relay locations...');

  for (const popCode of locationData.names.keys()) {
    await unblockLocation(popCode);
  }

  printSuccess('All locations unblocked');
}

async function readLine(prompt: string): Promise<string> {
  Deno.stdout.writeSync(new TextEncoder().encode(prompt));
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n === null) return '';
  return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

async function blockSelection() {
  while (true) {
    console.log('');
    showLocationsTable();
    console.log(`${colors.YELLOW}Enter location numbers to BLOCK (comma-separated, e.g., 1,3,5)${colors.NC}`);
    console.log(`${colors.YELLOW}Or press Enter to return to main menu${colors.NC}`);
    
    const selection = await readLine('> ');

    if (!selection) {
      return;
    }

    console.log('');
    const indices = selection.split(',').map(s => s.trim());
    
    for (const indexStr of indices) {
      const index = parseInt(indexStr);
      if (isNaN(index)) {
        printError(`Invalid input: ${indexStr}`);
        continue;
      }

      const popCode = getLocationByIndex(index);
      if (popCode) {
        await blockLocation(popCode);
        await checkLocationBlocked(popCode);
      } else {
        printError(`Invalid index: ${index}`);
      }
    }

    console.log('');
    await readLine('Press Enter to continue...');
  }
}

async function unblockSelection() {
  while (true) {
    console.log('');
    showLocationsTable();
    console.log(`${colors.YELLOW}Enter location numbers to UNBLOCK (comma-separated, e.g., 1,3,5)${colors.NC}`);
    console.log(`${colors.YELLOW}Or press Enter to return to main menu${colors.NC}`);
    
    const selection = await readLine('> ');

    if (!selection) {
      return;
    }

    console.log('');
    const indices = selection.split(',').map(s => s.trim());
    
    for (const indexStr of indices) {
      const index = parseInt(indexStr);
      if (isNaN(index)) {
        printError(`Invalid input: ${indexStr}`);
        continue;
      }

      const popCode = getLocationByIndex(index);
      if (popCode) {
        await unblockLocation(popCode);
        await checkLocationBlocked(popCode);
      } else {
        printError(`Invalid index: ${index}`);
      }
    }

    console.log('');
    await readLine('Press Enter to continue...');
  }
}

async function showMenu() {
  while (true) {
    console.log('');
    showLocationsTable();
    console.log(`${colors.BLUE}═══════════════ Main Menu ═══════════════${colors.NC}`);
    console.log('1. Ping all locations');
    console.log('2. Block selection');
    console.log('3. Unblock selection');
    console.log('4. Show blocked routes');
    console.log('5. Unblock all locations');
    console.log('6. Refresh data and re-ping');
    console.log('0. Exit');
    console.log('');

    const choice = await readLine('Select option [0-6]: ');

    switch (choice) {
      case '1':
        await pingAllLocations();
        for (const popCode of locationData.names.keys()) {
          await checkLocationBlocked(popCode);
        }
        break;
      case '2':
        await blockSelection();
        break;
      case '3':
        await unblockSelection();
        break;
      case '4':
        await showBlockedRoutes();
        await readLine('Press Enter to continue...');
        break;
      case '5':
        await unblockAll();
        for (const popCode of locationData.names.keys()) {
          await checkLocationBlocked(popCode);
        }
        await readLine('Press Enter to continue...');
        break;
      case '6':
        await fetchRelays();
        await parseLocations();
        await pingAllLocations();
        for (const popCode of locationData.names.keys()) {
          await checkLocationBlocked(popCode);
        }
        break;
      case '0':
        cleanup();
        printSuccess('Goodbye!');
        Deno.exit(0);
        break;
      default:
        printError('Invalid option');
        break;
    }
  }
}

function cleanup() {
  try {
    Deno.removeSync(TEMP_JSON);
  } catch {
    // Ignore errors
  }
  // Note: We keep STATE_FILE to persist blocked routes across runs
}

// Main execution
async function main() {
  printHeader();
  await checkDependencies();
  checkRoot();
  await fetchRelays();
  await parseLocations();

  // Initial ping and status check
  await pingAllLocations();

  // Check current block status for all locations
  for (const popCode of locationData.names.keys()) {
    await checkLocationBlocked(popCode);
  }

  await showMenu();
}

// Handle cleanup on exit
globalThis.addEventListener('unload', () => {
  cleanup();
});

// Run main function
if (import.meta.main) {
  main().then(() => {
    if (Deno.stdin.isTerminal()) {
      console.log('');
      console.log('Press Enter to exit...');
      const buf = new Uint8Array(1);
      Deno.stdin.readSync(buf);
    }
  }).catch((error) => {
    printError(`Unexpected error: ${error}`);
    cleanup();
    Deno.exit(1);
  });
}

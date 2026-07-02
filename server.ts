import express from "express";
import path from "path";
import crypto from "crypto";
import { Client } from "ssh2";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";

const app = express();
const PORT = 3000;

// Middleware for parsing requests
app.use(express.json());

// Stable encryption secret for SSH session token
const SESSION_SECRET = process.env.SESSION_SECRET || "limuna-linux-server-panel-secret-key-32bytes!";
const ENCRYPTION_KEY = Buffer.alloc(32);
ENCRYPTION_KEY.write(SESSION_SECRET.padEnd(32, "x"), "utf8");
const IV_LENGTH = 16;

// Encryption helpers to store SSH credentials on the client-side securely (stateless)
function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

// Extract and decrypt SSH configuration from the request headers
function getSSHConfig(req: express.Request): SSHConfig {
  const token = req.headers["x-ssh-token"] as string;
  if (!token) {
    throw new Error("No SSH connection token provided. Please connect to a server first.");
  }
  const decrypted = decrypt(token);
  const config = JSON.parse(decrypted);
  return {
    host: config.host,
    port: Number(config.port) || 22,
    username: config.username,
    password: config.password || undefined,
    privateKey: config.privateKey || undefined,
  };
}

// Connection cache helper to persist SSH sessions and prevent continuous log-in/log-out overhead on the server.
interface CachedConnection {
  client: Client;
  status: "connecting" | "ready" | "closed";
  lastUsed: number;
  promise?: Promise<Client>;
}

const sshConnectionCache = new Map<string, CachedConnection>();

// Command result cache to avoid redundant SSH executions on consecutive read queries
interface CommandCacheEntry {
  output: string;
  timestamp: number;
}
const commandResultCache = new Map<string, CommandCacheEntry>();

function isReadOnlyCommand(cmd: string): boolean {
  const normalized = cmd.trim().toLowerCase();
  return (
    normalized.startsWith("ufw status") ||
    normalized.startsWith("lsblk") ||
    normalized.startsWith("df") ||
    normalized.startsWith("free") ||
    normalized.startsWith("cat") ||
    normalized.startsWith("pvs") ||
    normalized.startsWith("vgs") ||
    normalized.startsWith("lvs") ||
    normalized.startsWith("which") ||
    normalized.startsWith("systemctl status") ||
    normalized.startsWith("systemctl is-active") ||
    normalized.startsWith("tail") ||
    normalized.startsWith("grep")
  );
}

// Close idle SSH connections periodically (idle for > 5 minutes)
setInterval(() => {
  const now = Date.now();
  const idleTimeout = 5 * 60 * 1000; // 5 minutes
  for (const [key, cached] of sshConnectionCache.entries()) {
    if (cached.status === "ready" && now - cached.lastUsed > idleTimeout) {
      try {
        cached.client.end();
      } catch {}
      sshConnectionCache.delete(key);
    }
  }
}, 60 * 1000);

function getOrCreateSSHConnection(config: SSHConfig): Promise<Client> {
  const key = `${config.username}@${config.host}:${config.port}`;
  const cached = sshConnectionCache.get(key);

  if (cached) {
    if (cached.status === "ready") {
      cached.lastUsed = Date.now();
      return Promise.resolve(cached.client);
    } else if (cached.status === "connecting" && cached.promise) {
      return cached.promise;
    }
  }

  const client = new Client();
  const connInfo: CachedConnection = {
    client,
    status: "connecting",
    lastUsed: Date.now(),
  };

  const promise = new Promise<Client>((resolve, reject) => {
    let completed = false;

    client.on("ready", () => {
      if (completed) return;
      completed = true;
      connInfo.status = "ready";
      connInfo.lastUsed = Date.now();
      resolve(client);
    });

    client.on("error", (err) => {
      if (completed) {
        sshConnectionCache.delete(key);
        try { client.end(); } catch {}
        return;
      }
      completed = true;
      sshConnectionCache.delete(key);
      reject(new Error(`SSH Connection failed: ${err.message}`));
    });

    client.on("end", () => {
      sshConnectionCache.delete(key);
      connInfo.status = "closed";
    });

    client.on("close", () => {
      sshConnectionCache.delete(key);
      connInfo.status = "closed";
    });

    client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password || undefined,
      privateKey: config.privateKey || undefined,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    });
  });

  connInfo.promise = promise;
  sshConnectionCache.set(key, connInfo);

  return promise;
}

// Run SSH command helper. Handles root or non-root with sudo safely. Reuses persistent connections and caches read commands.
function runSSHCommand(config: SSHConfig, command: string, useSudo = false): Promise<string> {
  const cacheKey = `${config.host}:${config.port}:${config.username}:${command}:${useSudo}`;
  const isRead = isReadOnlyCommand(command);

  // 1. If it's a read command, check command result cache (valid for 3 seconds)
  if (isRead) {
    const cachedResult = commandResultCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < 3000) {
      return Promise.resolve(cachedResult.output);
    }
  } else {
    // If it's a write/action command, immediately clear the whole result cache to ensure fresh state read next
    commandResultCache.clear();
  }

  const execute = (isRetry = false): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        const client = await getOrCreateSSHConnection(config);
        const connectionKey = `${config.username}@${config.host}:${config.port}`;
        const cached = sshConnectionCache.get(connectionKey);
        if (cached) {
          cached.lastUsed = Date.now();
        }

        let stdout = "";
        let stderr = "";

        let cmdToRun = command;
        const isRoot = config.username === "root";

        if (useSudo && !isRoot) {
          if (config.password) {
            const escapedPassword = config.password.replace(/'/g, "'\\''");
            cmdToRun = `echo '${escapedPassword}' | sudo -S ${command}`;
          } else {
            cmdToRun = `sudo -n ${command}`;
          }
        }

        client.exec(cmdToRun, (err, stream) => {
          if (err) {
            // If the connection was closed or died, invalidate cached client and retry once
            if (!isRetry) {
              sshConnectionCache.delete(connectionKey);
              return execute(true).then(resolve).catch(reject);
            }
            return reject(err);
          }

          stream.on("close", (code, signal) => {
            const cleanStderr = stderr.replace(/\[sudo\] password for .*: /g, "").trim();
            
            if (code !== 0 && code !== null) {
              if (cleanStderr && !stdout.trim()) {
                reject(new Error(`Command exited with code ${code}. Error: ${cleanStderr}`));
              } else {
                if (isRead) {
                  commandResultCache.set(cacheKey, { output: stdout, timestamp: Date.now() });
                }
                resolve(stdout);
              }
            } else {
              if (isRead) {
                commandResultCache.set(cacheKey, { output: stdout, timestamp: Date.now() });
              }
              resolve(stdout);
            }
          }).on("data", (data: any) => {
            stdout += data.toString();
          }).stderr.on("data", (data: any) => {
            stderr += data.toString();
          });
        });
      } catch (err: any) {
        if (!isRetry) {
          const connectionKey = `${config.username}@${config.host}:${config.port}`;
          sshConnectionCache.delete(connectionKey);
          return execute(true).then(resolve).catch(reject);
        }
        reject(err);
      }
    });
  };

  return execute(false);
}

// 1. API: Connect and test SSH credentials
app.post("/api/connect", async (req, res) => {
  try {
    const { host, port, username, password, privateKey } = req.body;
    
    if (!host || !username) {
      return res.status(400).json({ error: "Host and Username are required." });
    }

    const config: SSHConfig = {
      host,
      port: Number(port) || 22,
      username,
      password,
      privateKey,
    };

    // Test SSH Connection by running a simple echo command
    await runSSHCommand(config, "echo 'Limuna Connection Success'");

    // Encrypt the connection info to create a secure token
    const tokenPayload = JSON.stringify({
      host,
      port: config.port,
      username,
      password,
      privateKey,
    });
    const token = encrypt(tokenPayload);

    res.json({
      success: true,
      message: "Connected successfully",
      token,
      server: {
        host,
        port: config.port,
        username,
      }
    });
  } catch (error: any) {
    console.error("Connection error:", error);
    res.status(500).json({ error: error.message || "Failed to establish SSH connection" });
  }
});

// 2. API: Fetch overall system metrics (CPU, RAM, load, hostname, kernel, uptime)
app.get("/api/system-info", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    
    // Execute a shell script snippet to output rich json structure directly
    const script = `
      hostname="$(hostname)"
      kernel="$(uname -r)"
      os="$(grep PRETTY_NAME /etc/os-release | cut -d'=' -f2 | tr -d '"')"
      uptime_str="$(uptime -p)"
      cpu_model="$(lscpu | grep 'Model name' | sed 's/Model name:[[:space:]]*//' | head -n 1)"
      if [ -z "$cpu_model" ]; then
        cpu_model="$(grep 'model name' /proc/cpuinfo | head -n 1 | cut -d':' -f2 | sed 's/^[[:space:]]*//')"
      fi
      
      # CPU calculation
      cpu_idle="$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* *id.*/\\1/" | awk '{print $1}')"
      if [ -z "$cpu_idle" ]; then
        cpu_idle="50"
      fi
      cpu_usage="$(echo "100 - $cpu_idle" | bc -l 2>/dev/null || awk "BEGIN {print 100 - $cpu_idle}")"

      # RAM in MB
      ram_total="$(free -m | awk '/Mem:/ {print $2}')"
      ram_used="$(free -m | awk '/Mem:/ {print $3}')"
      ram_free="$(free -m | awk '/Mem:/ {print $4}')"
      ram_available="$(free -m | awk '/Mem:/ {print $7}')"

      # Disk space summary (Root / usage)
      root_disk_total="$(df -h / | awk 'NR==2 {print $2}')"
      root_disk_used="$(df -h / | awk 'NR==2 {print $3}')"
      root_disk_avail="$(df -h / | awk 'NR==2 {print $4}')"
      root_disk_percent="$(df -h / | awk 'NR==2 {print $5}')"

      # Core counts
      cpu_cores="$(nproc)"

      # Load average
      load_avg="$(cat /proc/loadavg | awk '{print $1" "$2" "$3}')"

      echo "{"
      echo "  \\"hostname\\": \\"$hostname\\","
      echo "  \\"kernel\\": \\"$kernel\\","
      echo "  \\"os\\": \\"$os\\","
      echo "  \\"uptime\\": \\"$uptime_str\\","
      echo "  \\"cpuModel\\": \\"$cpu_model\\","
      echo "  \\"cpuCores\\": $cpu_cores,"
      echo "  \\"cpuUsage\\": $cpu_usage,"
      echo "  \\"ram\\": {"
      echo "    \\"total\\": $ram_total,"
      echo "    \\"used\\": $ram_used,"
      echo "    \\"free\\": $ram_free,"
      echo "    \\"available\\": $ram_available"
      echo "  },"
      echo "  \\"rootDisk\\": {"
      echo "    \\"total\\": \\"$root_disk_total\\","
      echo "    \\"used\\": \\"$root_disk_used\\","
      echo "    \\"available\\": \\"$root_disk_avail\\","
      echo "    \\"percentage\\": \\"$root_disk_percent\\""
      echo "  },"
      echo "  \\"loadAvg\\": \\"$load_avg\\""
      echo "}"
    `;

    const output = await runSSHCommand(config, script);
    res.json(JSON.parse(output));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. API: Fetch Block Devices tree (using lsblk)
app.get("/api/disks", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    
    // Attempt to get lsblk JSON format
    let output = "";
    try {
      output = await runSSHCommand(config, "lsblk -o NAME,FSTYPE,SIZE,MOUNTPOINT,TYPE,UUID,MOUNTPOINTS -J");
      res.json(JSON.parse(output));
    } catch (e) {
      // Fallback if lsblk doesn't support JSON (very old lsblk)
      const rawText = await runSSHCommand(config, "lsblk -o NAME,FSTYPE,SIZE,MOUNTPOINT,TYPE,UUID");
      // Parse table manually
      const lines = rawText.trim().split("\n");
      const headers = lines[0].toLowerCase().split(/\s+/);
      const devices = lines.slice(1).map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          name: parts[0] || "",
          fstype: parts[1] || "",
          size: parts[2] || "",
          mountpoint: parts[3] || "",
          type: parts[4] || "",
          uuid: parts[5] || ""
        };
      });
      res.json({ blockdevices: devices });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. API: Fetch Processes list (top 50 CPU consuming processes)
app.get("/api/processes", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    // Fetch process table, split by a delimiter like `|` to handle process names with spaces easily
    const command = "ps -eo pid,ppid,user,%cpu,%mem,comm --sort=-%cpu | head -n 60";
    const rawOutput = await runSSHCommand(config, command);
    
    const lines = rawOutput.trim().split("\n");
    const processes = lines.slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[0];
      const ppid = parts[1];
      const user = parts[2];
      const cpu = parts[3];
      const mem = parts[4];
      const commandName = parts.slice(5).join(" ");
      
      return {
        pid: parseInt(pid, 10),
        ppid: parseInt(ppid, 10),
        user,
        cpu: parseFloat(cpu),
        mem: parseFloat(mem),
        command: commandName,
      };
    }).filter(p => !isNaN(p.pid));

    res.json({ processes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. API: Kill a Process
app.post("/api/processes/kill", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { pid, signal } = req.body;
    
    if (!pid) {
      return res.status(400).json({ error: "Process ID (pid) is required." });
    }

    const sig = signal || "-9";
    const command = `kill ${sig} ${pid}`;
    await runSSHCommand(config, command, true); // Runs as sudo if not root

    res.json({ success: true, message: `Successfully sent signal ${sig} to process ${pid}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. API: Fetch LVM Data (Physical Volumes, Volume Groups, Logical Volumes)
app.get("/api/lvm", async (req, res) => {
  try {
    const config = getSSHConfig(req);

    // Run custom LVM reporting commands with separator to be parsed safely
    // Note: pvs, vgs, lvs command flags are stable and require sudo. We use --units b to return sizes in raw bytes.
    const pvCmd = "pvs -o pv_name,vg_name,pv_size,pv_free --units b --nosuffix --noheadings --separator=\";\" 2>/dev/null";
    const vgCmd = "vgs -o vg_name,pv_count,lv_count,vg_size,vg_free --units b --nosuffix --noheadings --separator=\";\" 2>/dev/null";
    const lvCmd = "lvs -o lv_name,vg_name,lv_size,lv_path,lv_attr --units b --nosuffix --noheadings --separator=\";\" 2>/dev/null";

    // Run them in parallel using Promise.all
    const [pvRaw, vgRaw, lvRaw] = await Promise.all([
      runSSHCommand(config, pvCmd, true).catch(() => ""),
      runSSHCommand(config, vgCmd, true).catch(() => ""),
      runSSHCommand(config, lvCmd, true).catch(() => "")
    ]);

    // Parse PVs
    const physicalVolumes = pvRaw.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.trim().split(";");
      return {
        pvName: parts[0]?.trim() || "",
        vgName: parts[1]?.trim() || "",
        size: parseInt(parts[2]?.trim() || "0", 10),
        free: parseInt(parts[3]?.trim() || "0", 10)
      };
    });

    // Parse VGs
    const volumeGroups = vgRaw.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.trim().split(";");
      return {
        vgName: parts[0]?.trim() || "",
        pvCount: parseInt(parts[1]?.trim() || "0", 10),
        lvCount: parseInt(parts[2]?.trim() || "0", 10),
        size: parseInt(parts[3]?.trim() || "0", 10),
        free: parseInt(parts[4]?.trim() || "0", 10)
      };
    });

    // Parse LVs
    const logicalVolumes = lvRaw.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.trim().split(";");
      return {
        lvName: parts[0]?.trim() || "",
        vgName: parts[1]?.trim() || "",
        size: parseInt(parts[2]?.trim() || "0", 10),
        path: parts[3]?.trim() || "",
        attr: parts[4]?.trim() || ""
      };
    });

    res.json({
      physicalVolumes,
      volumeGroups,
      logicalVolumes
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. API: Execute LVM & ext4 Resizing Operations
app.post("/api/lvm/resize", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { lvPath, targetSize, mode, filesystem } = req.body;
    
    // Mode can be:
    // 'extend' (increase logical volume + ext4 filesystem)
    // 'shrink' (shrink logical volume + ext4 filesystem)
    // 'set' (set logical volume + ext4 filesystem to absolute size)
    // 'max' (extend logical volume to use 100% of the volume group free space)

    if (!lvPath) {
      return res.status(400).json({ error: "Logical Volume Path (lvPath) is required." });
    }

    let command = "";
    
    // We will use standard LVM `lvresize` or `lvextend`/`lvreduce` with `-r` (or `--resizefs`).
    // The -r flag is the golden standard for professional LVM resize operations. It supports
    // both ext2/ext3/ext4 (via resize2fs) and xfs (via xfs_growfs), ensuring data safety
    // because it handles filesystem checking, resizing, and boundaries completely automatically.
    
    if (mode === "max") {
      command = `lvextend -l +100%FREE "${lvPath}" -r`;
    } else {
      if (!targetSize) {
        return res.status(400).json({ error: "Target size (e.g. 20G, +5G, -10G) is required." });
      }

      // Check if size contains M, G, T. If just number, assume Gigabytes
      let formattedSize = targetSize.trim();
      if (/^\d+$/.test(formattedSize)) {
        formattedSize += "G"; // default to GB
      } else if (/^[+-]\d+$/.test(formattedSize)) {
        formattedSize += "G"; // default to GB for offsets too
      }

      if (mode === "extend") {
        const sizeParam = formattedSize.startsWith("+") ? formattedSize : `+${formattedSize}`;
        command = `lvextend -L "${sizeParam}" "${lvPath}" -r`;
      } else if (mode === "shrink") {
        const sizeParam = formattedSize.startsWith("-") ? formattedSize : `-${formattedSize}`;
        // Note: Shrinking filesystems is a critical operation. We warn the user, but we run it.
        // lvreduce -r will safely check and shrink filesystem first before shrinking logical volume.
        // It asks for confirmation in some cases, so we prepend yes | or pass -f to make it non-interactive!
        command = `lvreduce -f -L "${sizeParam}" "${lvPath}" -r`;
      } else if (mode === "set") {
        // Absolute resize: lvresize -r sets the absolute size of both LV and filesystem
        command = `lvresize -f -L "${formattedSize}" "${lvPath}" -r`;
      } else {
        return res.status(400).json({ error: "Invalid resize mode. Must be extend, shrink, set, or max." });
      }
    }

    const commandLog = `Executing command: ${command}`;
    console.log(commandLog);

    const output = await runSSHCommand(config, command, true);

    res.json({
      success: true,
      command,
      output,
      message: "LVM and Filesystem resizing completed successfully."
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. API: Custom Terminal Execute
app.post("/api/terminal/execute", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { command, useSudo } = req.body;

    if (!command) {
      return res.status(400).json({ error: "Command is required" });
    }

    const output = await runSSHCommand(config, command, !!useSudo);
    res.json({ output });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. API: Get list of active LVM Volume Group Free Space details for custom validations
app.get("/api/lvm/vg-free", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const cmd = "vgs -o vg_name,vg_free --units g --nosuffix --noheadings --separator=\";\" 2>/dev/null";
    const raw = await runSSHCommand(config, cmd, true);
    
    const vgFree: Record<string, number> = {};
    raw.trim().split("\n").filter(Boolean).forEach(line => {
      const parts = line.trim().split(";");
      if (parts[0]) {
        vgFree[parts[0].trim()] = parseFloat(parts[1]?.trim() || "0");
      }
    });
    res.json({ vgFree });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. API: Fetch Linux Users list
app.get("/api/users", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const script = `
      for u in $(cat /etc/passwd | awk -F: '$3 >= 1000 || $1 == "root" {print $1}'); do
        groups=$(id -Gn "$u" 2>/dev/null | tr ' ' ',')
        info=$(grep "^$u:" /etc/passwd)
        uid=$(echo "$info" | cut -d: -f3)
        gid=$(echo "$info" | cut -d: -f4)
        home=$(echo "$info" | cut -d: -f6)
        shell=$(echo "$info" | cut -d: -f7)
        echo "$u;$uid;$gid;$home;$shell;$groups"
      done
    `;
    const rawOutput = await runSSHCommand(config, script, true);
    const users = rawOutput.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.trim().split(";");
      return {
        username: parts[0] || "",
        uid: parseInt(parts[1] || "0", 10),
        gid: parseInt(parts[2] || "0", 10),
        home: parts[3] || "",
        shell: parts[4] || "",
        groups: parts[5] ? parts[5].split(",").filter(Boolean) : []
      };
    });
    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. API: Fetch Linux Groups list
app.get("/api/groups", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const script = `
      echo "===PASSWD==="
      cat /etc/passwd | awk -F: '{print $1":"$4}'
      echo "===GROUP==="
      cat /etc/group | awk -F: '{print $1":"$3":"$4}'
    `;
    const rawOutput = await runSSHCommand(config, script, true);
    
    const partsOfOutput = rawOutput.split("===GROUP===");
    const passwdPart = partsOfOutput[0] || "";
    const groupPart = partsOfOutput[1] || "";

    const userPrimaryGids: { username: string; gid: number }[] = [];
    passwdPart.split("\n").forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "===PASSWD===") return;
      const [username, gidStr] = trimmed.split(":");
      if (username && gidStr) {
        userPrimaryGids.push({
          username,
          gid: parseInt(gidStr, 10)
        });
      }
    });

    const groups = groupPart.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.trim().split(":");
      const groupname = parts[0] || "";
      const gid = parseInt(parts[1] || "0", 10);
      const explicitUsers = parts[2] ? parts[2].split(",").filter(Boolean) : [];

      // Find users whose primary GID matches this group's GID
      const primaryUsers = userPrimaryGids
        .filter(u => u.gid === gid)
        .map(u => u.username);

      // Merge and deduplicate
      const allUsers = Array.from(new Set([...explicitUsers, ...primaryUsers]));

      return {
        groupname,
        gid,
        users: allUsers
      };
    });

    res.json({ groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. API: Create Linux User
app.post("/api/users/create", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { username, password, shell, primaryGroup, additionalGroups } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    let createCmd = `useradd -m`;
    if (shell) createCmd += ` -s "${shell}"`;
    if (primaryGroup) createCmd += ` -g "${primaryGroup}"`;
    
    createCmd += ` "${username}"`;

    // Execute user creation
    await runSSHCommand(config, createCmd, true);

    // If additional groups
    if (additionalGroups && additionalGroups.length > 0) {
      const groupsStr = additionalGroups.join(",");
      await runSSHCommand(config, `usermod -aG "${groupsStr}" "${username}"`, true);
    }

    // Set password
    if (password) {
      const escapedPassword = password.replace(/'/g, "'\\''");
      await runSSHCommand(config, `echo '${username}:${escapedPassword}' | chpasswd`, true);
    }

    res.json({ success: true, message: `User ${username} created successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 13. API: Update Linux User Password
app.post("/api/users/password", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const escapedPassword = password.replace(/'/g, "'\\''");
    await runSSHCommand(config, `echo '${username}:${escapedPassword}' | chpasswd`, true);

    res.json({ success: true, message: `Password for ${username} updated successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 14. API: Delete Linux User
app.post("/api/users/delete", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { username, removeHome } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    const flags = removeHome ? "-r" : "";
    await runSSHCommand(config, `userdel ${flags} "${username}"`, true);

    res.json({ success: true, message: `User ${username} deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 15. API: Create Linux Group
app.post("/api/groups/create", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { groupname } = req.body;

    if (!groupname) {
      return res.status(400).json({ error: "Group name is required." });
    }

    await runSSHCommand(config, `groupadd "${groupname}"`, true);
    res.json({ success: true, message: `Group ${groupname} created successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 15b. API: Delete Linux Group
app.post("/api/groups/delete", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { groupname } = req.body;

    if (!groupname) {
      return res.status(400).json({ error: "Group name is required." });
    }

    await runSSHCommand(config, `groupdel "${groupname}"`, true);
    res.json({ success: true, message: `Group ${groupname} deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 16. API: Run Disk/System Backup
app.post("/api/backup/run", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { type, source, filename, compression } = req.body;
    
    if (!source || !filename) {
      return res.status(400).json({ error: "Source and filename are required." });
    }

    // Ensure the output folder exists
    await runSSHCommand(config, "mkdir -p /var/backups/limuna", true);

    let command = "";
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_-]/g, "");

    if (type === "dd") {
      if (compression === "gzip") {
        command = `dd if="${source}" bs=4M status=progress | gzip > "/var/backups/limuna/${cleanFilename}.img.gz"`;
      } else {
        command = `dd if="${source}" bs=4M status=progress of="/var/backups/limuna/${cleanFilename}.img"`;
      }
    } else {
      const compressFlag = compression === "gzip" ? "-czf" : "-cf";
      const ext = compression === "gzip" ? "tar.gz" : "tar";
      command = `tar ${compressFlag} "/var/backups/limuna/${cleanFilename}.${ext}" --exclude="/var/backups/limuna" -C "${source}" .`;
    }

    const output = await runSSHCommand(config, command, true);

    res.json({
      success: true,
      command,
      output,
      message: "Backup completed successfully."
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 17. API: List Backups in storage directory
app.get("/api/backup/list", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const script = `
      mkdir -p /var/backups/limuna
      for f in /var/backups/limuna/*; do
        [ -e "$f" ] || continue
        name=$(basename "$f")
        size=$(stat -c%s "$f" 2>/dev/null || wc -c < "$f")
        mtime=$(stat -c%y "$f" 2>/dev/null || date -r "$f" "+%Y-%m-%d %H:%M:%S")
        echo "$name;$size;$mtime"
      done
    `;
    const rawOutput = await runSSHCommand(config, script, true);
    const backups = rawOutput.trim().split("\n").filter(Boolean).map(line => {
      const parts = line.trim().split(";");
      return {
        name: parts[0] || "",
        size: parseInt(parts[1] || "0", 10),
        mtime: parts[2] || ""
      };
    });
    res.json({ backups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 18. API: Delete Backup File
app.post("/api/backup/delete", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Backup filename is required." });
    }
    const cleanName = name.replace(/\.\./g, ""); // basic directory traversal guard
    await runSSHCommand(config, `rm -f "/var/backups/limuna/${cleanName}"`, true);
    res.json({ success: true, message: `Backup file ${cleanName} deleted.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 19. API: Execute Restore Command Generator
app.post("/api/backup/restore-info", async (req, res) => {
  try {
    const { name, targetDevice } = req.body;
    if (!name || !targetDevice) {
      return res.status(400).json({ error: "Backup name and target device are required." });
    }

    let command = "";
    if (name.endsWith(".img.gz")) {
      command = `gunzip -c "/var/backups/limuna/${name}" | dd of="${targetDevice}" bs=4M status=progress`;
    } else if (name.endsWith(".img")) {
      command = `dd if="/var/backups/limuna/${name}" of="${targetDevice}" bs=4M status=progress`;
    } else if (name.endsWith(".tar.gz")) {
      command = `mkdir -p /mnt/restore_target && mount "${targetDevice}" /mnt/restore_target && tar -xzf "/var/backups/limuna/${name}" -C /mnt/restore_target`;
    } else {
      command = `tar -xf "/var/backups/limuna/${name}" -C "${targetDevice}"`;
    }

    res.json({
      success: true,
      command,
      instructions: [
        "Ensure the target destination disk is NOT currently mounted.",
        "Executing this restore will completely overwrite all data on the target destination.",
        "You can run the generated restore command directly in the Terminal or via SSH Shell.",
        `Target: ${targetDevice}`
      ]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 20. API: Get UFW Status and Rules
app.get("/api/ufw/status", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    
    // Check if ufw command is available
    try {
      await runSSHCommand(config, "which ufw", true);
    } catch (e) {
      return res.json({ installed: false, isActive: false, rules: [], raw: "UFW is not installed on this host." });
    }

    // Get verbose status (contains default policies) and numbered rules
    const rawVerbose = await runSSHCommand(config, "ufw status verbose", true);
    const rawNumbered = await runSSHCommand(config, "ufw status numbered", true);

    const isActive = rawVerbose.toLowerCase().includes("status: active");
    const rules: any[] = [];

    if (isActive) {
      const lines = rawNumbered.split("\n");
      lines.forEach(line => {
        // Matches line like "[ 1] 22/tcp                     ALLOW IN    Anywhere"
        const match = line.match(/^\s*\[\s*(\d+)\s*\]\s+(.+?)\s{2,}(.+?)\s{2,}(.+)$/);
        if (match) {
          let fromVal = match[4].trim();
          let commentVal = "";
          
          if (fromVal.includes("#")) {
            const parts = fromVal.split("#");
            fromVal = parts[0].trim();
            commentVal = parts[1].trim();
          }

          rules.push({
            index: parseInt(match[1], 10),
            to: match[2].trim(),
            action: match[3].trim(),
            from: fromVal,
            comment: commentVal,
            raw: line.trim()
          });
        }
      });
    }

    res.json({
      installed: true,
      isActive,
      rawVerbose,
      rawNumbered,
      rules
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 21. API: Toggle UFW (Enable/Disable)
app.post("/api/ufw/toggle", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { active } = req.body;

    const command = active ? "ufw --force enable" : "ufw disable";
    const output = await runSSHCommand(config, command, true);

    res.json({ success: true, output, message: `UFW has been ${active ? "enabled" : "disabled"}.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 22. API: Add UFW Rule
app.post("/api/ufw/add", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { action, port, protocol, fromIp, toIp, insertIndex, comment } = req.body;

    // Build the UFW command
    let ruleParts = "";

    if (insertIndex && parseInt(insertIndex, 10) > 0) {
      ruleParts += `insert ${parseInt(insertIndex, 10)} `;
    }

    // Action: allow, deny, reject, limit
    ruleParts += `${action} `;

    // Build source & destination rules
    if (fromIp && fromIp.trim() !== "") {
      ruleParts += `from ${fromIp.trim()} `;
    }

    if (toIp && toIp.trim() !== "") {
      ruleParts += `to ${toIp.trim()} `;
    } else if (port && port.trim() !== "") {
      ruleParts += `to any `;
    }

    if (port && port.trim() !== "") {
      ruleParts += `port ${port.trim()} `;
    }

    if (protocol && protocol !== "any") {
      ruleParts += `proto ${protocol} `;
    }

    if (comment && comment.trim() !== "") {
      const cleanComment = comment.trim().replace(/'/g, "'\\''");
      ruleParts += `comment '${cleanComment}' `;
    }

    const command = `ufw ${ruleParts.trim()}`;
    const output = await runSSHCommand(config, command, true);

    res.json({ success: true, command, output });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 23. API: Delete UFW Rule
app.post("/api/ufw/delete", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { index } = req.body;

    if (index === undefined) {
      return res.status(400).json({ error: "Rule index is required." });
    }

    const command = `ufw --force delete ${index}`;
    const output = await runSSHCommand(config, command, true);

    res.json({ success: true, output });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 23b. API: Edit UFW Rule (Delete and Insert at same index)
app.post("/api/ufw/edit", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { index, action, port, protocol, fromIp, toIp, comment } = req.body;

    if (index === undefined) {
      return res.status(400).json({ error: "Rule index is required." });
    }

    // 1. Delete the rule at index
    await runSSHCommand(config, `ufw --force delete ${index}`, true);

    // 2. Insert the updated rule at the exact same index
    let ruleParts = `insert ${parseInt(index, 10)} `;
    ruleParts += `${action} `;

    if (fromIp && fromIp.trim() !== "" && fromIp.trim().toLowerCase() !== "anywhere" && fromIp.trim().toLowerCase() !== "any") {
      ruleParts += `from ${fromIp.trim()} `;
    } else {
      ruleParts += `from any `;
    }

    if (toIp && toIp.trim() !== "") {
      ruleParts += `to ${toIp.trim()} `;
    } else {
      ruleParts += `to any `;
    }

    if (port && port.trim() !== "") {
      ruleParts += `port ${port.trim()} `;
    }

    if (protocol && protocol !== "any") {
      ruleParts += `proto ${protocol} `;
    }

    if (comment && comment.trim() !== "") {
      const cleanComment = comment.trim().replace(/'/g, "'\\''");
      ruleParts += `comment '${cleanComment}' `;
    }

    const command = `ufw ${ruleParts.trim()}`;
    const output = await runSSHCommand(config, command, true);

    res.json({ success: true, command, output });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 24. API: Move/Reprioritize UFW Rule
// In UFW, rules are ordered. To move a rule from fromIndex to toIndex, we delete it and re-insert it at the new index.
app.post("/api/ufw/move", async (req, res) => {
  try {
    const config = getSSHConfig(req);
    const { fromIndex, toIndex } = req.body;

    if (fromIndex === undefined || toIndex === undefined) {
      return res.status(400).json({ error: "Both source (fromIndex) and destination (toIndex) indexes are required." });
    }

    // 1. Get the current list of numbered rules
    const rawNumbered = await runSSHCommand(config, "ufw status numbered", true);
    const lines = rawNumbered.split("\n");
    let targetRule: any = null;

    lines.forEach(line => {
      const match = line.match(/^\s*\[\s*(\d+)\s*\]\s+(.+?)\s{2,}(.+?)\s{2,}(.+)$/);
      if (match && parseInt(match[1], 10) === parseInt(fromIndex, 10)) {
        targetRule = {
          to: match[2].trim(),
          action: match[3].trim().toLowerCase(), // allow, deny, reject, etc.
          from: match[4].trim()
        };
      }
    });

    if (!targetRule) {
      return res.status(404).json({ error: `Rule at index ${fromIndex} not found.` });
    }

    // Reconstruct the rule syntax
    // Format rule specification: e.g. "allow proto tcp from 192.168.1.1 to any port 80"
    let ruleSpec = `${targetRule.action} `;
    
    // Parse 'from'
    const cleanFrom = targetRule.from.replace(/\(v6\)/gi, "").trim();
    if (cleanFrom.toLowerCase() !== "anywhere") {
      ruleSpec += `from ${cleanFrom} `;
    } else {
      ruleSpec += `from any `;
    }

    // Parse 'to' and port
    const cleanTo = targetRule.to.replace(/\(v6\)/gi, "").trim();
    // cleanTo might be a port (e.g., "22/tcp" or "80") or IP and port
    let port = "";
    let proto = "";
    
    if (cleanTo.includes("/")) {
      const parts = cleanTo.split("/");
      port = parts[0].trim();
      proto = parts[1].trim();
    } else if (cleanTo.toLowerCase() !== "anywhere") {
      port = cleanTo;
    }

    ruleSpec += `to any `;
    if (port) {
      ruleSpec += `port ${port} `;
    }
    if (proto && proto !== "any") {
      ruleSpec += `proto ${proto} `;
    }

    // 2. Delete the rule at fromIndex
    await runSSHCommand(config, `ufw --force delete ${fromIndex}`, true);

    // 3. Insert the rule at toIndex
    const insertCommand = `ufw insert ${toIndex} ${ruleSpec.trim()}`;
    const output = await runSSHCommand(config, insertCommand, true);

    res.json({
      success: true,
      message: `Rule moved from position ${fromIndex} to ${toIndex}.`,
      command: insertCommand,
      output
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function setupWebSocketServer(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: any, socket: any, head: any) => {
    try {
      const { pathname } = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);

      if (pathname === "/api/ssh-websocket") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    let client: Client | null = null;
    let shellStream: any = null;

    ws.on("message", (message) => {
      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === "init") {
          const { token, cols, rows } = payload;
          if (!token) {
            ws.send(JSON.stringify({ type: "error", message: "SSH Token is required" }));
            ws.close();
            return;
          }

          // Decrypt config
          let config: SSHConfig;
          try {
            const decrypted = decrypt(token);
            const parsed = JSON.parse(decrypted);
            config = {
              host: parsed.host,
              port: Number(parsed.port) || 22,
              username: parsed.username,
              password: parsed.password || undefined,
              privateKey: parsed.privateKey || undefined,
            };
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "error", message: `Failed to decrypt SSH token: ${err.message}` }));
            ws.close();
            return;
          }

          ws.send(JSON.stringify({ type: "status", message: `Connecting to ${config.username}@${config.host}...` }));

          client = new Client();
          client.on("ready", () => {
            ws.send(JSON.stringify({ type: "status", message: "SSH Connected. Requesting interactive shell..." }));

            client!.shell({ term: "xterm-256color", cols: cols || 80, rows: rows || 24 }, (err, stream) => {
              if (err) {
                ws.send(JSON.stringify({ type: "error", message: `Failed to open shell: ${err.message}` }));
                ws.close();
                return;
              }

              shellStream = stream;
              ws.send(JSON.stringify({ type: "ready" }));

              stream.on("data", (data: Buffer) => {
                ws.send(JSON.stringify({ type: "data", data: data.toString("utf8") }));
              });

              stream.on("close", () => {
                ws.send(JSON.stringify({ type: "status", message: "Session closed by remote host." }));
                ws.close();
              });

              stream.stderr.on("data", (data: Buffer) => {
                ws.send(JSON.stringify({ type: "data", data: data.toString("utf8") }));
              });
            });
          });

          client.on("error", (err) => {
            ws.send(JSON.stringify({ type: "error", message: `SSH Connection Error: ${err.message}` }));
            ws.close();
          });

          client.on("close", () => {
            ws.close();
          });

          client.connect({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            readyTimeout: 15000,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
          });

        } else if (payload.type === "data") {
          if (shellStream) {
            shellStream.write(payload.data);
          }
        } else if (payload.type === "resize") {
          if (shellStream) {
            shellStream.setWindow(payload.rows, payload.cols, 0, 0);
          }
        }
      } catch (err: any) {
        console.error("Error handling websocket message:", err);
      }
    });

    ws.on("close", () => {
      if (shellStream) {
        try { shellStream.end(); } catch {}
      }
      if (client) {
        try { client.end(); } catch {}
      }
    });
  });
}

// Serve frontend assets and boot server
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Limuna Linux Panel Server booted on port ${PORT}`);
  });

  setupWebSocketServer(server);
}

start();

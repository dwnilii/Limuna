import React, { useState, useEffect, useMemo } from "react";
import { 
  Server, Cpu, HardDrive, Terminal, Activity, Database, RefreshCw, 
  Play, Trash2, LogOut, Key, Lock, User, Folder, CheckCircle, 
  AlertTriangle, ChevronDown, ChevronRight, Info, Search, ArrowRightLeft,
  X, Check, Terminal as ShellIcon, FileText, Shield, Citrus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  SystemInfo, BlockDevice, Process, LVMPhysicalVolume, 
  LVMVolumeGroup, LVMLogicalVolume, SSHServer, TerminalLog,
  LinuxUser, LinuxGroup, LimunaLog
} from "./types";

import UserManagement from "./components/UserManagement";
import BackupManagement from "./components/BackupManagement";
import LogViewer from "./components/LogViewer";
import UfwManagement from "./components/UfwManagement";

// Local system format helper for bytes
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export default function App() {
  // Authentication states
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("limuna_ssh_token"));
  const [connectedServer, setConnectedServer] = useState<SSHServer | null>(() => {
    const saved = sessionStorage.getItem("limuna_server_info");
    return saved ? JSON.parse(saved) : null;
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"dashboard" | "lvm" | "disks" | "processes" | "terminal" | "users" | "backups" | "logs">("dashboard");

  // Users & Groups states
  const [users, setUsers] = useState<LinuxUser[]>([]);
  const [groups, setGroups] = useState<LinuxGroup[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // Backups states
  const [backups, setBackups] = useState<{name: string, size: number, mtime: string}[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Admin logs state
  const [limunaLogs, setLimunaLogs] = useState<LimunaLog[]>(() => {
    const saved = localStorage.getItem("limuna_admin_logs");
    if (saved) return JSON.parse(saved);
    return [
      {
        id: "log-1",
        action: "System Initialized",
        details: "Limuna Admin Panel initialized successfully. Standing by for SSH connection.",
        timestamp: new Date().toISOString(),
        status: "info"
      }
    ];
  });

  const logAction = (action: string, details: string, status: "success" | "error" | "info" = "success") => {
    const newLog: LimunaLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action,
      details,
      timestamp: new Date().toISOString(),
      status
    };
    setLimunaLogs(prev => {
      const updated = [newLog, ...prev];
      localStorage.setItem("limuna_admin_logs", JSON.stringify(updated));
      return updated;
    });
  };

  // System states
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [blockDevices, setBlockDevices] = useState<BlockDevice[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [lvmPVs, setLvmPVs] = useState<LVMPhysicalVolume[]>([]);
  const [lvmVGs, setLvmVGs] = useState<LVMVolumeGroup[]>([]);
  const [lvmLVs, setLvmLVs] = useState<LVMLogicalVolume[]>([]);
  
  // UI states
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [procSearch, setProcSearch] = useState("");
  const [procUserFilter, setProcUserFilter] = useState("all");
  const [procSortField, setProcSortField] = useState<keyof Process>("cpu");
  const [procSortDirection, setProcSortDirection] = useState<"asc" | "desc">("desc");
  
  // Custom terminal state
  const [terminalCmd, setTerminalCmd] = useState("");
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [isExecutingTerminal, setIsExecutingTerminal] = useState(false);
  const [useSudoForTerminal, setUseSudoForTerminal] = useState(false);

  // LVM Resize states
  const [selectedLV, setSelectedLV] = useState<LVMLogicalVolume | null>(null);
  const [resizeMode, setResizeMode] = useState<"extend" | "shrink" | "set" | "max">("extend");
  const [resizeSize, setResizeSize] = useState("5");
  const [resizeUnit, setResizeUnit] = useState<"G" | "M">("G");
  const [isResizing, setIsResizing] = useState(false);
  const [resizeOutput, setResizeOutput] = useState<string | null>(null);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [resizeLogs, setResizeLogs] = useState<string[]>([]);

  // Connection Setup
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setConnError(null);

    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port,
          username,
          password: authType === "password" ? password : "",
          privateKey: authType === "key" ? privateKey : "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to establish SSH connection");
      }

      // Save credentials in session storage (stateless on backend)
      sessionStorage.setItem("limuna_ssh_token", data.token);
      sessionStorage.setItem("limuna_server_info", JSON.stringify(data.server));
      
      setToken(data.token);
      setConnectedServer(data.server);
      setActiveTab("dashboard");
      logAction("SSH Connected", `Successfully connected to SSH server ${data.server.username}@${data.server.host}:${data.server.port}`, "success");
      fetchMetrics(data.token);
    } catch (err: any) {
      setConnError(err.message || "An unexpected error occurred during connection.");
      logAction("SSH Connection Failed", `Failed to connect to ${username}@${host}:${port}: ${err.message || "Unknown error"}`, "error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem("limuna_ssh_token");
    sessionStorage.removeItem("limuna_server_info");
    setToken(null);
    setConnectedServer(null);
    setSystemInfo(null);
    setBlockDevices([]);
    setProcesses([]);
    setLvmPVs([]);
    setLvmVGs([]);
    setLvmLVs([]);
    setSelectedLV(null);
    setTerminalLogs([]);
    logAction("SSH Disconnected", "SSH session ended by the user.", "info");
  };

  // Metrics Fetcher
  const fetchMetrics = async (authToken = token) => {
    if (!authToken) return;
    setIsLoadingMetrics(true);
    try {
      // Fetch system-info
      const sysRes = await fetch("/api/system-info", {
        headers: { "x-ssh-token": authToken }
      });
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        setSystemInfo(sysData);
      }

      // Fetch disks
      const diskRes = await fetch("/api/disks", {
        headers: { "x-ssh-token": authToken }
      });
      if (diskRes.ok) {
        const diskData = await diskRes.json();
        setBlockDevices(diskData.blockdevices || []);
      }

      // Fetch processes
      const procRes = await fetch("/api/processes", {
        headers: { "x-ssh-token": authToken }
      });
      if (procRes.ok) {
        const procData = await procRes.json();
        setProcesses(procData.processes || []);
      }

      // Fetch LVM
      const lvmRes = await fetch("/api/lvm", {
        headers: { "x-ssh-token": authToken }
      });
      if (lvmRes.ok) {
        const lvmData = await lvmRes.json();
        setLvmPVs(lvmData.physicalVolumes || []);
        setLvmVGs(lvmData.volumeGroups || []);
        setLvmLVs(lvmData.logicalVolumes || []);

        // Sync currently selected LV with updated sizing
        if (selectedLV) {
          const updated = lvmData.logicalVolumes.find((l: LVMLogicalVolume) => l.path === selectedLV.path);
          if (updated) setSelectedLV(updated);
        }
      }
    } catch (e) {
      console.error("Error polling metrics:", e);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  // Poll metrics on interval
  useEffect(() => {
    if (token) {
      fetchMetrics(token);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchMetrics();
    }, 8000);
    return () => clearInterval(interval);
  }, [token, autoRefresh, selectedLV]);

  // Execute terminal command
  const executeTerminalCommand = async (commandToExecute = terminalCmd, sudo = useSudoForTerminal) => {
    if (!commandToExecute.trim() || !token) return;
    setIsExecutingTerminal(true);

    try {
      const response = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token,
        },
        body: JSON.stringify({ command: commandToExecute, useSudo: sudo }),
      });

      const data = await response.json();
      const isError = !response.ok;
      
      const newLog: TerminalLog = {
        command: commandToExecute,
        output: isError ? (data.error || "Execution failed") : data.output,
        timestamp: new Date().toLocaleTimeString(),
        isError,
        useSudo: sudo,
      };

      setTerminalLogs(prev => [newLog, ...prev]);
      if (commandToExecute === terminalCmd) {
        setTerminalCmd("");
      }
      logAction("Terminal Execution", `Executed command: "${commandToExecute}"`, isError ? "error" : "success");
    } catch (error: any) {
      const errorLog: TerminalLog = {
        command: commandToExecute,
        output: error.message || "Network request failed",
        timestamp: new Date().toLocaleTimeString(),
        isError: true,
        useSudo: sudo,
      };
      setTerminalLogs(prev => [errorLog, ...prev]);
      logAction("Terminal Execution Failed", `Command failed: "${commandToExecute}". Error: ${error.message || "Network request failed"}`, "error");
    } finally {
      setIsExecutingTerminal(false);
    }
  };

  // Terminate/Kill process
  const killProcess = async (pid: number) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to terminate Process ID: ${pid}?`)) return;

    try {
      const response = await fetch("/api/processes/kill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token,
        },
        body: JSON.stringify({ pid, signal: "-9" }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(`Failed to kill process: ${data.error}`);
        logAction("Terminate Process Failed", `Failed to terminate PID ${pid}: ${data.error}`, "error");
      } else {
        // Instant update process list
        setProcesses(prev => prev.filter(p => p.pid !== pid));
        logAction("Process Terminated", `Successfully sent SIGKILL (-9) to process ID ${pid}.`, "success");
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
      logAction("Terminate Process Failed", `Failed to terminate PID ${pid}: ${error.message}`, "error");
    }
  };

  // Handle LVM resizing execution
  const executeLvmResize = async () => {
    if (!selectedLV || !token) return;
    
    // Safety check warnings
    if (resizeMode === "shrink") {
      const confirmShrink = confirm(
        "⚠️ WARNING: Shrinking physical disk volumes or filesystems can lead to immediate data loss if the target size is less than the current active data content.\n\nAre you sure you want to proceed?"
      );
      if (!confirmShrink) return;
    }

    setIsResizing(true);
    setResizeOutput(null);
    setResizeError(null);
    setResizeLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Resizing Logical Volume: ${selectedLV.path}`]);

    try {
      const sizeStr = resizeMode === "max" ? "" : `${resizeSize}${resizeUnit}`;
      const response = await fetch("/api/lvm/resize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token,
        },
        body: JSON.stringify({
          lvPath: selectedLV.path,
          targetSize: sizeStr,
          mode: resizeMode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to resize LVM partition");
      }

      setResizeOutput(data.output);
      setResizeLogs(prev => [
        ...prev, 
        `[${new Date().toLocaleTimeString()}] SUCCESS: ${data.message}`,
        `Command run: ${data.command}`
      ]);
      logAction("LVM Resize", `Successfully resized logical volume ${selectedLV.path} using mode: ${resizeMode} ${sizeStr}`, "success");
      
      // Refresh statistics
      fetchMetrics();
    } catch (error: any) {
      setResizeError(error.message);
      setResizeLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${error.message}`]);
      logAction("LVM Resize Failed", `Failed to resize volume ${selectedLV.path}: ${error.message}`, "error");
    } finally {
      setIsResizing(false);
    }
  };

  // Live filter and sort processes
  const filteredProcesses = useMemo(() => {
    const filtered = processes.filter(proc => {
      const matchesSearch = proc.command.toLowerCase().includes(procSearch.toLowerCase()) || 
                            proc.pid.toString().includes(procSearch) ||
                            proc.user.toLowerCase().includes(procSearch.toLowerCase());
      
      const matchesUser = procUserFilter === "all" || 
                          (procUserFilter === "root" && proc.user === "root") ||
                          (procUserFilter === "non-root" && proc.user !== "root");
                          
      return matchesSearch && matchesUser;
    });

    return [...filtered].sort((a, b) => {
      const aValue = a[procSortField];
      const bValue = b[procSortField];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return procSortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        const aNum = Number(aValue) || 0;
        const bNum = Number(bValue) || 0;
        return procSortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
    });
  }, [processes, procSearch, procUserFilter, procSortField, procSortDirection]);

  // Sorting handlers
  const toggleSort = (field: keyof Process) => {
    if (procSortField === field) {
      setProcSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setProcSortField(field);
      setProcSortDirection("desc"); // Default to desc (most useful for load metrics)
    }
  };

  const renderSortArrow = (field: keyof Process) => {
    if (procSortField !== field) return null;
    return procSortDirection === "asc" ? " ▲" : " ▼";
  };

  // Extract unique process users
  const uniqueUsersSummary = useMemo(() => {
    const users = new Set<string>();
    processes.forEach(p => users.add(p.user));
    return Array.from(users);
  }, [processes]);

  // Generate interactive command preview for LVM forms
  const lvmCommandPreview = useMemo(() => {
    if (!selectedLV) return "";
    const sizeStr = resizeMode === "max" ? "" : `${resizeSize}${resizeUnit}`;
    if (resizeMode === "max") {
      return `lvextend -l +100%FREE "${selectedLV.path}" -r`;
    } else if (resizeMode === "extend") {
      return `lvextend -L +${sizeStr} "${selectedLV.path}" -r`;
    } else if (resizeMode === "shrink") {
      return `lvreduce -f -L -${sizeStr} "${selectedLV.path}" -r`;
    } else if (resizeMode === "set") {
      return `lvresize -f -L ${sizeStr} "${selectedLV.path}" -r`;
    }
    return "";
  }, [selectedLV, resizeMode, resizeSize, resizeUnit]);

  // Find Volume Group related to Selected Logical Volume
  const selectedLVGroup = useMemo(() => {
    if (!selectedLV) return null;
    return lvmVGs.find(v => v.vgName === selectedLV.vgName) || null;
  }, [selectedLV, lvmVGs]);

  // Tree nodes renderer for block devices (lsblk helper)
  const renderBlockDevice = (dev: BlockDevice, depth = 0) => {
    const hasChildren = dev.children && dev.children.length > 0;
    return (
      <div key={`${dev.name}-${dev.uuid}`} className="border-b border-slate-800/60 last:border-none">
        <div 
          style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}
          className="py-3 pr-4 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-slate-500 font-mono text-sm select-none">
              {depth > 0 ? "├─" : "●"}
            </span>
            <div className="flex items-center gap-2">
              <HardDrive className={`w-4 h-4 ${dev.type === "lvm" ? "text-indigo-400" : "text-slate-400"}`} />
              <span className="font-mono text-slate-100 font-semibold text-sm">{dev.name}</span>
            </div>
            {dev.type && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider ${
                dev.type === "lvm" ? "bg-indigo-950 text-indigo-300 border border-indigo-800/40" :
                dev.type === "part" ? "bg-emerald-950 text-emerald-300 border border-emerald-800/40" :
                "bg-slate-800 text-slate-300"
              }`}>
                {dev.type}
              </span>
            )}
            {dev.fstype && (
              <span className="text-xs bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800 font-mono">
                {dev.fstype}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="text-slate-300">{dev.size}</div>
            
            {/* Mountpoint indicator */}
            {((dev.mountpoint || (dev.mountpoints && dev.mountpoints.length > 0)) && (
              <div className="flex items-center gap-1 bg-indigo-950/40 text-indigo-300 px-2.5 py-1 rounded border border-indigo-900/30">
                <Folder className="w-3.5 h-3.5" />
                <span>{dev.mountpoint || (dev.mountpoints ? dev.mountpoints.filter(Boolean).join(", ") : "")}</span>
              </div>
            )) || <span className="text-slate-600">Unmounted</span>}

            {dev.uuid && (
              <span className="text-slate-500 hidden md:inline text-[11px]" title={`UUID: ${dev.uuid}`}>
                UUID: {dev.uuid.substring(0, 8)}...
              </span>
            )}
          </div>
        </div>
        
        {hasChildren && dev.children!.map(child => renderBlockDevice(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Header and connected server bar */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 text-slate-950 p-2 rounded-lg shadow-amber-500/10 shadow-lg">
            <Citrus className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Limuna
            </h1>
            <p className="text-xs text-slate-500 font-medium">Agentless Linux Server Control Panel</p>
          </div>
        </div>

        {connectedServer && (
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-xs">
                <div className="text-slate-400 font-mono">
                  {connectedServer.username}@{connectedServer.host}:{connectedServer.port}
                </div>
                {systemInfo && (
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {systemInfo.os} ({systemInfo.kernel})
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={() => fetchMetrics()} 
              disabled={isLoadingMetrics}
              title="Refresh Stats"
              className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingMetrics ? "animate-spin" : ""}`} />
            </button>

            <button 
              onClick={handleDisconnect}
              className="flex items-center gap-2 text-xs bg-rose-950/30 hover:bg-rose-950/60 text-rose-400 border border-rose-900/30 hover:border-rose-800/40 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        
        {/* Connection Form (If not connected) */}
        {!token ? (
          <div className="max-w-xl w-full mx-auto mt-8">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden"
            >
              {/* Visual accents */}
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-500" />
              
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Citrus className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Connect to Linux Host</h2>
                <p className="text-sm text-slate-400 mt-2">
                  No agents required. Connect securely over standard SSH to inspect and manage partition resizing.
                </p>
              </div>

              <form onSubmit={handleConnect} className="space-y-6">
                
                {/* Connection Details */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Host IP or Domain
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. 192.168.1.15"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 font-mono text-sm transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Port
                    </label>
                    <input 
                      type="number" 
                      required
                      placeholder="22"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 font-mono text-sm transition-all outline-none text-center"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    SSH Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-500">
                      <User className="w-4 h-4" />
                    </span>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. root"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-600 font-mono text-sm transition-all outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Note: Running LVM and filesystem commands requires elevated (sudo/root) privileges.
                  </p>
                </div>

                {/* Authentication Type Selector */}
                <div className="border-t border-slate-800/80 pt-4">
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/80">
                    <button 
                      type="button"
                      onClick={() => setAuthType("password")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        authType === "password" 
                          ? "bg-slate-900 text-white shadow-sm border border-slate-800" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Password
                    </button>
                    <button 
                      type="button"
                      onClick={() => setAuthType("key")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        authType === "key" 
                          ? "bg-slate-900 text-white shadow-sm border border-slate-800" 
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      Private Key
                    </button>
                  </div>
                </div>

                {/* Auth Credentials Inputs */}
                <AnimatePresence mode="wait">
                  {authType === "password" ? (
                    <motion.div
                      key="password-pane"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Password
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-3.5 text-slate-500">
                          <Lock className="w-4 h-4" />
                        </span>
                        <input 
                          type="password" 
                          required={authType === "password"}
                          placeholder="••••••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-600 font-mono text-sm transition-all outline-none"
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="key-pane"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden space-y-2"
                    >
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Private Key Content
                      </label>
                      <textarea 
                        required={authType === "key"}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        rows={5}
                        className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 font-mono text-xs transition-all outline-none resize-none"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error message */}
                {connError && (
                  <div className="bg-rose-950/40 border border-rose-900/30 text-rose-400 rounded-xl p-4 text-xs flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Connection Failed: </span>
                      {connError}
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <button 
                  type="submit"
                  disabled={isConnecting}
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:from-indigo-800 disabled:to-indigo-800 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-indigo-600/10 cursor-pointer transition-all flex items-center justify-center gap-3"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating & Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Server className="w-4 h-4" />
                      <span>Establish Connection</span>
                    </>
                  )}
                </button>

              </form>

              <div className="border-t border-slate-800/80 mt-6 pt-4 flex justify-between items-center text-[11px] text-slate-500 font-mono">
                <span>Stateless Storage Enabled</span>
                <span>Port 22 Supported</span>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Main Application UI */
          <div className="flex flex-col gap-6">
            
            {/* Nav Menu */}
            <div className="flex flex-wrap border-b border-slate-900 gap-1 bg-slate-900/30 p-1.5 rounded-xl border border-slate-800/40">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "dashboard"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
              
              <button
                onClick={() => {
                  setActiveTab("lvm");
                  fetchMetrics();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "lvm"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>LVM & Filesystem Resizer</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("disks");
                  fetchMetrics();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "disks"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <HardDrive className="w-4 h-4" />
                <span>Block Devices (lsblk)</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("processes");
                  fetchMetrics();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "processes"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>Processes</span>
              </button>

              <button
                onClick={() => setActiveTab("terminal")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "terminal"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ShellIcon className="w-4 h-4" />
                <span>SSH Shell</span>
              </button>

              <button
                onClick={() => setActiveTab("users")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "users"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-4 h-4" />
                <span>Users & Groups</span>
              </button>

              <button
                onClick={() => setActiveTab("ufw")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "ufw"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>UFW Firewall</span>
              </button>

              <button
                onClick={() => setActiveTab("backups")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "backups"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Disaster Backups</span>
              </button>

              <button
                onClick={() => setActiveTab("logs")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === "logs"
                    ? "bg-slate-900 text-indigo-400 shadow-sm border border-slate-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Audit Logs</span>
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 min-h-[500px]">
              
              {/* Dashboard Tab */}
              {activeTab === "dashboard" && (
                <div className="space-y-6">
                  {systemInfo ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Host Card */}
                      <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between">
                        <div>
                          <div className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Host Identity</div>
                          <h3 className="text-xl font-mono font-bold text-white tracking-tight break-all">
                            {systemInfo.hostname}
                          </h3>
                        </div>
                        <div className="mt-6 space-y-2 border-t border-slate-800/60 pt-4 text-xs font-mono">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Distribution:</span>
                            <span className="text-slate-300 font-semibold">{systemInfo.os}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Kernel:</span>
                            <span className="text-slate-400">{systemInfo.kernel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Uptime:</span>
                            <span className="text-slate-300">{systemInfo.uptime}</span>
                          </div>
                        </div>
                      </div>

                      {/* CPU & Load Metrics */}
                      <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="text-slate-500 font-bold text-xs uppercase tracking-wider">CPU Metric</div>
                            <h3 className="text-lg font-bold text-white mt-1">
                              {systemInfo.cpuUsage.toFixed(1)}% Usage
                            </h3>
                          </div>
                          <Cpu className="w-8 h-8 text-indigo-500" />
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, systemInfo.cpuUsage))}%` }}
                          />
                        </div>

                        <div className="mt-5 space-y-2 border-t border-slate-800/60 pt-4 text-xs font-mono">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Cores available:</span>
                            <span className="text-slate-300">{systemInfo.cpuCores} vCPUs</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Load Average:</span>
                            <span className="text-slate-300 font-semibold">{systemInfo.loadAvg}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Model:</span>
                            <span className="text-slate-400 truncate max-w-[150px]" title={systemInfo.cpuModel}>
                              {systemInfo.cpuModel || "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Memory Metrics */}
                      <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6">
                        {(() => {
                          const ramUsed = systemInfo.ram.used;
                          const ramTotal = systemInfo.ram.total;
                          const ramPct = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;
                          return (
                            <>
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <div className="text-slate-500 font-bold text-xs uppercase tracking-wider">System RAM</div>
                                  <h3 className="text-lg font-bold text-white mt-1">
                                    {ramPct.toFixed(1)}% Used
                                  </h3>
                                </div>
                                <Activity className="w-8 h-8 text-emerald-500" />
                              </div>

                              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.max(0, ramPct))}%` }}
                                />
                              </div>

                              <div className="mt-5 space-y-2 border-t border-slate-800/60 pt-4 text-xs font-mono">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Total Memory:</span>
                                  <span className="text-slate-300">{ramTotal} MB</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Used Memory:</span>
                                  <span className="text-slate-300">{ramUsed} MB</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Free / Available:</span>
                                  <span className="text-emerald-400 font-semibold">{systemInfo.ram.available} MB</span>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Disk Summary */}
                      <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <HardDrive className="w-5 h-5 text-indigo-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Root Filesystem (/) Usage</span>
                          </div>
                          <div className="text-2xl font-bold font-mono text-white mt-2">
                            {systemInfo.rootDisk.used} / {systemInfo.rootDisk.total}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Available space remaining: {systemInfo.rootDisk.available}
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <div className="flex justify-between text-xs font-mono text-slate-500 mb-1.5">
                            <span>Used: {systemInfo.rootDisk.percentage}</span>
                            <span>Free: {100 - parseInt(systemInfo.rootDisk.percentage || "0", 10)}%</span>
                          </div>
                          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-900">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                parseInt(systemInfo.rootDisk.percentage || "0", 10) > 85 
                                  ? "bg-gradient-to-r from-rose-500 to-red-600" 
                                  : "bg-gradient-to-r from-indigo-500 to-indigo-600"
                              }`}
                              style={{ width: `${systemInfo.rootDisk.percentage}` }}
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-900 rounded-2xl">
                      <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                      <p className="text-slate-400 text-sm">Gathering current server metrics...</p>
                    </div>
                  )}

                  {/* Quick-Access Tools & Polling */}
                  <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span className="text-slate-400">Auto Refresh: Every 8 seconds</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                          autoRefresh 
                            ? "bg-indigo-950/40 border-indigo-900/50 text-indigo-400 hover:bg-indigo-950" 
                            : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {autoRefresh ? "Active" : "Paused"}
                      </button>

                      <button
                        onClick={() => fetchMetrics()}
                        className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Force Sync</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* LVM Tab */}
              {activeTab === "lvm" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column - List LVM Elements */}
                  <div className="lg:col-span-7 space-y-6">
                    
                    {/* Volume Groups */}
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6">
                      <div className="flex items-center gap-2.5 mb-4 border-b border-slate-800/60 pb-3">
                        <Database className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-bold text-white text-base">Volume Groups (VGs)</h3>
                      </div>

                      {lvmVGs.length > 0 ? (
                        <div className="space-y-4">
                          {lvmVGs.map(vg => (
                            <div key={vg.vgName} className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 space-y-3 font-mono text-xs">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-white text-sm">{vg.vgName}</span>
                                <span className="bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">
                                  PVs: {vg.pvCount} | LVs: {vg.lvCount}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-slate-500">
                                  <span>Free Space:</span>
                                  <span className="text-indigo-400 font-bold">{formatBytes(vg.free)}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                  <span>Total Size:</span>
                                  <span className="text-slate-300">{formatBytes(vg.size)}</span>
                                </div>
                              </div>

                              {/* Free Space Percentage indicator */}
                              {vg.size > 0 && (
                                <div className="space-y-1 pt-1">
                                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-indigo-500 h-full transition-all duration-300"
                                      style={{ width: `${(vg.free / vg.size) * 100}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-slate-600 text-right">
                                    {((vg.free / vg.size) * 100).toFixed(1)}% FREE
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-slate-500 text-xs font-mono">
                          No Volume Groups (VG) found on target server.
                        </div>
                      )}
                    </div>

                    {/* Logical Volumes (List) */}
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
                        <div className="flex items-center gap-2.5">
                          <Folder className="w-5 h-5 text-indigo-400" />
                          <h3 className="font-bold text-white text-base">Logical Volumes (LVs)</h3>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">Select to resize</span>
                      </div>

                      {lvmLVs.length > 0 ? (
                        <div className="divide-y divide-slate-800/50">
                          {lvmLVs.map(lv => {
                            const isSelected = selectedLV?.path === lv.path;
                            return (
                              <button
                                key={lv.path}
                                onClick={() => {
                                  setSelectedLV(lv);
                                  setResizeOutput(null);
                                  setResizeError(null);
                                }}
                                className={`w-full text-left py-3.5 px-3 rounded-xl transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                  isSelected 
                                    ? "bg-indigo-950/20 border border-indigo-500/30 text-indigo-200" 
                                    : "hover:bg-slate-800/30 border border-transparent text-slate-300"
                                }`}
                              >
                                <div className="space-y-1.5 font-mono text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-white text-sm">{lv.lvName}</span>
                                    <span className="text-[10px] text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.2 rounded">
                                      {lv.vgName}
                                    </span>
                                  </div>
                                  <div className="text-slate-500 break-all text-[11px]" title={`Path: ${lv.path}`}>
                                    {lv.path}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 justify-between md:justify-end shrink-0">
                                  <span className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-slate-300 font-mono font-semibold">
                                    {formatBytes(lv.size)}
                                  </span>
                                  {isSelected ? (
                                    <ChevronRight className="w-4 h-4 text-indigo-400 hidden md:block" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-600 hidden md:block" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-slate-500 text-xs font-mono">
                          No Logical Volumes (LV) found. Ensure SSH user has sudo permissions to execute lvs.
                        </div>
                      )}
                    </div>

                    {/* Physical Volumes */}
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6">
                      <div className="flex items-center gap-2.5 mb-4 border-b border-slate-800/60 pb-3">
                        <HardDrive className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-bold text-white text-base">Physical Volumes (PVs)</h3>
                      </div>

                      {lvmPVs.length > 0 ? (
                        <div className="space-y-3 font-mono text-xs">
                          {lvmPVs.map(pv => (
                            <div key={pv.pvName} className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-200">{pv.pvName}</span>
                                <span className="ml-2 text-slate-500 text-[10px]">VG: {pv.vgName || "None"}</span>
                              </div>
                              <div className="flex gap-4">
                                <span className="text-slate-500">Size: <strong className="text-slate-300 font-normal">{formatBytes(pv.size)}</strong></span>
                                <span className="text-slate-500">Free: <strong className="text-indigo-400 font-normal">{formatBytes(pv.free)}</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-slate-500 text-xs font-mono">
                          No Physical Volumes (PV) reported.
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Right Column - Resize Control Panel */}
                  <div className="lg:col-span-5">
                    
                    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sticky top-24 space-y-6">
                      <div className="border-b border-slate-800/60 pb-3">
                        <h3 className="font-bold text-white text-base">Resize Control Panel</h3>
                        <p className="text-xs text-slate-400 mt-1">Safely expand or shrink logical partitions & filesystems</p>
                      </div>

                      {selectedLV ? (
                        <div className="space-y-6">
                          
                          {/* Selected Info Summary */}
                          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                            <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Active Logical Volume Target</div>
                            <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                              <span className="font-bold text-white text-sm">{selectedLV.lvName}</span>
                              <span className="bg-indigo-950 text-indigo-300 border border-indigo-900/50 px-2 py-0.5 rounded text-[10px]">
                                {formatBytes(selectedLV.size)}
                              </span>
                            </div>
                            <div className="space-y-1 pt-1 text-[11px]">
                              <div className="flex justify-between text-slate-400">
                                <span>Path:</span>
                                <span className="text-slate-300 break-all select-all text-right">{selectedLV.path}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Volume Group:</span>
                                <span className="text-slate-300">{selectedLV.vgName}</span>
                              </div>
                              {selectedLVGroup && (
                                <div className="flex justify-between text-slate-400">
                                  <span>VG Free Space:</span>
                                  <span className="text-emerald-400 font-semibold">{formatBytes(selectedLVGroup.free)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Mode Select Form */}
                          <div className="space-y-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                Resize Operation
                              </label>
                              <div className="grid grid-cols-2 gap-2 text-xs font-semibold font-mono">
                                <button
                                  type="button"
                                  onClick={() => setResizeMode("extend")}
                                  className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                                    resizeMode === "extend"
                                      ? "bg-indigo-950/40 border-indigo-500 text-indigo-300 font-bold"
                                      : "bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  Extend (+)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResizeMode("shrink")}
                                  className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                                    resizeMode === "shrink"
                                      ? "bg-rose-950/40 border-rose-900 text-rose-300 font-bold"
                                      : "bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  Shrink (-)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResizeMode("set")}
                                  className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                                    resizeMode === "set"
                                      ? "bg-slate-900 border-indigo-500/40 text-indigo-300"
                                      : "bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  Set Absolute (=)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResizeMode("max")}
                                  className={`py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                                    resizeMode === "max"
                                      ? "bg-amber-950/40 border-amber-900 text-amber-300"
                                      : "bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  Use 100% Free Max
                                </button>
                              </div>
                            </div>

                            {/* Size Input Fields */}
                            {resizeMode !== "max" && (
                              <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                  Offset / Size Value
                                </label>
                                <div className="flex gap-2 font-mono">
                                  <input
                                    type="text"
                                    placeholder="5"
                                    value={resizeSize}
                                    onChange={(e) => setResizeSize(e.target.value)}
                                    className="flex-1 bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 text-sm transition-all outline-none"
                                  />
                                  <select
                                    value={resizeUnit}
                                    onChange={(e) => setResizeUnit(e.target.value as "G" | "M")}
                                    className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 text-sm focus:border-indigo-500 outline-none transition-all cursor-pointer"
                                  >
                                    <option value="G">GB</option>
                                    <option value="M">MB</option>
                                  </select>
                                </div>
                              </div>
                            )}

                            {/* Commands Preview Terminal Block */}
                            <div className="bg-slate-950 rounded-xl p-4 border border-slate-900 space-y-2.5">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Command To Be Run</span>
                                <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.2 rounded font-mono">online-resize (ext4/xfs)</span>
                              </div>
                              <div className="font-mono text-xs bg-slate-900/60 p-3 rounded-lg text-emerald-400 break-all select-all leading-relaxed">
                                {lvmCommandPreview ? (
                                  <>
                                    <span className="text-slate-500 select-none"># </span>
                                    {lvmCommandPreview}
                                  </>
                                ) : (
                                  <span className="text-slate-600">Generating command preview...</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 leading-relaxed">
                                {resizeMode === "shrink" ? (
                                  <span className="text-rose-400 font-semibold">
                                    ⚠️ Shrinking: Runs FS check, safely checks content boundaries, shrinks ext4 filesystems with resize2fs, and shrinks the volume safely.
                                  </span>
                                ) : resizeMode === "max" ? (
                                  <span className="text-emerald-500">
                                    🚀 Extend Max: Safely consumes remaining free Volume Group spaces on-the-fly without service interruption.
                                  </span>
                                ) : (
                                  <span>
                                    ⚡ Extend: Expands the Logical Volume and automatically grows the ext4/xfs file system online.
                                  </span>
                                )}
                              </p>
                            </div>

                            {/* Action Button */}
                            <button
                              type="button"
                              onClick={executeLvmResize}
                              disabled={isResizing}
                              className={`w-full font-bold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 text-sm ${
                                resizeMode === "shrink"
                                  ? "bg-rose-700 hover:bg-rose-600 disabled:bg-rose-900 text-white shadow-rose-950/10"
                                  : "bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white shadow-indigo-950/10"
                              }`}
                            >
                              {isResizing ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>Executing Safe Resizing Operations...</span>
                                </>
                              ) : (
                                <>
                                  <ArrowRightLeft className="w-4 h-4" />
                                  <span>Apply Resize Operation</span>
                                </>
                              )}
                            </button>

                          </div>

                          {/* Real-time Outputs / Log details */}
                          {(resizeError || resizeOutput) && (
                            <div className="space-y-3 font-mono text-xs border-t border-slate-800/60 pt-4">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Execution Logs</span>
                                <button 
                                  onClick={() => { setResizeOutput(null); setResizeError(null); }}
                                  className="text-slate-500 hover:text-slate-300"
                                >
                                  Clear
                                </button>
                              </div>
                              
                              {resizeError && (
                                <div className="bg-rose-950/30 border border-rose-900/30 text-rose-400 p-4 rounded-xl leading-relaxed whitespace-pre-wrap">
                                  {resizeError}
                                </div>
                              )}

                              {resizeOutput && (
                                <div className="bg-slate-950 text-slate-300 p-4 rounded-xl border border-slate-800 max-h-[160px] overflow-y-auto leading-relaxed scrollbar-thin">
                                  <div className="text-emerald-400 font-bold mb-1.5">[Operation Completed Successfully]</div>
                                  <pre className="whitespace-pre-wrap text-[11px] font-mono">{resizeOutput}</pre>
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/40 rounded-2xl text-center px-4">
                          <Database className="w-10 h-10 text-slate-600 mb-4" />
                          <h4 className="text-slate-300 font-semibold text-sm">No volume selected</h4>
                          <p className="text-xs text-slate-500 mt-2 max-w-[240px] leading-relaxed">
                            Select a Logical Volume from the list on the left to load partition resizing operations.
                          </p>
                        </div>
                      )}

                    </div>
                  </div>

                </div>
              )}

              {/* Block Devices Tab (lsblk) */}
              {activeTab === "disks" && (
                <div className="space-y-6">
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base">Block Storage Layout</h3>
                        <p className="text-xs text-slate-400 mt-1">Real-time disk hierarchies mapped directly from lsblk</p>
                      </div>
                      <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-900/40 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold">
                        Agentless Map
                      </span>
                    </div>

                    {blockDevices.length > 0 ? (
                      <div className="flex flex-col">
                        
                        {/* Table Header */}
                        <div className="bg-slate-950/50 px-6 py-3 border-b border-slate-800 flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono">
                          <span>Device Architecture</span>
                          <div className="flex gap-16">
                            <span>Capacity</span>
                            <span>Mount State</span>
                          </div>
                        </div>

                        {/* List Renderer */}
                        <div className="divide-y divide-slate-800/40">
                          {blockDevices.map(device => renderBlockDevice(device, 0))}
                        </div>
                      </div>
                    ) : (
                      <div className="py-20 text-center text-slate-500 text-xs font-mono">
                        No Block Devices reported. Check SSH credentials or terminal capabilities.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Processes Tab */}
              {activeTab === "processes" && (
                <div className="space-y-6">
                  
                  {/* Processes Filter & Search Bar */}
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:max-w-sm">
                      <span className="absolute left-4 top-3 text-slate-500">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="Search process by name, PID, or user..."
                        value={procSearch}
                        onChange={(e) => setProcSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 rounded-xl pl-11 pr-4 py-2.5 text-slate-100 placeholder-slate-600 font-mono text-xs transition-all outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto font-mono text-xs shrink-0">
                      <span className="text-slate-500">Privilege:</span>
                      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/80">
                        <button
                          onClick={() => setProcUserFilter("all")}
                          className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                            procUserFilter === "all" ? "bg-slate-900 text-white border border-slate-800" : "text-slate-400"
                          }`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setProcUserFilter("root")}
                          className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                            procUserFilter === "root" ? "bg-slate-900 text-rose-400 border border-slate-800" : "text-slate-400"
                          }`}
                        >
                          Root
                        </button>
                        <button
                          onClick={() => setProcUserFilter("non-root")}
                          className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                            procUserFilter === "non-root" ? "bg-slate-900 text-white border border-slate-800" : "text-slate-400"
                          }`}
                        >
                          User
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Processes Table Grid */}
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base">Active Task Monitoring</h3>
                        <p className="text-xs text-slate-400 mt-1">Snapshot of running processes sorted by resource load</p>
                      </div>
                      <span className="text-[10px] font-mono bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded">
                        Total tracked: {filteredProcesses.length}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-xs">
                        <thead className="bg-slate-950/50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-800 text-[10px]">
                          <tr>
                            <th 
                              onClick={() => toggleSort("pid")} 
                              className="py-3.5 px-6 cursor-pointer hover:bg-slate-900 hover:text-slate-300 transition-colors select-none"
                            >
                              <div className="flex items-center gap-1">
                                <span>PID</span>
                                <span className="text-indigo-400 font-bold">{renderSortArrow("pid")}</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => toggleSort("user")} 
                              className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 hover:text-slate-300 transition-colors select-none"
                            >
                              <div className="flex items-center gap-1">
                                <span>User</span>
                                <span className="text-indigo-400 font-bold">{renderSortArrow("user")}</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => toggleSort("cpu")} 
                              className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 hover:text-slate-300 transition-colors select-none text-center"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>%CPU</span>
                                <span className="text-indigo-400 font-bold">{renderSortArrow("cpu")}</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => toggleSort("mem")} 
                              className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 hover:text-slate-300 transition-colors select-none text-center"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>%MEM</span>
                                <span className="text-indigo-400 font-bold">{renderSortArrow("mem")}</span>
                              </div>
                            </th>
                            <th 
                              onClick={() => toggleSort("command")} 
                              className="py-3.5 px-4 cursor-pointer hover:bg-slate-900 hover:text-slate-300 transition-colors select-none"
                            >
                              <div className="flex items-center gap-1">
                                <span>Command</span>
                                <span className="text-indigo-400 font-bold">{renderSortArrow("command")}</span>
                              </div>
                            </th>
                            <th className="py-3.5 px-6 text-right select-none">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {filteredProcesses.length > 0 ? (
                            filteredProcesses.map(proc => (
                              <tr key={proc.pid} className="hover:bg-slate-800/20 text-slate-300 transition-colors">
                                <td className="py-3 px-6 text-indigo-400 font-bold">{proc.pid}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] ${
                                    proc.user === "root" ? "bg-rose-950/20 text-rose-400 border border-rose-900/20" : "bg-slate-950 text-slate-400"
                                  }`}>
                                    {proc.user}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center text-slate-200 font-bold">{proc.cpu}%</td>
                                <td className="py-3 px-4 text-center text-slate-400">{proc.mem}%</td>
                                <td className="py-3 px-4 max-w-[280px] truncate" title={proc.command}>
                                  {proc.command}
                                </td>
                                <td className="py-3 px-6 text-right">
                                  <button
                                    onClick={() => killProcess(proc.pid)}
                                    className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-950/10 hover:bg-rose-950/30 rounded border border-rose-900/20 hover:border-rose-900/40 transition-colors cursor-pointer"
                                    title="SIGKILL Process"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-xs">
                                No processes matching your filter search criteria.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Terminal SSH Tab */}
              {activeTab === "terminal" && (
                <div className="space-y-6">
                  
                  {/* Console Container */}
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 space-y-4">
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
                      <div>
                        <h3 className="font-bold text-white text-base">Direct SSH Console</h3>
                        <p className="text-xs text-slate-400 mt-1">Execute safe custom scripts or admin commands directly on the server</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={useSudoForTerminal} 
                            onChange={(e) => setUseSudoForTerminal(e.target.checked)}
                            className="accent-indigo-500 rounded border-slate-800 bg-slate-950" 
                          />
                          <span>Sudo Mode</span>
                        </label>
                        
                        <button 
                          onClick={() => setTerminalLogs([])}
                          className="text-xs text-slate-500 hover:text-slate-300 font-mono bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg cursor-pointer"
                        >
                          Clear Screen
                        </button>
                      </div>
                    </div>

                    {/* Presets Grid */}
                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                      <span className="text-slate-500 self-center mr-1">Presets:</span>
                      <button 
                        onClick={() => executeTerminalCommand("df -h", false)}
                        className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                      >
                        df -h
                      </button>
                      <button 
                        onClick={() => executeTerminalCommand("ip a || ip route", false)}
                        className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                      >
                        ip address
                      </button>
                      <button 
                        onClick={() => executeTerminalCommand("systemctl list-units --type=service --state=running | head -n 25", true)}
                        className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                      >
                        running services
                      </button>
                      <button 
                        onClick={() => executeTerminalCommand("ss -tulpn", true)}
                        className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                      >
                        open ports
                      </button>
                    </div>

                    {/* Console Input Bar */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-3 text-slate-500 font-mono select-none">$</span>
                        <input
                          type="text"
                          placeholder="Enter shell command to run on target server (e.g. uname -a, service nginx status)..."
                          value={terminalCmd}
                          onChange={(e) => setTerminalCmd(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isExecutingTerminal) {
                              executeTerminalCommand();
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 rounded-xl pl-9 pr-4 py-2.5 text-slate-100 placeholder-slate-600 font-mono text-xs transition-all outline-none"
                        />
                      </div>
                      <button
                        onClick={() => executeTerminalCommand()}
                        disabled={isExecutingTerminal || !terminalCmd.trim()}
                        className="px-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/40 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/10"
                      >
                        {isExecutingTerminal ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>Run</span>
                      </button>
                    </div>

                    {/* Console Output Screen logs */}
                    <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 min-h-[300px] max-h-[500px] overflow-y-auto font-mono text-xs space-y-4 scrollbar-thin leading-relaxed">
                      {terminalLogs.length > 0 ? (
                        terminalLogs.map((log, i) => (
                          <div key={i} className="border-b border-slate-900/60 last:border-none pb-4 last:pb-0">
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                              <span className="flex items-center gap-1">
                                <span className="text-indigo-400 font-bold">$</span> 
                                <strong className="text-slate-300 font-semibold">{log.command}</strong>
                                {log.useSudo && <span className="bg-rose-950 text-rose-400 px-1 py-0.1 text-[9px] rounded font-bold uppercase ml-1">sudo</span>}
                              </span>
                              <span>{log.timestamp}</span>
                            </div>
                            <pre className={`whitespace-pre-wrap rounded-lg p-3 ${
                              log.isError 
                                ? "bg-rose-950/20 border border-rose-900/20 text-rose-400" 
                                : "bg-slate-900/40 border border-slate-800/40 text-slate-300"
                            }`}>
                              {log.output.trim() || "[No output returned]"}
                            </pre>
                          </div>
                        ))
                      ) : (
                        <div className="h-[250px] flex flex-col items-center justify-center text-slate-600">
                          <Terminal className="w-10 h-10 mb-2 text-slate-700" />
                          <span>Console is ready. Type a command or click a preset above.</span>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {activeTab === "users" && token && (
                <UserManagement token={token} logAction={logAction} />
              )}

              {activeTab === "ufw" && token && (
                <UfwManagement token={token} logAction={logAction} />
              )}

              {activeTab === "backups" && token && (
                <BackupManagement token={token} blockDevices={blockDevices} logAction={logAction} />
              )}

              {activeTab === "logs" && token && (
                <LogViewer 
                  token={token} 
                  logs={limunaLogs} 
                  onClearLogs={() => {
                    setLimunaLogs([]);
                    localStorage.removeItem("limuna_admin_logs");
                  }} 
                />
              )}

            </div>

          </div>
        )}

      </main>

      <footer className="border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500 font-mono flex flex-col sm:flex-row sm:justify-between items-center gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span>Limuna Admin Control Panel v1.0.0</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="text-slate-400 font-sans">
            Created by <span className="font-semibold text-amber-500">D.khandan v1.0</span>
          </span>
        </div>
        <div className="flex items-center gap-1 bg-slate-900/50 px-2.5 py-1 rounded border border-slate-800 text-[10px]">
          <span>Security Protocol: Secure Shell v2</span>
        </div>
      </footer>

    </div>
  );
}

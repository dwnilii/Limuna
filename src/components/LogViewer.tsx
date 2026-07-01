import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Trash2, 
  Search, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  Terminal, 
  RefreshCw,
  Server,
  Shield,
  Activity
} from "lucide-react";
import { LimunaLog } from "../types";

interface LogViewerProps {
  token: string;
  logs: LimunaLog[];
  onClearLogs: () => void;
}

export default function LogViewer({ token, logs, onClearLogs }: LogViewerProps) {
  const [activeSubTab, setActiveSubTab] = useState<"panel" | "system">("panel");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "error" | "info">("all");

  // System Logs states
  const [systemLogs, setSystemLogs] = useState<string>("");
  const [logSource, setLogSource] = useState<"syslog" | "auth" | "kernel" | "journal">("syslog");
  const [isLoadingSysLog, setIsLoadingSysLog] = useState(false);
  const [sysLogErr, setSysLogErr] = useState<string | null>(null);

  const fetchSystemLogs = async () => {
    setIsLoadingSysLog(true);
    setSysLogErr(null);
    setSystemLogs("");

    let command = "";
    if (logSource === "syslog") {
      command = "tail -n 100 /var/log/syslog 2>/dev/null || tail -n 100 /var/log/messages 2>/dev/null || echo 'No syslog files readable.'";
    } else if (logSource === "auth") {
      command = "tail -n 100 /var/log/auth.log 2>/dev/null || tail -n 100 /var/log/secure 2>/dev/null || echo 'No authorization logs readable.'";
    } else if (logSource === "kernel") {
      command = "dmesg | tail -n 100 2>/dev/null || echo 'No dmesg buffer accessible.'";
    } else if (logSource === "journal") {
      command = "journalctl -n 100 --no-pager 2>/dev/null || echo 'Systemd journalctl not available.'";
    }

    try {
      const response = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({ command, useSudo: true })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch logs");
      setSystemLogs(data.output || "No active log lines found.");
    } catch (err: any) {
      setSysLogErr(err.message || "Could not read remote system log files.");
    } finally {
      setIsLoadingSysLog(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "system" && token) {
      fetchSystemLogs();
    }
  }, [activeSubTab, logSource, token]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || log.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6" id="log-viewer-container">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/60">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            Audit Logging & Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review detailed operational audit trails, local management metrics, and read live remote logs straight from the SSH host
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeSubTab === "panel" ? (
            <button 
              onClick={onClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/40 rounded-xl border border-red-900/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Panel History
            </button>
          ) : (
            <button 
              onClick={fetchSystemLogs}
              disabled={isLoadingSysLog}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl border border-slate-700/60 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSysLog ? "animate-spin" : ""}`} />
              Reload Stream
            </button>
          )}
        </div>
      </div>

      {/* Sub tabs switches */}
      <div className="flex border-b border-slate-800/80 gap-6">
        <button 
          onClick={() => setActiveSubTab("panel")}
          className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
            activeSubTab === "panel" 
              ? "border-indigo-500 text-white" 
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            Limuna Panel Activity Audit ({logs.length})
          </span>
        </button>
        <button 
          onClick={() => setActiveSubTab("system")}
          className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all ${
            activeSubTab === "system" 
              ? "border-indigo-500 text-white" 
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5" />
            Live Remote Syslogs (SSH)
          </span>
        </button>
      </div>

      {/* Audit Panel Logs Subview */}
      {activeSubTab === "panel" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search panel activities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Status filter:</span>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(["all", "success", "error", "info"] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-3 py-1 text-[10px] font-semibold uppercase rounded-lg transition-colors ${
                      filterStatus === st 
                        ? "bg-slate-800 text-white" 
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Logs List representation */}
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden divide-y divide-slate-800/40">
            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono text-xs">
                No activity logs found matching the filter criteria.
              </div>
            ) : (
              filteredLogs.map(log => (
                <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-slate-900/10 transition-colors">
                  <div className="mt-0.5">
                    {log.status === "success" && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                    {log.status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
                    {log.status === "info" && <Info className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5">
                      <span className="font-bold text-slate-200 text-xs tracking-tight">{log.action}</span>
                      <span className="font-mono text-[9px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-400 text-xs font-mono break-all">{log.details}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Live SSH Server Logs Subview */}
      {activeSubTab === "system" && (
        <div className="space-y-4">
          {/* Select Log Source */}
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-300">Remote Log Stream Target</span>
            </div>
            
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto w-full sm:w-auto">
              {(["syslog", "auth", "kernel", "journal"] as const).map(src => (
                <button
                  key={src}
                  onClick={() => setLogSource(src)}
                  className={`px-3 py-1 text-[10px] font-semibold uppercase rounded-lg transition-colors shrink-0 ${
                    logSource === src 
                      ? "bg-slate-800 text-white" 
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {src === "syslog" && "System Log"}
                  {src === "auth" && "Auth/Security Log"}
                  {src === "kernel" && "Kernel Buffer (dmesg)"}
                  {src === "journal" && "Systemd Journal"}
                </button>
              ))}
            </div>
          </div>

          {/* Console Output Terminal */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[500px]">
            {/* Terminal Header */}
            <div className="px-5 py-3 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[10px] font-bold font-mono text-slate-400 uppercase">
                  Remote Terminal Buffer • last 100 entries
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">Live SSH Reader</span>
              </div>
            </div>

            {/* Terminal Buffer */}
            <div className="flex-1 p-5 overflow-y-auto font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre bg-black/40">
              {isLoadingSysLog ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Streaming live logs from remote host...</span>
                </div>
              ) : sysLogErr ? (
                <div className="text-red-400 text-xs p-4 border border-red-900/20 bg-red-950/10 rounded-xl">
                  Error executing log retrieval: {sysLogErr}
                  <p className="mt-2 text-[10px] text-slate-500 leading-normal">
                    This might occur if you are not connected as root, sudo privileges are misconfigured, or the targeted log file (/var/log/*) is not accessible on this operating system.
                  </p>
                </div>
              ) : (
                systemLogs || "Waiting for log retrieval. Click Refresh."
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

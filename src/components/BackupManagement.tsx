import React, { useState, useEffect } from "react";
import { 
  Database, 
  Download, 
  RotateCcw, 
  Trash2, 
  FileArchive, 
  Compass, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle, 
  Terminal, 
  RefreshCw,
  PlusCircle,
  Cpu
} from "lucide-react";
import { BlockDevice } from "../types";

interface BackupManagementProps {
  token: string;
  blockDevices: BlockDevice[];
  logAction: (action: string, details: string, status: "success" | "error" | "info") => void;
}

export default function BackupManagement({ token, blockDevices, logAction }: BackupManagementProps) {
  const [backups, setBackups] = useState<{name: string, size: number, mtime: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form parameters
  const [backupType, setBackupType] = useState<"dd" | "tar">("dd");
  const [backupSource, setBackupSource] = useState("");
  const [backupFilename, setBackupFilename] = useState("system_full_backup");
  const [compression, setCompression] = useState<"gzip" | "none">("gzip");

  // Restore calculations
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<string | null>(null);
  const [restoreTargetDevice, setRestoreTargetDevice] = useState("");
  const [restoreInstructions, setRestoreInstructions] = useState<string[]>([]);
  const [restoreCommand, setRestoreCommand] = useState("");

  // Safe non-modal confirmation states
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(null);

  const fetchBackups = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backup/list", {
        headers: { "x-ssh-token": token }
      });
      if (!res.ok) throw new Error("Failed to list backups stored on remote system");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchBackups();
    }
  }, [token]);

  // Handle backup execution
  const handleRunBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupSource || !backupFilename.trim()) return;

    setIsActionRunning(true);
    setError(null);
    setSuccess(null);

    const sourceName = backupSource;
    logAction("Backup Started", `Running ${backupType.toUpperCase()} backup of source "${sourceName}" to "/var/backups/limuna"...`, "info");

    try {
      const response = await fetch("/api/backup/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          type: backupType,
          source: backupSource,
          filename: backupFilename,
          compression
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Backup operation failed");
      }

      setSuccess(`Backup of ${sourceName} completed successfully! File saved in "/var/backups/limuna"`);
      logAction("Backup Succeeded", `Successfully backed up "${sourceName}" to "/var/backups/limuna" using command: ${data.command}`, "success");
      
      // Reset Form default
      setBackupFilename("system_full_backup_" + Date.now().toString().slice(-4));
      
      fetchBackups();
    } catch (err: any) {
      setError(err.message);
      logAction("Backup Failed", `Backup of "${sourceName}" failed: ${err.message}`, "error");
    } finally {
      setIsActionRunning(false);
    }
  };

  // Handle backup deletion
  const handleDeleteBackup = async (name: string) => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/backup/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({ name })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete backup file");

      setSuccess(`Backup file "${name}" deleted successfully.`);
      logAction("Backup Deleted", `Deleted backup image "${name}" from server.`, "success");
      fetchBackups();
    } catch (err: any) {
      setError(err.message);
      logAction("Backup Deletion Failed", `Failed to delete backup "${name}": ${err.message}`, "error");
    }
  };

  // Handle restore details builder
  const handleCalculateRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBackupForRestore || !restoreTargetDevice) return;

    setError(null);
    try {
      const response = await fetch("/api/backup/restore-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          name: selectedBackupForRestore,
          targetDevice: restoreTargetDevice
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate restore calculations");

      setRestoreCommand(data.command);
      setRestoreInstructions(data.instructions);
      logAction("Restore Configuration Generated", `Generated bare-metal recovery plans for backup "${selectedBackupForRestore}" onto target device "${restoreTargetDevice}".`, "info");
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Convert bytes to human readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Flattened block devices list to select as backups
  const getFlatDevices = () => {
    const list: { name: string; size: string; fstype: string }[] = [];
    blockDevices.forEach(dev => {
      list.push({ name: `/dev/${dev.name}`, size: dev.size, fstype: dev.fstype || "Raw Disk" });
      if (dev.children) {
        dev.children.forEach(child => {
          list.push({ name: `/dev/${child.name}`, size: child.size, fstype: child.fstype || "Partition" });
        });
      }
    });
    return list;
  };

  const flatDevices = getFlatDevices();

  return (
    <div className="space-y-6" id="backup-management-container">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/60">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            Full-Disk Backup & Disaster Recovery
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Perform physical sector backups (raw image binaries) and tarball directories. Save recovery files and restore them to bare metal / clean servers.
          </p>
        </div>
        <button 
          onClick={fetchBackups}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl border border-slate-700/60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Reload Image Registry
        </button>
      </div>

      {/* Message Notifications */}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-emerald-200 text-xs flex items-start gap-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      {/* Core Functions layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Run Backup Form (Column span 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800/60 pb-3">
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              Initiate System / Block Backup
            </h3>
            
            <form onSubmit={handleRunBackup} className="space-y-4">
              {/* Type selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Backup Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setBackupType("dd");
                      setBackupSource(flatDevices[0]?.name || "");
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      backupType === "dd" 
                        ? "bg-indigo-600 border-indigo-500 text-white" 
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    DD Physical Disk
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setBackupType("tar");
                      setBackupSource("/");
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      backupType === "tar" 
                        ? "bg-indigo-600 border-indigo-500 text-white" 
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    TAR File Tree
                  </button>
                </div>
              </div>

              {/* Source Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">
                  {backupType === "dd" ? "Source Block Device" : "Source Folder Path"}
                </label>
                {backupType === "dd" ? (
                  <select 
                    value={backupSource}
                    onChange={e => setBackupSource(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value="">-- Select Disk Partition --</option>
                    {flatDevices.map(d => (
                      <option key={d.name} value={d.name}>
                        {d.name} ({d.size} - {d.fstype})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. /etc or /var/www or /"
                    value={backupSource}
                    onChange={e => setBackupSource(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                )}
              </div>

              {/* Output Filename */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Target Backup Filename</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. sda_root_recovery"
                    value={backupFilename}
                    onChange={e => setBackupFilename(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 py-2.5 font-bold font-mono">
                    {backupType === "dd" 
                      ? (compression === "gzip" ? ".img.gz" : ".img") 
                      : (compression === "gzip" ? ".tar.gz" : ".tar")}
                  </span>
                </div>
              </div>

              {/* Compression switch */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Compression Engine</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setCompression("gzip")}
                    className={`py-1.5 px-3 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      compression === "gzip" 
                        ? "bg-slate-800 border-indigo-500 text-slate-200" 
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}
                  >
                    GZIP (Highly Compressed)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setCompression("none")}
                    className={`py-1.5 px-3 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      compression === "none" 
                        ? "bg-slate-800 border-indigo-500 text-slate-200" 
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}
                  >
                    None (Raw speed)
                  </button>
                </div>
              </div>

              {/* Execution trigger */}
              <button 
                type="submit"
                disabled={isActionRunning || !backupSource || !backupFilename}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isActionRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Executing remote compression backup...
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    Compile & Run Backup
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Saved Backups & Restore Wizard (Column span 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* List Saved Backups */}
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800/60 bg-slate-950/20">
              <span className="text-sm font-semibold text-white">Stored System Images ({backups.length})</span>
              <p className="text-[10px] text-slate-500 mt-1">Stored securely on remote server directory: <strong className="text-indigo-400 font-mono">/var/backups/limuna</strong></p>
            </div>

            <div className="divide-y divide-slate-800/40">
              {isLoading ? (
                <div className="py-8 text-center text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span className="text-xs font-mono">Reading backup indices...</span>
                </div>
              ) : backups.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs font-mono">
                  No system backups found in /var/backups/limuna. Create one above!
                </div>
              ) : (
                backups.map(bk => (
                  <div key={bk.name} className="p-4 flex items-center justify-between hover:bg-slate-900/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileArchive className="w-5 h-5 text-indigo-400 shrink-0" />
                      <div>
                        <strong className="text-slate-200 text-xs font-mono block truncate max-w-[280px]">{bk.name}</strong>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Size: {formatBytes(bk.size)} | Date: {bk.mtime.split(".")[0]}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => {
                          setSelectedBackupForRestore(bk.name);
                          setRestoreTargetDevice(flatDevices[0]?.name || "");
                          setRestoreCommand("");
                          setRestoreInstructions([]);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700/40 text-[10px] font-semibold flex items-center gap-1 transition-colors"
                        title="Restore Wizard"
                      >
                        <RotateCcw className="w-3 h-3 text-indigo-400" />
                        Restore Plan
                      </button>
                      {confirmDeleteBackup === bk.name ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              handleDeleteBackup(bk.name);
                              setConfirmDeleteBackup(null);
                            }}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-colors font-sans cursor-pointer shrink-0"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteBackup(null)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded-lg transition-colors font-sans cursor-pointer shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmDeleteBackup(bk.name)}
                          className="p-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 transition-colors cursor-pointer"
                          title="Delete image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bare-Metal Migration / Restore Helper Wizard */}
          {selectedBackupForRestore && (
            <div className="bg-indigo-950/20 border border-indigo-900/50 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-start border-b border-indigo-900/30 pb-3">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Compass className="w-4 h-4 text-indigo-400" />
                    Bare-Metal Server Restore Wizard
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Migrate or restore <strong className="text-slate-200">{selectedBackupForRestore}</strong> onto a target machine
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedBackupForRestore(null)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800/40 rounded-lg"
                >
                  Close Wizard
                </button>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl space-y-4 border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-300 block">1. Migrating to another completely Raw (Bare-Metal) server?</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  To deploy this backup to a completely new server, copy the backup file to that server, and then run the recovery commands below.
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 font-mono text-[10px] text-indigo-400 select-all whitespace-pre-wrap">
                  {`# Step A: Transfer to target clean server (IP: target_server_ip)\nscp "/var/backups/limuna/${selectedBackupForRestore}" root@target_server_ip:/tmp/\n\n# Step B: Log into clean server and restore block device (e.g. sda)\n${
                    selectedBackupForRestore.endsWith(".img.gz")
                      ? `gunzip -c "/tmp/${selectedBackupForRestore}" | dd of=/dev/sda bs=4M status=progress`
                      : selectedBackupForRestore.endsWith(".tar.gz")
                      ? `tar -xzf "/tmp/${selectedBackupForRestore}" -C /`
                      : `dd if="/tmp/${selectedBackupForRestore}" of=/dev/sda bs=4M status=progress`
                  }`}
                </div>
              </div>

              {/* Local Restore Builder */}
              <form onSubmit={handleCalculateRestore} className="space-y-3 bg-slate-900/20 p-4 rounded-xl border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-300 block">2. Restore directly onto a secondary disk of this server:</span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] uppercase font-bold text-slate-500">Destination target block device</label>
                    <select 
                      value={restoreTargetDevice}
                      onChange={e => setRestoreTargetDevice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="">-- Select Target Disk --</option>
                      {flatDevices.map(d => (
                        <option key={d.name} value={d.name}>
                          {d.name} ({d.size} - {d.fstype})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button 
                    type="submit"
                    disabled={!restoreTargetDevice}
                    className="self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl disabled:opacity-50 transition-colors shrink-0"
                  >
                    Compile Recovery Command
                  </button>
                </div>
              </form>

              {/* Show locally compiled recovery commands */}
              {restoreCommand && (
                <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-indigo-900/30">
                  <span className="text-[10px] font-semibold text-red-400 block flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    CRITICAL LOCAL RESTORATION PLAN:
                  </span>
                  
                  <div className="space-y-1 text-[10px] text-slate-400 font-mono">
                    {restoreInstructions.map((inst, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-indigo-400 font-bold">•</span>
                        <span>{inst}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-[10px] text-emerald-400 select-all">
                    {restoreCommand}
                  </div>
                  
                  <p className="text-[9px] text-slate-500 italic">
                    Copy and run this command inside the Terminal tab or via SSH shell to perform the direct restore. Always verify destination layout beforehand.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

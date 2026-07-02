import React, { useState, useEffect } from "react";
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Play, 
  Square, 
  Settings, 
  Terminal, 
  Sliders, 
  HelpCircle,
  ArrowUpDown,
  Move,
  AlertTriangle,
  CheckCircle,
  Hash,
  Edit3
} from "lucide-react";
import { UfwRule } from "../types";

interface UfwManagementProps {
  token: string;
  logAction: (action: string, details: string, status: "success" | "error" | "info") => void;
}

export default function UfwManagement({ token, logAction }: UfwManagementProps) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [rules, setRules] = useState<UfwRule[]>([]);
  const [rawVerbose, setRawVerbose] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"rules" | "add" | "diagnostics">("rules");

  // Form states for adding rule
  const [ruleType, setRuleType] = useState<"port" | "ip">("port");
  const [action, setAction] = useState<"allow" | "deny" | "reject" | "limit">("allow");
  const [port, setPort] = useState<string>("");
  const [protocol, setProtocol] = useState<"any" | "tcp" | "udp">("any");
  const [fromIp, setFromIp] = useState<string>("");
  const [insertIndex, setInsertIndex] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  // Move priority state
  const [movingRuleIndex, setMovingRuleIndex] = useState<number | null>(null);
  const [targetMoveIndex, setTargetMoveIndex] = useState<string>("");

  // Edit rule state
  const [editingRule, setEditingRule] = useState<UfwRule | null>(null);
  const [editAction, setEditAction] = useState<"allow" | "deny" | "reject" | "limit">("allow");
  const [editPort, setEditPort] = useState<string>("");
  const [editProtocol, setEditProtocol] = useState<"any" | "tcp" | "udp">("any");
  const [editFromIp, setEditFromIp] = useState<string>("");
  const [editComment, setEditComment] = useState<string>("");

  // Safe non-modal confirmation states
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<number | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ufw/status", {
        headers: {
          "x-ssh-token": token
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch UFW status");
      }
      setInstalled(data.installed);
      setIsActive(data.isActive);
      setRules(data.rules || []);
      setRawVerbose(data.rawVerbose || data.rawNumbered || "");
    } catch (err: any) {
      setError(err.message || "Failed to communicate with the server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchStatus();
    }
  }, [token]);

  const handleToggleUfw = async (enable: boolean) => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/ufw/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({ active: enable })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to toggle UFW");
      }
      setSuccess(`UFW firewall has been successfully ${enable ? "enabled" : "disabled"}.`);
      logAction(
        enable ? "Enable Firewall" : "Disable Firewall", 
        `Turned ${enable ? "ON" : "OFF"} system firewall protection. Output: ${data.output}`, 
        "success"
      );
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      logAction("Toggle Firewall Failed", `Failed to set firewall status to ${enable ? "ON" : "OFF"}: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ruleType === "port" && !port.trim()) {
      setError("Please specify a port number.");
      return;
    }
    if (ruleType === "ip" && !fromIp.trim()) {
      setError("Please specify a source IP address.");
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/ufw/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          action,
          port: ruleType === "port" ? port : "",
          protocol: ruleType === "port" ? protocol : "any",
          fromIp: fromIp.trim(),
          insertIndex: insertIndex ? parseInt(insertIndex, 10) : undefined,
          comment: comment.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add firewall rule");
      }

      setSuccess(`Firewall rule successfully configured: ${data.command}`);
      logAction("Firewall Rule Added", `Added new rule with command: "${data.command}"`, "success");
      
      // Reset form
      setPort("");
      setFromIp("");
      setInsertIndex("");
      setProtocol("any");
      setComment("");
      setActiveTab("rules");
      
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      logAction("Add Firewall Rule Failed", `Failed to add rule: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRule = async (index: number, ruleRaw: string) => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/ufw/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({ index })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete rule");
      }

      setSuccess(`Firewall rule #${index} deleted successfully.`);
      logAction("Firewall Rule Deleted", `Deleted rule #${index}: "${ruleRaw}"`, "success");
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      logAction("Delete Firewall Rule Failed", `Failed to delete rule #${index}: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (movingRuleIndex === null || !targetMoveIndex) return;

    const toIdx = parseInt(targetMoveIndex, 10);
    if (isNaN(toIdx) || toIdx < 1) {
      setError("Please specify a valid positive target rule number.");
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/ufw/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          fromIndex: movingRuleIndex,
          toIndex: toIdx
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to re-prioritize rule");
      }

      setSuccess(`Firewall rule successfully moved from index ${movingRuleIndex} to ${toIdx}.`);
      logAction("Firewall Rule Reordered", `Moved rule from position ${movingRuleIndex} to ${toIdx}`, "success");
      
      setMovingRuleIndex(null);
      setTargetMoveIndex("");
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      logAction("Move Firewall Rule Failed", `Failed to move rule: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const startEditing = (rule: UfwRule) => {
    setEditingRule(rule);
    setMovingRuleIndex(null); // Close move panel if open
    
    // Parse action
    let act: "allow" | "deny" | "reject" | "limit" = "allow";
    const actionLower = rule.action.toLowerCase();
    if (actionLower.includes("allow")) act = "allow";
    else if (actionLower.includes("deny")) act = "deny";
    else if (actionLower.includes("reject")) act = "reject";
    else if (actionLower.includes("limit")) act = "limit";
    setEditAction(act);

    // Parse Port and Protocol
    let prt = "";
    let proto: "any" | "tcp" | "udp" = "any";
    
    const cleanTo = rule.to.replace(/\(v6\)/gi, "").trim();
    if (cleanTo.toLowerCase() !== "anywhere" && cleanTo.toLowerCase() !== "any") {
      if (cleanTo.includes("/")) {
        const parts = cleanTo.split("/");
        prt = parts[0].trim();
        const p = parts[1].trim().toLowerCase();
        if (p === "tcp") proto = "tcp";
        else if (p === "udp") proto = "udp";
      } else {
        prt = cleanTo;
      }
    }
    setEditPort(prt);
    setEditProtocol(proto);

    // Parse source IP
    const cleanFrom = rule.from.replace(/\(v6\)/gi, "").trim();
    const fromVal = (cleanFrom.toLowerCase() === "anywhere" || cleanFrom.toLowerCase() === "any") ? "" : cleanFrom;
    setEditFromIp(fromVal);

    // Comment
    setEditComment(rule.comment || "");
  };

  const handleEditRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/ufw/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          index: editingRule.index,
          action: editAction,
          port: editPort,
          protocol: editProtocol,
          fromIp: editFromIp.trim(),
          comment: editComment.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to edit firewall rule");
      }

      setSuccess(`Firewall rule #${editingRule.index} successfully updated.`);
      logAction("Firewall Rule Updated", `Updated rule #${editingRule.index} with command: "${data.command}"`, "success");
      
      setEditingRule(null);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      logAction("Edit Firewall Rule Failed", `Failed to edit rule #${editingRule.index}: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const installUfw = async () => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          command: "export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y ufw",
          useSudo: true
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Installation request failed");
      }

      setSuccess("UFW installation completed. Attempting to reload firewall state.");
      logAction("Install UFW", "Ran system package installation command for 'ufw'.", "success");
      await fetchStatus();
    } catch (err: any) {
      setError(`Installation failed: ${err.message}. Please install 'ufw' manually on the remote host.`);
      logAction("Install UFW Failed", `Failed to install 'ufw' on host: ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="ufw-management-container">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/60">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            Uncomplicated Firewall (UFW) Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Secure your host by allowing/denying incoming ports, restricting specific client IPs, and configuring rule execution priority.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchStatus}
            disabled={isLoading || actionLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl border border-slate-700/60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Action Messages */}
      {error && (
        <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl text-red-400 text-xs font-mono flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-emerald-400 text-xs font-mono flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{success}</div>
        </div>
      )}

      {/* Check Installation */}
      {installed === false && (
        <div className="bg-slate-900/40 border border-slate-800/80 p-8 rounded-2xl text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
          <h3 className="text-base font-bold text-white">UFW is Not Installed</h3>
          <p className="text-slate-400 text-xs max-w-md mx-auto">
            The Uncomplicated Firewall (UFW) utility command could not be located on this Linux server. You must install the package or verify your PATH environment variables.
          </p>
          <button
            onClick={installUfw}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-indigo-900/20 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {actionLoading ? "Installing package..." : "Install UFW Package (Apt)"}
          </button>
        </div>
      )}

      {installed === true && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar status controls & Add rule form */}
          <div className="space-y-6 lg:col-span-1">
            {/* Status Card */}
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-5 space-y-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Firewall Engine Protection</span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${isActive ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30" : "bg-red-950/40 text-red-400 border border-red-900/30"}`}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">
                      {isActive ? "ACTIVE PROTECTION" : "FIREWALL OFF"}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      {isActive ? "All non-explicit ports are blocked" : "Security risks are highly critical"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  {isActive ? (
                    <button
                      onClick={() => handleToggleUfw(false)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded-xl border border-red-900/30 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleUfw(true)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      Enable
                    </button>
                  )}
                </div>
              </div>

              {isActive && (
                <div className="pt-3 border-t border-slate-800/60 text-[10px] font-mono text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Default Incoming:</span>
                    <span className="text-red-400 font-semibold">DENY (Blocked)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Default Outgoing:</span>
                    <span className="text-emerald-400 font-semibold">ALLOW (Unrestricted)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Fast Quick Add / Port presets */}
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-5 space-y-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Standard Services Presets</span>
              <p className="text-[11px] text-slate-400 leading-normal">
                Quickly whitelist common developer servers or web services:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "SSH (Port 22)", port: "22" },
                  { label: "HTTP (Port 80)", port: "80" },
                  { label: "HTTPS (Port 443)", port: "443" },
                  { label: "VNC (Port 5901)", port: "5901" },
                  { label: "Node.js (3000)", port: "3000" },
                  { label: "DB (Port 5432)", port: "5432" }
                ].map(srv => (
                  <button
                    key={srv.port}
                    onClick={() => {
                      setRuleType("port");
                      setPort(srv.port);
                      setAction("allow");
                      setProtocol("any");
                      setActiveTab("add");
                    }}
                    className="p-2.5 bg-slate-950 border border-slate-800/80 text-left rounded-xl hover:border-indigo-500 transition-colors cursor-pointer text-xs"
                  >
                    <div className="font-semibold text-slate-300 font-mono">{srv.port}</div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">{srv.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Rules view, custom rules form or diagnostics */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs Selector */}
            <div className="flex border-b border-slate-800/80 gap-6">
              <button 
                onClick={() => setActiveTab("rules")}
                className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                  activeTab === "rules" 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                Firewall Rulebook ({rules.length})
              </button>
              <button 
                onClick={() => setActiveTab("add")}
                className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                  activeTab === "add" 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                Configure Custom Rule
              </button>
              <button 
                onClick={() => setActiveTab("diagnostics")}
                className={`pb-3 text-xs font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                  activeTab === "diagnostics" 
                    ? "border-indigo-500 text-white" 
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                Raw UFW Dump
              </button>
            </div>

            {/* Rules book subview */}
            {activeTab === "rules" && (
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-slate-950/50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-800/80 text-[10px]">
                      <tr>
                        <th className="py-3.5 px-6">Rule # (Priority)</th>
                        <th className="py-3.5 px-4">Destination Target (To)</th>
                        <th className="py-3.5 px-4">Action</th>
                        <th className="py-3.5 px-4">Allowed Source (From)</th>
                        <th className="py-3.5 px-4">Comment</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {!isActive ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 leading-normal">
                            <ShieldAlert className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                            <span>Firewall is currently turned off or inactive.</span>
                            <p className="text-[10px] text-slate-600 mt-1">Activate the firewall engine in the side controller to load active rule evaluation flow.</p>
                          </td>
                        </tr>
                      ) : rules.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500">
                            No rules configured. All incoming access is denied by default policies.
                          </td>
                        </tr>
                      ) : (
                        rules.map(rule => {
                          const isEditing = editingRule?.index === rule.index;
                          const isMoving = movingRuleIndex === rule.index;

                          return (
                            <React.Fragment key={rule.index}>
                              <tr className="hover:bg-slate-900/10 transition-colors">
                                <td className="py-4 px-6 font-bold text-indigo-400">
                                  <span className="flex items-center gap-1.5">
                                    <Hash className="w-3.5 h-3.5 text-slate-500" />
                                    {rule.index}
                                  </span>
                                </td>
                                <td className="py-4 px-4 font-bold text-slate-200">
                                  {rule.to}
                                </td>
                                <td className="py-4 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                                    rule.action.toUpperCase().includes("ALLOW")
                                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/20"
                                      : rule.action.toUpperCase().includes("LIMIT")
                                      ? "bg-amber-950/40 text-amber-400 border-amber-900/20"
                                      : "bg-red-950/40 text-red-400 border-red-900/20"
                                  }`}>
                                    {rule.action}
                                  </span>
                                </td>
                                <td className="py-4 px-4 text-slate-300">
                                  {rule.from}
                                </td>
                                <td className="py-4 px-4 text-slate-400 font-sans">
                                  {rule.comment ? (
                                    <span className="bg-slate-800/60 border border-slate-800 px-2 py-1 rounded text-slate-300 text-[10px]">{rule.comment}</span>
                                  ) : (
                                    <span className="text-slate-600 italic">-</span>
                                  )}
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => {
                                        if (isEditing) {
                                          setEditingRule(null);
                                        } else {
                                          startEditing(rule);
                                          setMovingRuleIndex(null);
                                        }
                                      }}
                                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                        isEditing 
                                          ? "bg-indigo-600 text-white border-indigo-500" 
                                          : "bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 border-slate-700/40"
                                      }`}
                                      title="Edit firewall rule"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (isMoving) {
                                          setMovingRuleIndex(null);
                                        } else {
                                          setMovingRuleIndex(rule.index);
                                          setTargetMoveIndex("");
                                          setEditingRule(null);
                                        }
                                      }}
                                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                        isMoving
                                          ? "bg-indigo-600 text-white border-indigo-500"
                                          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/40"
                                      }`}
                                      title="Reprioritize rule number"
                                    >
                                      <Move className="w-3.5 h-3.5" />
                                    </button>
                                    {confirmDeleteRule === rule.index ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            handleDeleteRule(rule.index, rule.raw);
                                            setConfirmDeleteRule(null);
                                          }}
                                          className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-colors font-sans cursor-pointer shrink-0"
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => setConfirmDeleteRule(null)}
                                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded-lg transition-colors font-sans cursor-pointer shrink-0"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setConfirmDeleteRule(rule.index)}
                                        className="p-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 transition-colors cursor-pointer"
                                        title="Delete firewall rule"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Nested Edit Form Row */}
                              {isEditing && (
                                <tr className="bg-slate-950/80 border-t border-b border-indigo-500/30">
                                  <td colSpan={6} className="p-5">
                                    <div className="space-y-4">
                                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                                        <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 font-sans">
                                          <Edit3 className="w-4 h-4" />
                                          Edit Existing Rule Configuration (Rule #{rule.index})
                                        </span>
                                        <button 
                                          type="button"
                                          onClick={() => setEditingRule(null)}
                                          className="text-[10px] text-slate-500 hover:text-slate-300 uppercase font-bold cursor-pointer"
                                        >
                                          Close Form
                                        </button>
                                      </div>

                                      <form onSubmit={handleEditRule} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                        {/* Action Selector */}
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase">Action</label>
                                          <select 
                                            value={editAction} 
                                            onChange={e => setEditAction(e.target.value as any)}
                                            className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                                          >
                                            <option value="allow">ALLOW (Accept traffic)</option>
                                            <option value="deny">DENY (Silently drop)</option>
                                            <option value="reject">REJECT (Respond with reject)</option>
                                            <option value="limit">LIMIT (Rate limit connections)</option>
                                          </select>
                                        </div>

                                        {/* Port input */}
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase">Port (Optional)</label>
                                          <input 
                                            type="text" 
                                            placeholder="e.g. 80, 443" 
                                            value={editPort}
                                            onChange={e => setEditPort(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                                          />
                                        </div>

                                        {/* Protocol select */}
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase">Protocol</label>
                                          <select 
                                            value={editProtocol} 
                                            onChange={e => setEditProtocol(e.target.value as any)}
                                            className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                                          >
                                            <option value="any">Any (TCP/UDP)</option>
                                            <option value="tcp">TCP</option>
                                            <option value="udp">UDP</option>
                                          </select>
                                        </div>

                                        {/* Allowed Source (From IP) */}
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase">Allowed Source IP</label>
                                          <input 
                                            type="text" 
                                            placeholder="e.g. any or specific IP" 
                                            value={editFromIp}
                                            onChange={e => setEditFromIp(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                                          />
                                        </div>

                                        {/* Comment */}
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase">Comment / Label</label>
                                          <input 
                                            type="text" 
                                            placeholder="e.g. My home IP" 
                                            value={editComment}
                                            onChange={e => setEditComment(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                                          />
                                        </div>

                                        {/* Submit & Cancel Actions */}
                                        <div className="md:col-span-5 flex justify-end gap-2 pt-2 border-t border-slate-800/40">
                                          <button
                                            type="button"
                                            onClick={() => setEditingRule(null)}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="submit"
                                            disabled={actionLoading}
                                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                                          >
                                            {actionLoading ? "Updating..." : "Save Changes"}
                                          </button>
                                        </div>
                                      </form>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Nested Move Position Form Row */}
                              {isMoving && (
                                <tr className="bg-slate-950/80 border-t border-b border-indigo-500/30">
                                  <td colSpan={6} className="p-5">
                                    <div className="space-y-4">
                                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                                        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 font-sans">
                                          <ArrowUpDown className="w-4 h-4 text-indigo-400" />
                                          Re-order Priority for Rule #{rule.index}
                                        </span>
                                        <button 
                                          type="button"
                                          onClick={() => setMovingRuleIndex(null)}
                                          className="text-[10px] text-slate-500 hover:text-slate-300 uppercase font-bold cursor-pointer"
                                        >
                                          Close Form
                                        </button>
                                      </div>
                                      <form onSubmit={handleMoveRule} className="flex flex-col sm:flex-row gap-4 items-end">
                                        <div className="flex-1 space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-500 uppercase">Selected Rule Details</label>
                                          <div className="px-3 py-2 bg-slate-900 border border-slate-800/80 rounded-xl text-xs text-slate-400 font-mono">
                                            #{rule.index} &mdash; to {rule.to} from {rule.from} ({rule.action})
                                          </div>
                                        </div>
                                        <div className="w-full sm:w-44 space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-500 uppercase">Target Index Number</label>
                                          <input 
                                            type="number" 
                                            min="1"
                                            placeholder="e.g. 1"
                                            value={targetMoveIndex}
                                            onChange={e => setTargetMoveIndex(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                                            required
                                          />
                                        </div>
                                        <button
                                          type="submit"
                                          disabled={actionLoading}
                                          className="w-full sm:w-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                                        >
                                          Move Rule
                                        </button>
                                      </form>
                                      <p className="text-[10px] text-slate-500 leading-normal font-sans">
                                        Note: UFW evaluates rules in ascending order of their rule index numbers. Moving this rule to position 1 will give it the highest precedence. Subsequent rules will automatically shift down.
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Custom rules form */}
            {activeTab === "add" && (
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6">
                <form onSubmit={handleAddRule} className="space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-800/60">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Firewall Rule Builder</span>
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono">
                      <button
                        type="button"
                        onClick={() => { setRuleType("port"); setFromIp(""); }}
                        className={`px-3 py-1 text-[10px] font-semibold uppercase rounded-lg transition-colors cursor-pointer ${
                          ruleType === "port" 
                            ? "bg-slate-800 text-white" 
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        Port-Based
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRuleType("ip"); setPort(""); }}
                        className={`px-3 py-1 text-[10px] font-semibold uppercase rounded-lg transition-colors cursor-pointer ${
                          ruleType === "ip" 
                            ? "bg-slate-800 text-white" 
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        IP-Based / CIDR Block
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Action */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Action</label>
                      <select 
                        value={action} 
                        onChange={e => setAction(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="allow">ALLOW (Whitelist Access)</option>
                        <option value="deny">DENY (Silently Block Connection)</option>
                        <option value="reject">REJECT (Respond with Connection Error)</option>
                        <option value="limit">LIMIT (Rate-Limit Connections)</option>
                      </select>
                    </div>

                    {/* Protocol */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Protocol</label>
                      <select 
                        value={protocol} 
                        onChange={e => setProtocol(e.target.value as any)}
                        disabled={ruleType === "ip"}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-40"
                      >
                        <option value="any">ANY (TCP & UDP)</option>
                        <option value="tcp">TCP</option>
                        <option value="udp">UDP</option>
                      </select>
                    </div>

                    {/* Port */}
                    {ruleType === "port" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Port Number</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 80, 443, 3000-3010" 
                          value={port}
                          onChange={e => setPort(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                          required
                        />
                      </div>
                    )}

                    {/* Source IP / Subnet */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">
                        {ruleType === "ip" ? "Source IP / CIDR Block (Required)" : "Source IP constraint (Optional)"}
                      </label>
                      <input 
                        type="text" 
                        placeholder={ruleType === "ip" ? "e.g. 192.168.1.15 or 10.0.0.0/24" : "Leave blank for Anywhere"} 
                        value={fromIp}
                        onChange={e => setFromIp(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                        required={ruleType === "ip"}
                      />
                    </div>

                    {/* Port constraint when type IP */}
                    {ruleType === "ip" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Restrict to Specific Port (Optional)</label>
                        <input 
                          type="text" 
                          placeholder="Leave blank for all ports" 
                          value={port}
                          onChange={e => setPort(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    )}

                    {/* Insert Index (Priority) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Insert Index / Priority (Optional)</label>
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Leave blank for automatic end appending" 
                        value={insertIndex}
                        onChange={e => setInsertIndex(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {/* Rule Comment / Description */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Rule Comment / Description (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. whitelist office IP or Web traffic description" 
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/60 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("rules")}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-indigo-900/20 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      {actionLoading ? "Applying rule..." : "Create Firewall Rule"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Raw Dump Console */}
            {activeTab === "diagnostics" && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[500px] lg:h-[650px]">
                <div className="px-5 py-3 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center">
                  <span className="text-[10px] font-bold font-mono text-slate-400 uppercase flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    ufw status verbose output
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">Interactive Shell Buffer</span>
                  </div>
                </div>
                <div className="flex-1 p-5 overflow-y-auto font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre bg-black/40">
                  {rawVerbose || "No data fetched yet."}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

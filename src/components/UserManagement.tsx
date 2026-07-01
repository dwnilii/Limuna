import React, { useState, useEffect } from "react";
import { 
  User, 
  Users, 
  UserPlus, 
  KeyRound, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Search, 
  FolderPlus 
} from "lucide-react";
import { LinuxUser, LinuxGroup } from "../types";

interface UserManagementProps {
  token: string;
  logAction: (action: string, details: string, status: "success" | "error" | "info") => void;
}

export default function UserManagement({ token, logAction }: UserManagementProps) {
  const [users, setUsers] = useState<LinuxUser[]>([]);
  const [groups, setGroups] = useState<LinuxGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Create User Dialog / form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shell, setShell] = useState("/bin/bash");
  const [primaryGroup, setPrimaryGroup] = useState("");
  const [additionalGroups, setAdditionalGroups] = useState<string[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Change Password form states
  const [selectedUserForPass, setSelectedUserForPass] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Create Group form states
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [activeListTab, setActiveListTab] = useState<"users" | "groups">("users");

  // Safe non-modal confirmation states
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userRes = await fetch("/api/users", {
        headers: { "x-ssh-token": token }
      });
      const groupRes = await fetch("/api/groups", {
        headers: { "x-ssh-token": token }
      });

      if (!userRes.ok || !groupRes.ok) {
        throw new Error("Failed to fetch linux users or groups from remote host");
      }

      const userData = await userRes.json();
      const groupData = await groupRes.json();

      setUsers(userData.users || []);
      setGroups(groupData.groups || []);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setIsCreatingUser(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          username,
          password: password || undefined,
          shell,
          primaryGroup: primaryGroup || undefined,
          additionalGroups: additionalGroups.length > 0 ? additionalGroups : undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create Linux user");
      }

      setSuccess(`User "${username}" created successfully.`);
      logAction("User Created", `Successfully created Linux user "${username}" with shell "${shell}".`, "success");
      
      // Reset Form
      setUsername("");
      setPassword("");
      setShell("/bin/bash");
      setPrimaryGroup("");
      setAdditionalGroups([]);
      
      fetchData();
    } catch (err: any) {
      setError(err.message);
      logAction("User Creation Failed", `Failed to create user "${username}": ${err.message}`, "error");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPass || !newPassword.trim()) return;
    setIsChangingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/users/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          username: selectedUserForPass,
          password: newPassword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to change user password");
      }

      setSuccess(`Successfully updated password for "${selectedUserForPass}".`);
      logAction("Password Changed", `Successfully updated password for Linux user "${selectedUserForPass}".`, "success");
      setNewPassword("");
      setSelectedUserForPass(null);
    } catch (err: any) {
      setError(err.message);
      logAction("Password Change Failed", `Failed to update password for "${selectedUserForPass}": ${err.message}`, "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteUser = async (userToDelete: string) => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/users/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          username: userToDelete,
          removeHome: true
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      setSuccess(`User "${userToDelete}" deleted successfully.`);
      logAction("User Deleted", `Deleted Linux user "${userToDelete}" and removed their home directory.`, "success");
      fetchData();
    } catch (err: any) {
      setError(err.message);
      logAction("User Deletion Failed", `Failed to delete user "${userToDelete}": ${err.message}`, "error");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setIsCreatingGroup(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/groups/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          groupname: newGroupName
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create group");
      }

      setSuccess(`Group "${newGroupName}" created successfully.`);
      logAction("Group Created", `Successfully created system group "${newGroupName}".`, "success");
      setNewGroupName("");
      fetchData();
    } catch (err: any) {
      setError(err.message);
      logAction("Group Creation Failed", `Failed to create group "${newGroupName}": ${err.message}`, "error");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupToDelete: string) => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/groups/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ssh-token": token
        },
        body: JSON.stringify({
          groupname: groupToDelete
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete group");
      }

      setSuccess(`Group "${groupToDelete}" deleted successfully.`);
      logAction("Group Deleted", `Deleted system group "${groupToDelete}".`, "success");
      fetchData();
    } catch (err: any) {
      setError(err.message);
      logAction("Group Deletion Failed", `Failed to delete group "${groupToDelete}": ${err.message}`, "error");
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.home.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.shell.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(g => 
    g.groupname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.gid.toString().includes(searchQuery) ||
    g.users.some(u => u.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6" id="user-management-container">
      {/* Title & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/60">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Users & Group Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage system administrators, local user accounts, passwords, and security groups directly over SSH
          </p>
        </div>
        <button 
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl border border-slate-700/60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Reload System Accounts
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-emerald-200 text-xs flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      {/* Grid Layout for Forms and Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creation Panels (Column 1) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Create User Form */}
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800/60 pb-3">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              Create Local Linux User
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Username</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. janesmith"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Password</label>
                <input 
                  type="password" 
                  placeholder="Password or leave blank"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Login Shell</label>
                <select 
                  value={shell}
                  onChange={e => setShell(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="/bin/bash">/bin/bash</option>
                  <option value="/bin/sh">/bin/sh</option>
                  <option value="/bin/zsh">/bin/zsh</option>
                  <option value="/usr/sbin/nologin">/usr/sbin/nologin (No login)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Primary Group (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. users or standard group"
                  value={primaryGroup}
                  onChange={e => setPrimaryGroup(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Additional Groups (Comma separated)</label>
                <input 
                  type="text" 
                  placeholder="e.g. sudo,docker,wheel"
                  onChange={e => {
                    const val = e.target.value;
                    setAdditionalGroups(val.split(",").map(g => g.trim()).filter(Boolean));
                  }}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <button 
                type="submit"
                disabled={isCreatingUser || !username.trim()}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl disabled:opacity-50 transition-colors"
              >
                {isCreatingUser ? "Creating Account..." : "Create Account & GID"}
              </button>
            </form>
          </div>

          {/* Create Group Form */}
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800/60 pb-3">
              <FolderPlus className="w-4 h-4 text-indigo-400" />
              Create System Group
            </h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Group Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. developers"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <button 
                type="submit"
                disabled={isCreatingGroup || !newGroupName.trim()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl disabled:opacity-50 transition-colors"
              >
                {isCreatingGroup ? "Creating Group..." : "Create Linux Group"}
              </button>
            </form>
          </div>
        </div>

        {/* User Accounts & System Groups List (Column 2 & 3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-col">
            {/* Search and Header with Tabs */}
            <div className="p-5 border-b border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex border-b border-slate-800/40 w-full sm:w-auto">
                <button
                  onClick={() => { setActiveListTab("users"); setSearchQuery(""); }}
                  className={`pb-2 px-4 text-xs font-bold tracking-wide border-b-2 transition-all ${
                    activeListTab === "users" 
                      ? "border-indigo-500 text-white" 
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Active Accounts ({users.length})
                </button>
                <button
                  onClick={() => { setActiveListTab("groups"); setSearchQuery(""); }}
                  className={`pb-2 px-4 text-xs font-bold tracking-wide border-b-2 transition-all ${
                    activeListTab === "groups" 
                      ? "border-indigo-500 text-white" 
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  System Groups ({groups.length})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input 
                  type="text" 
                  placeholder={activeListTab === "users" ? "Filter users..." : "Filter groups..."}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Change Password Inline Form Modal */}
            {selectedUserForPass && (
              <div className="bg-slate-900/90 border-b border-indigo-900/40 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-300">
                    Set password for user: <strong className="text-indigo-400 font-mono">{selectedUserForPass}</strong>
                  </span>
                  <button 
                    onClick={() => setSelectedUserForPass(null)}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
                <form onSubmit={handleChangePassword} className="flex gap-2">
                  <input 
                    type="password" 
                    required
                    placeholder="Type new password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button 
                    type="submit"
                    disabled={isChangingPassword || !newPassword.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isChangingPassword ? "Saving..." : "Change Password"}
                  </button>
                </form>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              {activeListTab === "users" ? (
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-950/50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-800/80 text-[10px]">
                    <tr>
                      <th className="py-3.5 px-6">User (UID/GID)</th>
                      <th className="py-3.5 px-4">Home Directory</th>
                      <th className="py-3.5 px-4">Shell</th>
                      <th className="py-3.5 px-4">Groups</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          <div className="flex justify-center items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                            <span>Loading linux authentication data...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No system users matching search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(user => (
                        <tr key={user.username} className="hover:bg-slate-900/10 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <User className={`w-3.5 h-3.5 ${user.username === "root" ? "text-amber-400" : "text-slate-400"}`} />
                              <div>
                                <span className="font-bold text-slate-200">{user.username}</span>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  UID: {user.uid} / GID: {user.gid}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-slate-400 truncate max-w-[150px]" title={user.home}>
                            {user.home}
                          </td>
                          <td className="py-4 px-4 text-slate-500 text-[10px]">
                            {user.shell}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {user.groups.slice(0, 4).map(grp => {
                                const isSudo = ["sudo", "root", "wheel", "admin"].includes(grp);
                                return (
                                  <span 
                                    key={grp}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      isSudo 
                                        ? "bg-red-950 text-red-400 border border-red-900/30" 
                                        : "bg-slate-800 text-slate-300 border border-slate-700/20"
                                    }`}
                                  >
                                    {grp}
                                  </span>
                                );
                              })}
                              {user.groups.length > 4 && (
                                <span className="text-[10px] text-slate-500">+{user.groups.length - 4} more</span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            {confirmDeleteUser === user.username ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    handleDeleteUser(user.username);
                                    setConfirmDeleteUser(null);
                                  }}
                                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-colors font-sans"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteUser(null)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded-lg transition-colors font-sans"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setSelectedUserForPass(user.username);
                                    setNewPassword("");
                                  }}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/40 transition-colors"
                                  title="Set password"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => setConfirmDeleteUser(user.username)}
                                  disabled={user.username === "root" || user.uid < 1000}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 transition-colors disabled:opacity-25"
                                  title={user.username === "root" || user.uid < 1000 ? "Cannot delete system account" : "Delete user"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-950/50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-800/80 text-[10px]">
                    <tr>
                      <th className="py-3.5 px-6">Group Name</th>
                      <th className="py-3.5 px-4">GID</th>
                      <th className="py-3.5 px-4">Group Members</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {isLoading ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          <div className="flex justify-center items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                            <span>Loading linux group data...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredGroups.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No system groups matching search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredGroups.map(group => {
                        const isSystemGroup = group.gid < 1000 && group.groupname !== "sudo" && group.groupname !== "admin";
                        return (
                          <tr key={group.groupname} className="hover:bg-slate-900/10 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <Users className={`w-3.5 h-3.5 ${isSystemGroup ? "text-slate-500" : "text-indigo-400"}`} />
                                <span className="font-bold text-slate-200">{group.groupname}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-slate-400">
                              {group.gid}
                            </td>
                            <td className="py-4 px-4">
                              {group.users.length === 0 ? (
                                <span className="text-slate-600 text-[10px] italic">No members</span>
                              ) : (
                                <div className="flex flex-wrap gap-1 max-w-[300px]">
                                  {group.users.map(u => (
                                    <span 
                                      key={u}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-indigo-300 border border-indigo-950"
                                    >
                                      {u}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right">
                              {confirmDeleteGroup === group.groupname ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      handleDeleteGroup(group.groupname);
                                      setConfirmDeleteGroup(null);
                                    }}
                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-colors font-sans"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteGroup(null)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded-lg transition-colors font-sans"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setConfirmDeleteGroup(group.groupname)}
                                  disabled={isSystemGroup || group.groupname === "root" || group.groupname === "sudo" || group.groupname === "nogroup"}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 transition-colors disabled:opacity-25"
                                  title={isSystemGroup ? "Cannot delete system group" : "Delete group"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

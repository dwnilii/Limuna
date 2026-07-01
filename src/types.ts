export interface SystemInfo {
  hostname: string;
  kernel: string;
  os: string;
  uptime: string;
  cpuModel: string;
  cpuCores: number;
  cpuUsage: number;
  ram: {
    total: number;
    used: number;
    free: number;
    available: number;
  };
  rootDisk: {
    total: string;
    used: string;
    available: string;
    percentage: string;
  };
  loadAvg: string;
}

export interface BlockDevice {
  name: string;
  fstype: string;
  size: string;
  mountpoint?: string;
  mountpoints?: string[]; // modern lsblk uses an array for multiple mounts
  type: string;
  uuid: string;
  children?: BlockDevice[];
}

export interface Process {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

export interface LVMPhysicalVolume {
  pvName: string;
  vgName: string;
  size: number; // in bytes
  free: number; // in bytes
}

export interface LVMVolumeGroup {
  vgName: string;
  pvCount: number;
  lvCount: number;
  size: number; // in bytes
  free: number; // in bytes
}

export interface LVMLogicalVolume {
  lvName: string;
  vgName: string;
  size: number; // in bytes
  path: string;
  attr: string;
}

export interface SSHServer {
  host: string;
  port: number;
  username: string;
}

export interface TerminalLog {
  command: string;
  output: string;
  timestamp: string;
  isError: boolean;
  useSudo: boolean;
}

export interface LinuxUser {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
  groups: string[];
}

export interface LinuxGroup {
  groupname: string;
  gid: number;
  users: string[];
}

export interface BackupJob {
  id: string;
  device: string;
  targetPath: string;
  size: string;
  timestamp: string;
  status: "success" | "running" | "failed";
  command: string;
  output: string;
}

export interface LimunaLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  status: "success" | "error" | "info";
}

export interface UfwRule {
  index: number;
  to: string;
  action: string;
  from: string;
  comment?: string;
  raw: string;
}



import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { Terminal as TerminalIcon, RefreshCw, AlertCircle, Play, Info } from "lucide-react";

interface SshTerminalProps {
  token: string;
  connectedServer: {
    host: string;
    username: string;
    port: number;
  } | null;
}

export const SshTerminal: React.FC<SshTerminalProps> = ({ token, connectedServer }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [status, setStatus] = useState<"connecting" | "ready" | "closed" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState("");

  const initializeTerminal = () => {
    if (!containerRef.current || !token) return;

    setStatus("connecting");
    setErrorMessage("");

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: "#0c0a09", // Matches stone-950
        foreground: "#e7e5e4", // Matches stone-200
        cursor: "#818cf8",     // Indigo-400
        selectionBackground: "rgba(129, 140, 248, 0.3)", // Translucent indigo
        black: "#1c1917",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f5f5f4",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[1;36mInitializing WebSocket connection...\x1b[0m");

    // Initialize WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ssh-websocket`;
    const socket = new WebSocket(wsUrl);

    socketRef.current = socket;

    socket.onopen = () => {
      term.writeln("\x1b[1;32mWebSocket connected. Authenticating SSH...\x1b[0m");
      socket.send(
        JSON.stringify({
          type: "init",
          token,
          cols: term.cols,
          rows: term.rows,
        })
      );
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "ready") {
          setStatus("ready");
          term.clear();
          term.writeln("\x1b[1;32mConnected successfully! Welcome to your live SSH console.\x1b[0m");
          term.writeln("\x1b[1;30mPress keys or click presets below to execute commands.\x1b[0m\r\n");
        } else if (payload.type === "data") {
          term.write(payload.data);
        } else if (payload.type === "status") {
          term.writeln(`\r\n\x1b[1;34m[System] ${payload.message}\x1b[0m\r\n`);
        } else if (payload.type === "error") {
          setStatus("error");
          setErrorMessage(payload.message);
          term.writeln(`\r\n\x1b[1;31m[Error] ${payload.message}\x1b[0m\r\n`);
        }
      } catch (err) {
        // Fallback for raw text
        term.write(event.data);
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setErrorMessage("WebSocket connection encountered an error.");
      term.writeln("\r\n\x1b[1;31m[Error] WebSocket connection failed.\x1b[0m\r\n");
    };

    socket.onclose = (event) => {
      setStatus("closed");
      term.writeln("\r\n\x1b[1;31m[System] SSH Terminal session disconnected.\x1b[0m\r\n");
      // Give the user a brief period to read the status or automatically go back
      setTimeout(() => {
        setIsSessionActive(false);
      }, 1500);
    };

    // Forward terminal keypress/data to backend
    const onDataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "data", data }));
      }
    });

    // Setup Auto-resize on window/element container size changes
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit();
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "resize",
                cols: terminalRef.current.cols,
                rows: terminalRef.current.rows,
              })
            );
          }
        }
      } catch (e) {
        console.error("Resize error:", e);
      }
    });
    resizeObserver.observe(containerRef.current);

    // Return cleanup callback
    return () => {
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      socket.close();
      term.dispose();
    };
  };

  useEffect(() => {
    if (!isSessionActive) return;
    const cleanup = initializeTerminal();
    return () => {
      if (cleanup) cleanup();
    };
  }, [token, isSessionActive]);

  const sendPresetCommand = (command: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "data", data: command + "\r" }));
      if (terminalRef.current) {
        terminalRef.current.focus();
      }
    }
  };

  const handleClearScreen = () => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      terminalRef.current.focus();
    }
  };

  if (!isSessionActive) {
    return (
      <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-6 shadow-xl my-6">
        <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
          <TerminalIcon className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-100 tracking-tight">
            Live SSH Interactive Gateway
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Ready to establish a secure, full-duplex WebSocket interactive SSH tunnel. No extra utilities or browser plug-ins required.
          </p>
        </div>

        {/* Server details grid */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 text-left space-y-3">
          <div className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-wider">
            Connection Parameters:
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <span className="block text-[10px] text-slate-500">Host IP</span>
              <span className="text-slate-200 font-semibold">{connectedServer?.host || "N/A"}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500">User</span>
              <span className="text-slate-200 font-semibold">{connectedServer?.username || "N/A"}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500">SSH Port</span>
              <span className="text-slate-200 font-semibold">{connectedServer?.port || 22}</span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={() => setIsSessionActive(true)}
            className="w-full md:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 group hover:scale-[1.02]"
          >
            <Play className="w-4 h-4 fill-current transition-transform group-hover:translate-x-0.5" />
            <span>Connect Live SSH Console</span>
          </button>
        </div>

        <div className="flex justify-center items-center gap-2 text-[10px] font-mono text-slate-500 pt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Encrypted Gateway Ready</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outer Controls & Preset bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/30 border border-slate-800/40 p-4 rounded-2xl">
        <div className="flex flex-wrap gap-2 text-xs font-mono items-center">
          <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
            Presets (Types directly to shell):
          </span>
          <button
            onClick={() => sendPresetCommand("df -h")}
            disabled={status !== "ready"}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer font-mono"
          >
            df -h
          </button>
          <button
            onClick={() => sendPresetCommand("ip a || ip route")}
            disabled={status !== "ready"}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer font-mono"
          >
            ip address
          </button>
          <button
            onClick={() => sendPresetCommand("sudo systemctl list-units --type=service --state=running | head -n 25")}
            disabled={status !== "ready"}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer font-mono"
          >
            running services
          </button>
          <button
            onClick={() => sendPresetCommand("sudo ss -tulpn")}
            disabled={status !== "ready"}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer font-mono"
          >
            open ports
          </button>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <button
            onClick={handleClearScreen}
            className="text-xs text-slate-400 hover:text-white font-mono bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Clear Screen
          </button>

          <button
            onClick={() => setIsSessionActive(false)}
            className="text-xs text-rose-400 hover:text-rose-300 font-mono bg-slate-950 border border-rose-950/40 px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
          >
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      {/* Interactive SSH Terminal Window */}
      <div className="bg-[#0c0a09] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[550px] lg:h-[700px] relative">
        {/* Window Title Bar */}
        <div className="px-5 py-3 border-b border-slate-900 bg-[#12100e] flex justify-between items-center select-none shrink-0">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSessionActive(false)}
              className="w-3 h-3 rounded-full bg-rose-500/80 cursor-pointer hover:scale-110 transition-transform" 
              title="Close terminal session"
            />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            <TerminalIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>
              SSH Live Shell: {connectedServer?.username || "admin"}@
              {connectedServer?.host || "server"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                status === "ready"
                  ? "bg-emerald-500 animate-pulse"
                  : status === "connecting"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-rose-500"
              }`}
            />
            <span className="text-[10px] uppercase font-mono text-slate-500">
              {status}
            </span>
          </div>
        </div>

        {/* Info panel explaining shortcuts */}
        <div className="bg-slate-900/20 px-5 py-2 border-b border-slate-900/40 text-[11px] text-slate-500 font-mono flex items-center gap-1.5 shrink-0 select-none">
          <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            Fully interactive shell: type directly inside. Supports copy/paste, standard Linux shortcuts (Ctrl+C, Ctrl+D, tab-completion), and SSH streams.
          </span>
        </div>

        {/* Terminal DOM Target */}
        <div className="flex-1 p-4 bg-[#0c0a09] relative overflow-hidden">
          <div ref={containerRef} className="w-full h-full" />

          {/* Loader Overlays */}
          {status === "connecting" && (
            <div className="absolute inset-0 bg-[#0c0a09]/85 flex flex-col items-center justify-center space-y-3 z-10">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm font-mono text-slate-300">Establishing real-time SSH session...</p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 bg-[#0c0a09]/90 flex flex-col items-center justify-center space-y-4 p-6 text-center z-10">
              <AlertCircle className="w-10 h-10 text-rose-500" />
              <div className="space-y-1">
                <p className="text-sm font-mono font-bold text-rose-400">Connection Failed</p>
                <p className="text-xs font-mono text-slate-400 max-w-md">{errorMessage || "The connection dropped or credentials failed."}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={initializeTerminal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 font-mono"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
                <button
                  onClick={() => setIsSessionActive(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold border border-slate-800 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 font-mono"
                >
                  <span>Back to Gateway</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import "./App.css"
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useState, useEffect, useCallback } from "react"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = [
  "#F59E0B", "#10B981", "#3B82F6", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"
]

// Judge0 CE language IDs — verified from https://ce.judge0.com/
const LANGUAGES = [
  { id: "javascript", label: "JavaScript", judge0Id: 63  }, // Node.js 12.14.0
  { id: "typescript", label: "TypeScript", judge0Id: 74  }, // TypeScript 3.7.4
  { id: "python",     label: "Python",     judge0Id: 71  }, // Python 3.8.1
  { id: "java",       label: "Java",       judge0Id: 62  }, // OpenJDK 13.0.1
  { id: "cpp",        label: "C++",        judge0Id: 54  }, // GCC 9.2.0
  { id: "c",          label: "C",          judge0Id: 50  }, // GCC 9.2.0
  { id: "csharp",     label: "C#",         judge0Id: 51  }, // Mono 6.6.0
  { id: "go",         label: "Go",         judge0Id: 60  }, // 1.13.5
  { id: "rust",       label: "Rust",       judge0Id: 73  }, // 1.40.0
  { id: "php",        label: "PHP",        judge0Id: 68  }, // 7.4.1
  { id: "ruby",       label: "Ruby",       judge0Id: 72  }, // 2.7.0
  { id: "bash",       label: "Bash",       judge0Id: 46  }, // 5.0.0
]

const JUDGE0_URL = "https://ce.judge0.com"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getColor(username) {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function injectCursorStyle(username, color) {
  const id = `cursor-style-${username}`
  if (document.getElementById(id)) return
  const safe = username.replace(/[^a-zA-Z0-9_-]/g, "_")
  const style = document.createElement("style")
  style.id = id
  style.innerHTML = `
    .yRemoteSelection-${safe} { background-color: ${color}33; }
    .yRemoteSelectionHead-${safe} {
      position: absolute;
      border-left: 2px solid ${color};
      border-top: 2px solid ${color};
      border-bottom: 2px solid ${color};
      height: 100%;
      box-sizing: border-box;
    }
    .yRemoteSelectionHead-${safe}::after {
      content: "${username}";
      background: ${color};
      color: #fff;
      font-size: 10px;
      font-family: monospace;
      padding: 1px 5px;
      border-radius: 3px;
      position: absolute;
      top: -18px;
      left: 0;
      white-space: nowrap;
      pointer-events: none;
      z-index: 100;
    }
  `
  document.head.appendChild(style)
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

// Decode base64 safely (Judge0 returns base64-encoded output)
function decodeBase64(str) {
  try { return atob(str) } catch { return str }
}

// Judge0 status descriptions
function getStatusLabel(status) {
  const map = {
    1: "In Queue", 2: "Processing", 3: "Accepted",
    4: "Wrong Answer", 5: "Time Limit Exceeded",
    6: "Compilation Error", 7: "Runtime Error (SIGSEGV)",
    8: "Runtime Error (SIGXFSZ)", 9: "Runtime Error (SIGFPE)",
    10: "Runtime Error (SIGABRT)", 11: "Runtime Error (NZEC)",
    12: "Runtime Error (Other)", 13: "Internal Error",
    14: "Exec Format Error",
  }
  return map[status?.id] || status?.description || "Unknown"
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toasts }) {
  return (
    <div style={{
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex", flexDirection: "column", gap: 10,
      alignItems: "center", pointerEvents: "none", zIndex: 9999,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.color, color: "#fff",
          padding: "10px 22px", borderRadius: "999px",
          fontFamily: "monospace", fontSize: 14, fontWeight: "bold",
          boxShadow: `0 4px 24px ${t.color}66`,
          animation: "toastIn 0.3s cubic-bezier(.34,1.56,.64,1) forwards",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>{t.type === "leave" ? "👋" : t.type === "info" ? "✓" : "👋"}</span>
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ─── Connection Dot ───────────────────────────────────────────────────────────

function ConnectionDot({ status }) {
  const colors = { connected: "#10B981", connecting: "#F59E0B", disconnected: "#EF4444" }
  const labels = { connected: "Live", connecting: "Connecting…", disconnected: "Offline" }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: colors[status] || colors.connecting,
        boxShadow: status === "connected" ? `0 0 6px ${colors.connected}` : "none",
        display: "inline-block",
        animation: status === "connecting" ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ color: colors[status] || colors.connecting, fontSize: 12, fontFamily: "monospace" }}>
        {labels[status] || "Connecting…"}
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

function Terminal({ lines, onClear }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [lines])

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "#0d1117", fontFamily: "'Fira Code', 'Cascadia Code', monospace", fontSize: 13,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 14px", background: "#161b22", borderBottom: "1px solid #30363d",
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#FF5F57","#FFBD2E","#28C840"].map(c => (
            <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, display: "inline-block" }} />
          ))}
        </div>
        <span style={{ color: "#8b949e", fontSize: 11, letterSpacing: 1 }}>TERMINAL OUTPUT</span>
        <button onClick={onClear} style={{
          background: "transparent", border: "none", color: "#8b949e",
          cursor: "pointer", fontSize: 11, padding: "2px 8px", borderRadius: 4,
        }}
          onMouseEnter={e => e.target.style.color = "#fff"}
          onMouseLeave={e => e.target.style.color = "#8b949e"}
        >clear</button>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "10px 16px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        {lines.length === 0
          ? <span style={{ color: "#484f58", fontStyle: "italic" }}>— Run your code to see output here —</span>
          : lines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "#484f58", fontSize: 11, minWidth: 70, paddingTop: 1 }}>{line.time}</span>
              <span style={{
                color: line.type === "error"   ? "#FF7B72"
                     : line.type === "info"    ? "#79C0FF"
                     : line.type === "success" ? "#3FB950"
                     : line.type === "warning" ? "#F59E0B"
                     : "#e6edf3",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {line.type === "error"   && "✖ "}
                {line.type === "success" && "✔ "}
                {line.type === "info"    && "ℹ "}
                {line.type === "warning" && "⚠ "}
                {line.text}
              </span>
            </div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const editorRef    = useRef(null)
  const prevUsersRef = useRef([])
  const isDragging   = useRef(false)

  const [username,       setUsername]       = useState(() =>
    new URLSearchParams(window.location.search).get("username") || ""
  )
  const [users,          setUsers]          = useState([])
  const [editorReady,    setEditorReady]    = useState(false)
  const [language,       setLanguage]       = useState("javascript")
  const [terminalLines,  setTerminalLines]  = useState([])
  const [isRunning,      setIsRunning]      = useState(false)
  const [connStatus,     setConnStatus]     = useState("connecting")
  const [toasts,         setToasts]         = useState([])
  const [terminalOpen,   setTerminalOpen]   = useState(true)
  const [terminalHeight, setTerminalHeight] = useState(220)

  const ydoc  = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])

  const pushToast = useCallback((message, color, type = "join") => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, color, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  const addLine = useCallback((text, type = "output") => {
    setTerminalLines(prev => [...prev, { text, type, time: timestamp() }])
  }, [])

  const handleMount = (editor) => {
    editorRef.current = editor
    setEditorReady(true)
  }

  const handleJoin = (e) => {
    e.preventDefault()
    const val = e.target.username.value.trim()
    if (!val) return
    setUsername(val)
    window.history.pushState({}, "", "?username=" + val)
  }

  const handleLanguageChange = (e) => {
    const lang = e.target.value
    setLanguage(lang)
    if (editorRef.current && window.monaco) {
      window.monaco.editor.setModelLanguage(editorRef.current.getModel(), lang)
    }
  }

  // ── Run via Judge0 CE ──────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!editorRef.current || isRunning) return
    const code = editorRef.current.getValue()
    if (!code.trim()) { addLine("Nothing to run.", "info"); return }

    const langConfig = LANGUAGES.find(l => l.id === language)
    if (!langConfig) { addLine(`Execution not supported for ${language}.`, "error"); return }

    setIsRunning(true)
    setTerminalOpen(true)
    addLine(`Submitting ${langConfig.label} to Judge0…`, "info")

    try {
      // Step 1: create submission (base64_encoded=true for safe payload)
      const submitRes = await fetch(
        `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_code: btoa(unescape(encodeURIComponent(code))),
            language_id: langConfig.judge0Id,
            base64_encoded: true,
          }),
        }
      )

      if (!submitRes.ok) {
        addLine(`Judge0 returned HTTP ${submitRes.status}. Try again shortly.`, "error")
        return
      }

      const result = await submitRes.json()

      // stdout
      if (result.stdout) {
        const out = decodeBase64(result.stdout)
        out.split("\n").filter(Boolean).forEach(l => addLine(l, "output"))
      }

      // compile errors
      if (result.compile_output) {
        const comp = decodeBase64(result.compile_output)
        comp.split("\n").filter(Boolean).forEach(l => addLine(l, "error"))
      }

      // runtime stderr
      if (result.stderr) {
        const err = decodeBase64(result.stderr)
        err.split("\n").filter(Boolean).forEach(l => addLine(l, "error"))
      }

      if (!result.stdout && !result.compile_output && !result.stderr) {
        addLine("(no output)", "info")
      }

      // status
      const statusId = result.status?.id
      const statusLabel = getStatusLabel(result.status)

      if (statusId === 3) {
        // Accepted
        const time = result.time ? ` · ${result.time}s` : ""
        const mem  = result.memory ? ` · ${(result.memory / 1024).toFixed(1)} KB` : ""
        addLine(`${statusLabel}${time}${mem}`, "success")
      } else if (statusId === 6) {
        addLine(`Compilation Error`, "error")
      } else if (statusId === 5) {
        addLine(`Time Limit Exceeded`, "warning")
      } else {
        addLine(statusLabel, statusId > 3 ? "error" : "info")
      }

    } catch (err) {
      addLine("Could not reach Judge0. Check your internet connection.", err)
    } finally {
      setIsRunning(false)
    }
  }

  // ── Terminal resize ────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging.current) return
      const el = document.getElementById("editor-container")
      if (!el) return
      const newH = el.getBoundingClientRect().bottom - e.clientY
      setTerminalHeight(Math.max(80, Math.min(500, newH)))
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [])

  // ── Provider ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!username || !editorReady) return

    const color = getColor(username)
    injectCursorStyle(username, color)

    const provider = new SocketIOProvider("/", "monaco", ydoc, { autoConnect: true })
    provider.awareness.setLocalStateField("user", { username, color })

    const monacoBinding = new MonacoBinding(
      yText, editorRef.current.getModel(),
      new Set([editorRef.current]), provider.awareness
    )

    provider.on("status",     ({ status }) => setConnStatus(status))
    provider.on("connect",    () => setConnStatus("connected"))
    provider.on("disconnect", () => setConnStatus("disconnected"))

    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values())
      const active = states.filter(s => s.user?.username).map(s => s.user)
      active.forEach(u => injectCursorStyle(u.username, u.color || getColor(u.username)))

      const prevNames = prevUsersRef.current.map(u => u.username)
      const currNames = active.map(u => u.username)
      currNames.forEach(name => {
        if (name !== username && !prevNames.includes(name))
          pushToast(`${name} joined`, active.find(u => u.username === name)?.color || getColor(name), "join")
      })
      prevNames.forEach(name => {
        if (name !== username && !currNames.includes(name))
          pushToast(`${name} left`, "#6b7280", "leave")
      })

      prevUsersRef.current = active
      setUsers(active)
    }

    updateUsers()
    provider.awareness.on("change", updateUsers)

    const onUnload = () => provider.awareness.setLocalStateField("user", null)
    window.addEventListener("beforeunload", onUnload)

    return () => {
      monacoBinding.destroy()
      provider.disconnect()
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [username, editorReady, ydoc, yText, pushToast])

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!username) {
    return (
      <main style={{
        height: "100vh", width: "100%", background: "#0d1117",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          background: "#161b22", border: "1px solid #30363d", borderRadius: 12,
          padding: "40px 48px", display: "flex", flexDirection: "column", gap: 20,
          minWidth: 320, boxShadow: "0 8px 40px #00000066",
        }}>
          <div>
            <div style={{ color: "#F59E0B", fontFamily: "monospace", fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>
              COLLABORATIVE EDITOR
            </div>
            <h1 style={{ color: "#e6edf3", fontFamily: "monospace", fontSize: 24, margin: 0 }}>
              Enter the room
            </h1>
          </div>
          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="text" name="username" placeholder="your username" autoFocus
              style={{
                background: "#0d1117", border: "1px solid #30363d", borderRadius: 8,
                padding: "10px 14px", color: "#e6edf3", fontFamily: "monospace",
                fontSize: 14, outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = "#F59E0B"}
              onBlur={e  => e.target.style.borderColor = "#30363d"}
            />
            <button type="submit" style={{
              background: "#F59E0B", border: "none", borderRadius: 8,
              padding: "10px 14px", color: "#0d1117",
              fontFamily: "monospace", fontWeight: "bold", fontSize: 14, cursor: "pointer",
            }}
              onMouseEnter={e => e.target.style.opacity = "0.85"}
              onMouseLeave={e => e.target.style.opacity = "1"}
            >
              Join →
            </button>
          </form>
        </div>
      </main>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <main style={{
      height: "100vh", width: "100%", background: "#0d1117",
      display: "flex", gap: 12, padding: 12, boxSizing: "border-box",
      fontFamily: "monospace",
    }}>
      <Toast toasts={toasts} />

      {/* Sidebar */}
      <aside style={{
        width: 200, minWidth: 160, background: "#161b22",
        border: "1px solid #30363d", borderRadius: 10,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #30363d", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "#F59E0B", fontSize: 10, letterSpacing: 2 }}>COLLAB EDITOR</span>
          <ConnectionDot status={connStatus} />
        </div>

        <div style={{ padding: "10px 14px", borderBottom: "1px solid #30363d" }}>
          <div style={{ color: "#8b949e", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ONLINE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {users.map((u, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 8px", borderRadius: 6,
                background: u.username === username ? "#1f2937" : "transparent",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: u.color || getColor(u.username),
                  boxShadow: `0 0 6px ${u.color || getColor(u.username)}`,
                  flexShrink: 0,
                }} />
                <span style={{
                  color: u.username === username ? "#e6edf3" : "#8b949e",
                  fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {u.username}{u.username === username ? " (you)" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "10px 14px", marginTop: "auto" }}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href)
              pushToast("Link copied!", "#10B981", "info")
            }}
            style={{
              width: "100%", background: "#21262d", border: "1px solid #30363d",
              borderRadius: 6, color: "#8b949e", fontSize: 11, padding: "7px 0", cursor: "pointer",
            }}
            onMouseEnter={e => { e.target.style.color = "#e6edf3"; e.target.style.borderColor = "#8b949e" }}
            onMouseLeave={e => { e.target.style.color = "#8b949e"; e.target.style.borderColor = "#30363d" }}
          >
            📋 Copy invite link
          </button>
        </div>
      </aside>

      {/* Editor + Terminal */}
      <section id="editor-container" style={{
        flex: 1, display: "flex", flexDirection: "column",
        background: "#161b22", border: "1px solid #30363d",
        borderRadius: 10, overflow: "hidden",
      }}>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 14px", background: "#161b22",
          borderBottom: "1px solid #30363d", gap: 12,
        }}>
          <span style={{ color: "#8b949e", fontSize: 12 }}>
            as <span style={{ color: getColor(username), fontWeight: "bold" }}>{username}</span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select value={language} onChange={handleLanguageChange} style={{
              background: "#21262d", border: "1px solid #30363d", borderRadius: 6,
              padding: "5px 10px", color: "#e6edf3", fontSize: 12, cursor: "pointer", outline: "none",
            }}>
              {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>

            <button onClick={() => setTerminalOpen(o => !o)} style={{
              background: terminalOpen ? "#21262d" : "transparent",
              border: "1px solid #30363d", borderRadius: 6,
              color: "#8b949e", fontSize: 11, padding: "5px 10px", cursor: "pointer",
            }}>
              {terminalOpen ? "▼ Terminal" : "▲ Terminal"}
            </button>

            <button onClick={handleRun} disabled={isRunning} style={{
              background: isRunning ? "#1a3a2a" : "#238636",
              border: "1px solid #2ea043", borderRadius: 6,
              padding: "5px 16px", color: isRunning ? "#3fb950" : "#fff",
              fontSize: 12, fontWeight: "bold",
              cursor: isRunning ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "monospace",
            }}>
              {isRunning
                ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Running…</>
                : "▶ Run"
              }
            </button>
          </div>
        </div>

        {/* Monaco */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Editor
            height="100%"
            language={language}
            defaultValue={`// Welcome! Start coding collaboratively.\n`}
            theme="vs-dark"
            onMount={handleMount}
            options={{
              fontSize: 14,
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
            }}
          />
        </div>

        {/* Drag handle */}
        {terminalOpen && (
          <div
            onMouseDown={() => { isDragging.current = true }}
            style={{ height: 4, cursor: "row-resize", background: "#30363d" }}
            onMouseEnter={e => e.target.style.background = "#F59E0B"}
            onMouseLeave={e => e.target.style.background = "#30363d"}
          />
        )}

        {/* Terminal */}
        {terminalOpen && (
          <div style={{ height: terminalHeight, flexShrink: 0 }}>
            <Terminal lines={terminalLines} onClear={() => setTerminalLines([])} />
          </div>
        )}
      </section>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
      `}</style>
    </main>
  )
}

export default App
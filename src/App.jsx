import { useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import TopologyAssessor from "./components/TopologyAssessor.jsx";
import FailureDetector from "./components/FailureDetector.jsx";

const LS_KEY = "mft_llm_config";

const PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic",
    model: "claude-sonnet-4-20250514",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    hint: "Get key from console.anthropic.com",
  },
  {
    id: "openai",
    label: "OpenAI",
    model: "gpt-4o",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    hint: "Get key from platform.openai.com",
  },
  {
    id: "google",
    label: "Gemini",
    model: "gemini-2.0-flash",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    hint: "Get key from aistudio.google.com",
  },
];

// ── API Key Modal ──────────────────────────────────────────────────────────────
function ApiKeyModal({ existing, onSave }) {
  const [provider, setProvider] = useState(existing?.provider || "anthropic");
  const [key, setKey] = useState(existing?.key || "");
  const [visible, setVisible] = useState(false);

  const active = PROVIDERS.find(p => p.id === provider);
  const valid = key.trim().length > 8;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(8,8,16,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "100%", maxWidth: "460px",
        background: "#0D0D1C",
        border: "1px solid #1E1E30",
        borderRadius: "12px",
        padding: "32px",
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "8px",
            background: "linear-gradient(135deg, #38BDF8, #6366F1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px", flexShrink: 0,
          }}>◈</div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#FFF", letterSpacing: "0.04em" }}>
              MFT Toolkit
            </div>
            <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.12em", marginTop: "2px" }}>
              MULTI-AGENT FAILURE TAXONOMY v0.1
            </div>
          </div>
        </div>

        {/* Provider tabs */}
        <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.12em", marginBottom: "10px" }}>
          SELECT PROVIDER
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); setKey(""); }}
              style={{
                flex: 1, padding: "10px 0",
                background: provider === p.id ? "#1E1E30" : "#080810",
                border: `1px solid ${provider === p.id ? "#38BDF855" : "#1A1A28"}`,
                borderRadius: "8px",
                color: provider === p.id ? "#E2E2F0" : "#3A3A5C",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "10px", fontWeight: provider === p.id ? "700" : "400",
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
            >
              {p.label}
              <div style={{ fontSize: "8px", color: "#2A2A40", marginTop: "2px", fontWeight: "400" }}>
                {p.model}
              </div>
            </button>
          ))}
        </div>

        {/* Key input */}
        <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.12em", marginBottom: "8px" }}>
          API KEY
        </div>
        <div style={{ position: "relative", marginBottom: "8px" }}>
          <input
            type={visible ? "text" : "password"}
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && valid && onSave({ provider, key: key.trim() })}
            placeholder={active.placeholder}
            autoFocus
            style={{
              width: "100%",
              background: "#080810",
              border: "1px solid #1E1E30",
              borderRadius: "8px",
              color: "#C8C8E0",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "12px",
              padding: "12px 52px 12px 14px",
              outline: "none",
            }}
          />
          <button
            onClick={() => setVisible(v => !v)}
            style={{
              position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "#3A3A5C", fontSize: "11px",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {visible ? "hide" : "show"}
          </button>
        </div>

        <div style={{ fontSize: "9px", color: "#252535", marginBottom: "20px" }}>
          {active.hint}
        </div>

        <button
          onClick={() => valid && onSave({ provider, key: key.trim() })}
          disabled={!valid}
          style={{
            width: "100%", padding: "13px",
            background: valid
              ? "linear-gradient(135deg, #38BDF8, #6366F1)"
              : "#13131F",
            border: "none", borderRadius: "8px",
            color: valid ? "#FFF" : "#2A2A40",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em",
            cursor: valid ? "pointer" : "not-allowed",
          }}
        >
          SAVE &amp; CONTINUE →
        </button>

        <div style={{ fontSize: "9px", color: "#1E1E30", textAlign: "center", marginTop: "14px" }}>
          Stored in localStorage only · never sent to any server other than the provider
        </div>
      </div>
    </div>
  );
}

// ── Nav bar ────────────────────────────────────────────────────────────────────
function Nav({ config, onChangeKey }) {
  const providerLabel = PROVIDERS.find(p => p.id === config?.provider)?.label || "—";

  const linkStyle = (active) => ({
    padding: "6px 14px",
    borderRadius: "6px",
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    textDecoration: "none",
    color: active ? "#FFF" : "#3A3A5C",
    background: active ? "#1E1E30" : "transparent",
  });

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 24px",
      background: "#080810",
      borderBottom: "1px solid #13131F",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "26px", height: "26px", borderRadius: "6px",
          background: "linear-gradient(135deg, #38BDF8, #6366F1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", flexShrink: 0,
        }}>◈</div>
        <span style={{ fontSize: "12px", fontWeight: "700", color: "#FFF", letterSpacing: "0.04em" }}>MFT</span>
        <span style={{ fontSize: "9px", color: "#252535", letterSpacing: "0.1em" }}>v0.1</span>
      </div>

      <div style={{ display: "flex", gap: "4px" }}>
        <NavLink to="/assess" style={({ isActive }) => linkStyle(isActive)}>ASSESS</NavLink>
        <NavLink to="/detect" style={({ isActive }) => linkStyle(isActive)}>DETECT</NavLink>
      </div>

      <button
        onClick={onChangeKey}
        style={{
          display: "flex", alignItems: "center", gap: "7px",
          fontSize: "9px", color: "#3A3A5C", background: "none",
          border: "1px solid #1A1A28", borderRadius: "6px",
          padding: "5px 10px", cursor: "pointer", letterSpacing: "0.08em",
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        <span style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: "#34D399", flexShrink: 0,
        }} />
        {providerLabel}
      </button>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; }
    catch { return null; }
  });
  const [showModal, setShowModal] = useState(!config);

  const handleSave = (cfg) => {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    setConfig(cfg);
    setShowModal(false);
  };

  return (
    <>
      {showModal && <ApiKeyModal existing={config} onSave={handleSave} />}
      {!showModal && (
        <>
          <Nav config={config} onChangeKey={() => setShowModal(true)} />
          <Routes>
            <Route path="/" element={<Navigate to="/assess" replace />} />
            <Route path="/assess" element={<TopologyAssessor provider={config?.provider} apiKey={config?.key} />} />
            <Route path="/detect" element={<FailureDetector provider={config?.provider} apiKey={config?.key} />} />
            <Route path="*" element={<Navigate to="/assess" replace />} />
          </Routes>
        </>
      )}
    </>
  );
}

import { useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import TopologyAssessor from "./components/TopologyAssessor.jsx";
import FailureDetector from "./components/FailureDetector.jsx";

const LS_KEY = "mft_llm_config";

const PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic",
    icon: "◈",
    model: "claude-sonnet-4",
    placeholder: "sk-ant-api03-...",
    hint: "console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    icon: "⬡",
    model: "gpt-4o",
    placeholder: "sk-proj-...",
    hint: "platform.openai.com/api-keys",
  },
  {
    id: "google",
    label: "Gemini",
    icon: "◉",
    model: "gemini-2.0-flash",
    placeholder: "AIza...",
    hint: "aistudio.google.com/app/apikey",
  },
];

// ── Modal ──────────────────────────────────────────────────────────────────────
function ApiKeyModal({ existing, onSave }) {
  const [provider, setProvider] = useState(existing?.provider || "anthropic");
  const [key, setKey]           = useState(existing?.key || "");
  const [visible, setVisible]   = useState(false);
  const active = PROVIDERS.find(p => p.id === provider);
  const valid  = key.trim().length > 8;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(4,4,10,0.85)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
    }}>
      {/* Glow orb behind card */}
      <div style={{
        position: "absolute",
        width: "500px", height: "400px",
        background: "radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div className="fade-up" style={{
        position: "relative",
        width: "100%", maxWidth: "440px",
        background: "rgba(12,12,24,0.9)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "32px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
          <div style={{
            width: "40px", height: "40px", borderRadius: "10px",
            background: "linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "20px", flexShrink: 0,
            boxShadow: "0 4px 16px rgba(56,189,248,0.3)",
          }}>◈</div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#F1F5F9", letterSpacing: "0.02em" }}>
              MFT Toolkit
            </div>
            <div style={{ fontSize: "9px", color: "#3D4A5C", letterSpacing: "0.14em", marginTop: "2px" }}>
              MULTI-AGENT FAILURE TAXONOMY v0.1
            </div>
          </div>
        </div>

        {/* Provider cards */}
        <div style={{ fontSize: "9px", color: "#3D4A5C", letterSpacing: "0.14em", marginBottom: "10px" }}>
          SELECT PROVIDER
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "22px" }}>
          {PROVIDERS.map(p => (
            <div
              key={p.id}
              className={`provider-card ${provider === p.id ? "active" : ""}`}
              onClick={() => { setProvider(p.id); setKey(""); }}
              style={{
                padding: "12px 10px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "10px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "18px", marginBottom: "5px", opacity: provider === p.id ? 1 : 0.45 }}>
                {p.icon}
              </div>
              <div style={{
                fontSize: "11px", fontWeight: "700",
                color: provider === p.id ? "#E2E8F0" : "#4A5568",
                letterSpacing: "0.04em",
              }}>{p.label}</div>
              <div style={{ fontSize: "8px", color: "#2A3344", marginTop: "2px", letterSpacing: "0.04em" }}>
                {p.model}
              </div>
            </div>
          ))}
        </div>

        {/* Key input */}
        <div style={{ fontSize: "9px", color: "#3D4A5C", letterSpacing: "0.14em", marginBottom: "8px" }}>
          API KEY
        </div>
        <div style={{ position: "relative", marginBottom: "6px" }}>
          <input
            type={visible ? "text" : "password"}
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && valid && onSave({ provider, key: key.trim() })}
            placeholder={active.placeholder}
            autoFocus
            style={{
              width: "100%",
              background: "rgba(6,6,11,0.8)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              color: "#CBD5E1",
              fontFamily: "inherit",
              fontSize: "12px",
              padding: "13px 50px 13px 16px",
              letterSpacing: "0.02em",
            }}
          />
          <button
            onClick={() => setVisible(v => !v)}
            className="btn-ghost"
            style={{
              position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none",
              color: "#3D4A5C", fontSize: "10px", letterSpacing: "0.06em",
              fontFamily: "inherit",
            }}
          >{visible ? "HIDE" : "SHOW"}</button>
        </div>
        <div style={{ fontSize: "9px", color: "#1E2535", marginBottom: "22px", letterSpacing: "0.04em" }}>
          {active.hint}
        </div>

        <button
          className="btn-primary"
          onClick={() => valid && onSave({ provider, key: key.trim() })}
          disabled={!valid}
          style={{
            width: "100%", padding: "14px",
            background: valid
              ? "linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)"
              : "rgba(255,255,255,0.04)",
            border: "none", borderRadius: "10px",
            color: valid ? "#FFF" : "#2A3344",
            fontFamily: "inherit",
            fontSize: "11px", fontWeight: "700", letterSpacing: "0.12em",
          }}
        >
          SAVE &amp; CONTINUE →
        </button>

        <p style={{ fontSize: "9px", color: "#1A2030", textAlign: "center", marginTop: "16px", letterSpacing: "0.04em" }}>
          Stored in localStorage · never leaves your browser
        </p>
      </div>
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────────
function Nav({ config, onChangeKey }) {
  const providerLabel = PROVIDERS.find(p => p.id === config?.provider)?.label || "—";

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px",
      height: "52px",
      background: "rgba(6,6,11,0.75)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "28px", height: "28px", borderRadius: "7px",
          background: "linear-gradient(135deg, #38BDF8, #818CF8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "14px", flexShrink: 0,
          boxShadow: "0 2px 10px rgba(56,189,248,0.25)",
        }}>◈</div>
        <span style={{ fontSize: "13px", fontWeight: "700", color: "#F1F5F9", letterSpacing: "0.04em" }}>MFT</span>
        <span style={{
          fontSize: "8px", color: "#1E2535",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "4px",
          padding: "1px 6px", letterSpacing: "0.1em",
        }}>v0.1</span>
      </div>

      {/* Routes */}
      <div style={{
        display: "flex", gap: "2px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "10px",
        padding: "3px",
      }}>
        {[
          { to: "/assess", label: "Assess" },
          { to: "/detect", label: "Detect" },
        ].map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            style={({ isActive }) => ({
              padding: "5px 16px",
              borderRadius: "7px",
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: "0.06em",
              textDecoration: "none",
              color: isActive ? "#E2E8F0" : "#3D4A5C",
              background: isActive
                ? "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(129,140,248,0.15))"
                : "transparent",
              border: isActive ? "1px solid rgba(56,189,248,0.2)" : "1px solid transparent",
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Provider pill */}
      <button
        className="key-btn"
        onClick={onChangeKey}
        style={{
          display: "flex", alignItems: "center", gap: "7px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "8px",
          padding: "6px 12px",
          color: "#3D4A5C", fontFamily: "inherit",
          fontSize: "9px", letterSpacing: "0.1em",
        }}
      >
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ADE80", flexShrink: 0, boxShadow: "0 0 6px #4ADE8088" }} />
        {providerLabel.toUpperCase()}
        <span style={{ color: "#1E2535" }}>▾</span>
      </button>
    </nav>
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
            <Route path="/"       element={<Navigate to="/assess" replace />} />
            <Route path="/assess" element={<TopologyAssessor provider={config?.provider} apiKey={config?.key} />} />
            <Route path="/detect" element={<FailureDetector  provider={config?.provider} apiKey={config?.key} />} />
            <Route path="*"       element={<Navigate to="/assess" replace />} />
          </Routes>
        </>
      )}
    </>
  );
}

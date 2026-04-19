import { useState } from "react";
import { callLLM } from "../utils/llm.js";

// ── MFT Taxonomy ──────────────────────────────────────────────────────────────
const FAILURE_MODES = {
  "C1.1": { name: "Premise Pollution", class: "Propagation", severity: "CRITICAL", weight: 5,
    description: "Unverified assumption from early agent treated as ground truth downstream" },
  "C1.2": { name: "Confidence Inflation", class: "Propagation", severity: "HIGH", weight: 4,
    description: "Uncertainty markers stripped during handoffs — hypothesis becomes assertion" },
  "C1.3": { name: "Hallucination Cascade", class: "Propagation", severity: "CRITICAL", weight: 5,
    description: "Fabricated detail cited and amplified by subsequent agents" },
  "C2.1": { name: "Parallel State Divergence", class: "Coordination", severity: "HIGH", weight: 4,
    description: "Parallel agents develop contradictory beliefs about shared state" },
  "C2.2": { name: "Work Duplication Loop", class: "Coordination", severity: "MEDIUM", weight: 2,
    description: "Multiple agents independently execute identical subtasks" },
  "C2.3": { name: "Orchestrator Bottleneck", class: "Coordination", severity: "HIGH", weight: 4,
    description: "Orchestrator context fills, degrading routing quality" },
  "C2.4": { name: "Silent Tool Non-Invocation", class: "Coordination", severity: "CRITICAL", weight: 5,
    description: "Agent produces plausible output without actually calling required tools" },
  "C3.1": { name: "Context Overflow Truncation", class: "Context", severity: "HIGH", weight: 3,
    description: "Early constraints silently truncated as context window fills" },
  "C3.2": { name: "User Config Ignored", class: "Context", severity: "HIGH", weight: 4,
    description: "Agents proceed without incorporating explicit user requirements" },
  "C4.1": { name: "Topology-Task Mismatch", class: "Structural", severity: "HIGH", weight: 4,
    description: "Topology structure mismatched to task parallelisability" },
  "C4.2": { name: "Assurance Layer Absence", class: "Structural", severity: "CRITICAL", weight: 5,
    description: "No verification agents — open-loop system with no error correction" },
  "C5.1": { name: "Infinite Coordination Loop", class: "Termination", severity: "CRITICAL", weight: 5,
    description: "Conflicting evaluation criteria cause agents to cycle without converging" },
  "C5.2": { name: "Premature Convergence", class: "Termination", severity: "HIGH", weight: 3,
    description: "Network terminates before adequate completion, reports success on partial result" },
};

const CLASS_META = {
  Propagation:  { color: "#FF4D4D", bg: "#FF4D4D12" },
  Coordination: { color: "#FF9500", bg: "#FF950012" },
  Context:      { color: "#A78BFA", bg: "#A78BFA12" },
  Structural:   { color: "#38BDF8", bg: "#38BDF812" },
  Termination:  { color: "#34D399", bg: "#34D39912" },
};

const SEV_COLOR = { CRITICAL: "#FF4D4D", HIGH: "#FF9500", MEDIUM: "#FBBF24", LOW: "#34D399" };

const EXAMPLES = [
  {
    label: "Research pipeline",
    value: `Framework: CrewAI
Agents:
- Orchestrator: routes and sequences tasks
- Researcher A: searches web for company info
- Researcher B: searches for financial data
- Analyst: synthesizes research into insights
- Writer: produces final report

Flow: Orchestrator → Researchers A+B in parallel → Analyst → Writer
No verification or critic agents.
Researchers do not share state during parallel execution.`
  },
  {
    label: "Code generation",
    value: `Framework: LangGraph
Nodes:
- Planner: breaks task into subtasks
- Coder: writes code for each subtask
- Debugger: fixes errors if tests fail
- Reviewer: checks code quality

Flow: Planner → Coder → run tests → if fail: Debugger → Coder (loop) → Reviewer
Max iterations: unlimited
No explicit loop termination condition beyond test pass.`
  },
  {
    label: "Customer support",
    value: `System: AutoGen GroupChat
Agents:
- UserProxy: represents the customer
- Classifier: categorises the issue
- Resolver: attempts to solve
- Escalator: escalates if unsolved

All agents can message all other agents freely.
No orchestrator. Conversation ends when agents stop responding.
No maximum turn limit configured.`
  }
];

const SYSTEM_PROMPT = `You are Kontex, a topology intelligence system for multi-agent LLM networks. You assess user-defined agent topologies against the MAS Failure Taxonomy (MFT v0.1) — 13 empirically-grounded failure modes across 5 classes.

MFT Failure Modes:
C1.1 Premise Pollution [CRITICAL] — Unverified assumption treated as ground truth downstream
C1.2 Confidence Inflation [HIGH] — Uncertainty markers stripped during agent handoffs
C1.3 Hallucination Cascade [CRITICAL] — Fabricated detail cited and amplified by subsequent agents
C2.1 Parallel State Divergence [HIGH] — Parallel agents develop contradictory beliefs
C2.2 Work Duplication Loop [MEDIUM] — Multiple agents independently execute identical subtasks
C2.3 Orchestrator Bottleneck [HIGH] — Orchestrator context fills, degrading routing quality
C2.4 Silent Tool Non-Invocation [CRITICAL] — Agent produces output without calling required tools
C3.1 Context Overflow Truncation [HIGH] — Early constraints silently truncated
C3.2 User Config Ignored [HIGH] — Agents proceed without user requirements
C4.1 Topology-Task Mismatch [HIGH] — Topology mismatched to task parallelisability
C4.2 Assurance Layer Absence [CRITICAL] — No verification agents, open-loop system
C5.1 Infinite Coordination Loop [CRITICAL] — Agents cycle without converging
C5.2 Premature Convergence [HIGH] — Network terminates before adequate completion

Analyse the described topology and return ONLY valid JSON with this exact structure:
{
  "topology_summary": "2 sentence description of what you understood about this topology",
  "structure_type": "one of: flat|sequential|centralised|parallel|hierarchical|mesh|hybrid|unknown",
  "agent_count": number or null,
  "has_orchestrator": true/false,
  "has_assurance": true/false,
  "has_parallel": true/false,
  "overall_risk": "LOW|MEDIUM|HIGH|CRITICAL",
  "risk_score": number 0-100 (higher = more risk),
  "findings": [
    {
      "mode_id": "C1.1",
      "status": "DETECTED|LIKELY|POSSIBLE|NOT_DETECTED",
      "confidence": "HIGH|MEDIUM|LOW",
      "reasoning": "specific reasoning about why this mode is or isn't present based on the described topology",
      "fix": "specific actionable recommendation if detected/likely, null otherwise"
    }
  ],
  "top_risks": ["mode_id1", "mode_id2", "mode_id3"],
  "recommended_changes": [
    {
      "priority": 1,
      "change": "specific change to make",
      "fixes": ["C4.2", "C1.1"],
      "effort": "LOW|MEDIUM|HIGH"
    }
  ],
  "strengths": ["what this topology does well"],
  "verdict": "2-3 sentence overall verdict on this topology's production readiness"
}`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function TopologyAssessor({ provider, apiKey }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("risks");
  const [expandedFinding, setExpandedFinding] = useState(null);

  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const raw = await callLLM({
        provider,
        apiKey,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Assess this multi-agent topology:\n\n${input}`,
        maxTokens: 2000,
      });
      setResult(JSON.parse(raw.replace(/```json|```/g, "").trim()));
      setActiveTab("risks");
    } catch (e) {
      setError(e.message || "Assessment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const detected = result?.findings?.filter(f => ["DETECTED","LIKELY"].includes(f.status)) || [];
  const possible = result?.findings?.filter(f => f.status === "POSSIBLE") || [];
  const clean = result?.findings?.filter(f => f.status === "NOT_DETECTED") || [];

  const riskGradient = {
    LOW:      "linear-gradient(135deg, #34D399, #059669)",
    MEDIUM:   "linear-gradient(135deg, #FBBF24, #D97706)",
    HIGH:     "linear-gradient(135deg, #FF9500, #DC6200)",
    CRITICAL: "linear-gradient(135deg, #FF4D4D, #CC0000)",
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 47px)",
      background: "#080810",
      color: "#E2E2F0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: result ? "420px 1fr" : "1fr",
        minHeight: "calc(100vh - 47px)",
        transition: "grid-template-columns 0.4s ease",
      }}>

        {/* ── Left: Input panel ── */}
        <div style={{
          borderRight: result ? "1px solid #13131F" : "none",
          display: "flex", flexDirection: "column",
          background: "#08080F",
        }}>
          <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.12em", marginBottom: "8px" }}>
                DESCRIBE YOUR TOPOLOGY
              </div>
              <div style={{ fontSize: "10px", color: "#2A2A40", lineHeight: "1.7", marginBottom: "10px" }}>
                Paste agent configs, describe your system in plain text, or share code. The assessor extracts structure and checks for all 13 MFT failure modes — no execution needed.
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {EXAMPLES.map(ex => (
                <button key={ex.label} onClick={() => setInput(ex.value)} style={{
                  fontSize: "9px", padding: "4px 10px",
                  background: "#0D0D1C", border: "1px solid #1E1E30",
                  borderRadius: "4px", color: "#4A4A6A", cursor: "pointer",
                  letterSpacing: "0.06em",
                }}>
                  {ex.label} ↗
                </button>
              ))}
            </div>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={`Describe your multi-agent topology...\n\nAccepted formats:\n— Plain text description\n— Agent names, roles and flow\n— LangGraph / CrewAI / AutoGen config\n— Python code snippets\n— JSON agent definitions`}
              style={{
                flex: 1, minHeight: result ? "280px" : "360px",
                background: "#0A0A14", border: "1px solid #1A1A2E",
                borderRadius: "10px", color: "#C8C8E0",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px",
                lineHeight: "1.75", padding: "16px",
                resize: "vertical", outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = "#38BDF844"}
              onBlur={e => e.target.style.borderColor = "#1A1A2E"}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={analyze} disabled={loading || !input.trim()} style={{
                flex: 1, padding: "13px",
                background: loading || !input.trim()
                  ? "#13131F"
                  : "linear-gradient(135deg, #38BDF8, #6366F1)",
                border: "none", borderRadius: "8px",
                color: loading || !input.trim() ? "#2A2A40" : "#FFF",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              }}>
                {loading
                  ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                      <span style={{
                        width: "10px", height: "10px",
                        border: "2px solid #ffffff44", borderTop: "2px solid #fff",
                        borderRadius: "50%", display: "inline-block",
                        animation: "spin 0.8s linear infinite",
                      }} />
                      ASSESSING...
                    </span>
                  : "ASSESS TOPOLOGY →"}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </button>
              {(input || result) && (
                <button onClick={() => { setInput(""); setResult(null); setError(null); }} style={{
                  padding: "13px 16px", background: "#13131F",
                  border: "1px solid #1E1E30", borderRadius: "8px",
                  color: "#3A3A5C", cursor: "pointer",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px",
                }}>CLR</button>
              )}
            </div>

            {error && (
              <div style={{
                padding: "10px 14px", background: "#FF4D4D0F",
                border: "1px solid #FF4D4D33", borderRadius: "6px",
                fontSize: "11px", color: "#FF6B6B",
              }}>{error}</div>
            )}
          </div>

          {/* Taxonomy legend */}
          <div style={{ borderTop: "1px solid #13131F", padding: "14px 24px" }}>
            <div style={{ fontSize: "9px", color: "#2A2A40", letterSpacing: "0.12em", marginBottom: "10px" }}>
              MFT FAILURE CLASSES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {Object.entries(CLASS_META).map(([cls, meta]) => {
                const count = Object.values(FAILURE_MODES).filter(m => m.class === cls).length;
                return (
                  <div key={cls} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: meta.color, flexShrink: 0 }} />
                    <span style={{ fontSize: "10px", color: "#3A3A5C", flex: 1 }}>{cls}</span>
                    <span style={{ fontSize: "9px", color: "#252535" }}>{count} modes</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right: Results panel ── */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{
              padding: "20px 28px",
              borderBottom: "1px solid #13131F",
              background: "linear-gradient(180deg, #0D0D1C 0%, #080810 100%)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ flex: 1, paddingRight: "20px" }}>
                  <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.12em", marginBottom: "6px" }}>
                    TOPOLOGY IDENTIFIED
                  </div>
                  <div style={{ fontSize: "13px", color: "#E2E2F0", lineHeight: "1.5", marginBottom: "6px" }}>
                    {result.topology_summary}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {[
                      result.structure_type?.toUpperCase(),
                      result.agent_count && `${result.agent_count} AGENTS`,
                      result.has_orchestrator && "ORCHESTRATOR",
                      result.has_assurance && "ASSURANCE",
                      result.has_parallel && "PARALLEL",
                    ].filter(Boolean).map(tag => (
                      <span key={tag} style={{
                        fontSize: "9px", padding: "2px 8px",
                        background: "#13131F", border: "1px solid #1E1E30",
                        borderRadius: "3px", color: "#4A4A6A", letterSpacing: "0.06em",
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>

                <div style={{
                  textAlign: "center", flexShrink: 0,
                  padding: "16px 20px",
                  background: "#0A0A14",
                  border: `1px solid ${SEV_COLOR[result.overall_risk]}33`,
                  borderRadius: "10px",
                  borderTop: `3px solid ${SEV_COLOR[result.overall_risk]}`,
                }}>
                  <div style={{
                    fontSize: "32px", fontWeight: "700",
                    background: riskGradient[result.overall_risk],
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    lineHeight: 1,
                  }}>{result.risk_score}</div>
                  <div style={{ fontSize: "8px", color: "#3A3A5C", letterSpacing: "0.1em", marginTop: "4px" }}>
                    RISK SCORE
                  </div>
                  <div style={{
                    fontSize: "9px", fontWeight: "700",
                    color: SEV_COLOR[result.overall_risk],
                    letterSpacing: "0.1em", marginTop: "6px",
                  }}>{result.overall_risk}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {[
                  { label: "DETECTED / LIKELY", count: detected.length, color: "#FF4D4D" },
                  { label: "POSSIBLE", count: possible.length, color: "#FBBF24" },
                  { label: "NOT DETECTED", count: clean.length, color: "#34D399" },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{
                    padding: "8px 12px", background: "#0A0A14",
                    border: `1px solid ${color}22`, borderRadius: "6px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "20px", fontWeight: "700", color, lineHeight: 1 }}>{count}</div>
                    <div style={{ fontSize: "8px", color: "#2A2A40", letterSpacing: "0.08em", marginTop: "3px" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #13131F", padding: "0 28px" }}>
              {[
                { id: "risks", label: `RISKS (${detected.length + possible.length})` },
                { id: "fixes", label: `FIXES (${result.recommended_changes?.length || 0})` },
                { id: "all", label: `ALL MODES (13)` },
              ].map(({ id, label }) => (
                <button key={id} onClick={() => setActiveTab(id)} style={{
                  padding: "10px 16px", background: "none", border: "none",
                  borderBottom: activeTab === id ? "2px solid #38BDF8" : "2px solid transparent",
                  color: activeTab === id ? "#38BDF8" : "#2A2A40",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px",
                  letterSpacing: "0.1em", cursor: "pointer", marginBottom: "-1px",
                }}>{label}</button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px 28px" }}>

              {activeTab === "risks" && (
                <div>
                  {detected.length === 0 && possible.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#34D399" }}>
                      <div style={{ fontSize: "32px", marginBottom: "8px" }}>◈</div>
                      <div style={{ fontSize: "12px" }}>No significant failure modes detected</div>
                    </div>
                  ) : (
                    [...detected, ...possible].map(f => {
                      const mode = FAILURE_MODES[f.mode_id];
                      if (!mode) return null;
                      const cls = CLASS_META[mode.class];
                      const isDetected = f.status === "DETECTED" || f.status === "LIKELY";
                      const statusColor = isDetected ? SEV_COLOR[mode.severity] : "#FBBF24";
                      const expanded = expandedFinding === f.mode_id;

                      return (
                        <div key={f.mode_id}
                          onClick={() => setExpandedFinding(expanded ? null : f.mode_id)}
                          style={{
                            marginBottom: "8px", borderRadius: "8px", cursor: "pointer",
                            border: `1px solid ${statusColor}33`,
                            borderLeft: `3px solid ${statusColor}`,
                            background: isDetected ? `${SEV_COLOR[mode.severity]}08` : "#0A0A14",
                            overflow: "hidden",
                          }}>
                          <div style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "9px", color: cls.color, fontWeight: "700" }}>{f.mode_id}</span>
                                <span style={{ fontSize: "12px", color: "#D0D0E8", fontWeight: "600" }}>{mode.name}</span>
                              </div>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                {isDetected && (
                                  <span style={{
                                    fontSize: "8px", padding: "2px 7px",
                                    background: `${SEV_COLOR[mode.severity]}22`,
                                    border: `1px solid ${SEV_COLOR[mode.severity]}44`,
                                    borderRadius: "3px", color: SEV_COLOR[mode.severity],
                                    letterSpacing: "0.06em",
                                  }}>{mode.severity}</span>
                                )}
                                <span style={{
                                  fontSize: "8px", padding: "2px 7px",
                                  background: `${statusColor}15`,
                                  border: `1px solid ${statusColor}33`,
                                  borderRadius: "3px", color: statusColor,
                                  letterSpacing: "0.06em",
                                }}>{f.status}</span>
                                <span style={{ fontSize: "10px", color: "#2A2A40" }}>{expanded ? "▲" : "▼"}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: "10px", color: "#4A4A6A", marginTop: "4px" }}>{mode.description}</div>
                          </div>

                          {expanded && (
                            <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div style={{
                                padding: "10px 12px", background: "#0A0A14",
                                border: "1px solid #13131F", borderRadius: "6px",
                                fontSize: "11px", color: "#AAA", lineHeight: "1.6",
                              }}>
                                <span style={{ color: "#38BDF8", fontSize: "9px", letterSpacing: "0.08em" }}>ANALYSIS  </span>
                                {f.reasoning}
                              </div>
                              {f.fix && (
                                <div style={{
                                  padding: "10px 12px", background: "#34D39908",
                                  border: "1px solid #34D39922", borderRadius: "6px",
                                  fontSize: "11px", color: "#AAA", lineHeight: "1.6",
                                }}>
                                  <span style={{ color: "#34D399", fontSize: "9px", letterSpacing: "0.08em" }}>FIX  </span>
                                  {f.fix}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === "fixes" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{
                    padding: "14px 16px",
                    background: "#0A0A14", border: "1px solid #1E1E30",
                    borderRadius: "8px", marginBottom: "4px",
                  }}>
                    <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.1em", marginBottom: "6px" }}>VERDICT</div>
                    <div style={{ fontSize: "12px", color: "#C0C0D8", lineHeight: "1.6" }}>{result.verdict}</div>
                  </div>

                  {result.strengths?.length > 0 && (
                    <div style={{
                      padding: "12px 14px", background: "#34D39908",
                      border: "1px solid #34D39922", borderRadius: "8px",
                    }}>
                      <div style={{ fontSize: "9px", color: "#34D399", letterSpacing: "0.1em", marginBottom: "8px" }}>
                        ✓ STRENGTHS
                      </div>
                      {result.strengths.map((s, i) => (
                        <div key={i} style={{ fontSize: "11px", color: "#888", marginBottom: "4px", lineHeight: "1.5" }}>
                          · {s}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: "9px", color: "#3A3A5C", letterSpacing: "0.1em", margin: "4px 0" }}>
                    RECOMMENDED CHANGES — ORDERED BY IMPACT
                  </div>
                  {result.recommended_changes?.map((change, i) => {
                    const priorityColor = i === 0 ? "#FF4D4D" : i === 1 ? "#FF9500" : "#FBBF24";
                    return (
                      <div key={i} style={{
                        padding: "14px 16px", background: "#0A0A14",
                        border: "1px solid #1E1E30",
                        borderLeft: `3px solid ${priorityColor}`,
                        borderRadius: "8px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{
                              width: "20px", height: "20px", borderRadius: "4px",
                              background: `${priorityColor}22`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "10px", fontWeight: "700", color: priorityColor,
                            }}>{change.priority}</div>
                            <span style={{ fontSize: "9px", color: "#2A2A40", letterSpacing: "0.06em" }}>
                              EFFORT: {change.effort}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {change.fixes?.map(id => (
                              <span key={id} style={{
                                fontSize: "8px", padding: "1px 6px",
                                background: `${CLASS_META[FAILURE_MODES[id]?.class]?.color}22`,
                                border: `1px solid ${CLASS_META[FAILURE_MODES[id]?.class]?.color}44`,
                                borderRadius: "3px",
                                color: CLASS_META[FAILURE_MODES[id]?.class]?.color || "#4A4A6A",
                              }}>{id}</span>
                            ))}
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "#C0C0D8", lineHeight: "1.5" }}>{change.change}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "all" && (
                <div>
                  {Object.entries(CLASS_META).map(([className, meta]) => {
                    const modesInClass = Object.entries(FAILURE_MODES).filter(([, m]) => m.class === className);
                    return (
                      <div key={className} style={{ marginBottom: "20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", background: meta.color, borderRadius: "1px" }} />
                          <span style={{ fontSize: "9px", color: meta.color, letterSpacing: "0.1em", fontWeight: "700" }}>
                            {className.toUpperCase()}
                          </span>
                          <div style={{ flex: 1, height: "1px", background: `${meta.color}22` }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          {modesInClass.map(([id, mode]) => {
                            const finding = result.findings?.find(f => f.mode_id === id);
                            const status = finding?.status || "NOT_DETECTED";
                            const isRisky = ["DETECTED", "LIKELY"].includes(status);
                            const isPossible = status === "POSSIBLE";
                            const borderColor = isRisky ? SEV_COLOR[mode.severity] : isPossible ? "#FBBF2466" : "#13131F";

                            return (
                              <div key={id} style={{
                                padding: "8px 10px",
                                background: isRisky ? `${SEV_COLOR[mode.severity]}08` : "#0A0A14",
                                border: `1px solid ${borderColor}`,
                                borderLeft: `2px solid ${isRisky ? SEV_COLOR[mode.severity] : isPossible ? "#FBBF24" : "#1E1E30"}`,
                                borderRadius: "6px",
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                  <span style={{ fontSize: "9px", color: meta.color }}>{id}</span>
                                  <span style={{
                                    fontSize: "8px",
                                    color: isRisky ? SEV_COLOR[mode.severity] : isPossible ? "#FBBF24" : "#34D39966",
                                  }}>
                                    {isRisky ? "●" : isPossible ? "◐" : "○"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "10px", color: isRisky ? "#D0D0E8" : "#3A3A5C", fontWeight: isRisky ? "600" : "400" }}>
                                  {mode.name}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

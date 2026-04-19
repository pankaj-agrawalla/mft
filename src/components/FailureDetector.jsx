import { useState, useRef } from "react";
import { callLLM } from "../utils/llm.js";

const TAXONOMY = {
  C1: {
    name: "Propagation", color: "#F87171", glow: "rgba(248,113,113,0.25)",
    modes: {
      "C1.1": { name: "Premise Pollution",       severity: "CRITICAL", description: "Unverified assumption from early agent treated as ground truth downstream",                        signal: "Claims stated without verification that appear in multiple outputs, increasingly treated as established fact." },
      "C1.2": { name: "Confidence Inflation",    severity: "HIGH",     description: "Uncertainty markers stripped during agent handoffs — hypothesis becomes fact",                    signal: "Hedged language in early outputs becomes assertion language in later outputs on the same claims." },
      "C1.3": { name: "Hallucination Cascade",   severity: "CRITICAL", description: "Fabricated detail from one agent cited and built upon by subsequent agents",                      signal: "Specific facts appear in multiple agents but trace to no tool call or user input." },
    },
  },
  C2: {
    name: "Coordination", color: "#FB923C", glow: "rgba(251,146,60,0.25)",
    modes: {
      "C2.1": { name: "Parallel State Divergence",          severity: "HIGH",     description: "Parallel agents develop contradictory beliefs about shared state",                         signal: "Multiple agents make contradictory assertions about the same entity or metric." },
      "C2.2": { name: "Work Duplication Loop",              severity: "MEDIUM",   description: "Multiple agents independently perform identical or near-identical subtasks",               signal: "Same tool called multiple times with similar inputs, or identical outputs from different agents." },
      "C2.3": { name: "Orchestrator Bottleneck",            severity: "HIGH",     description: "Orchestrator context fills with coordination overhead, degrading routing quality",         signal: "Repeated or contradictory instructions, same subtask assigned to multiple agents." },
      "C2.4": { name: "Silent Tool Non-Invocation",         severity: "CRITICAL", description: "Agent produces plausible-looking output without actually calling required tools",         signal: "Specific data in outputs with no corresponding tool call in the trace." },
    },
  },
  C3: {
    name: "Context", color: "#C084FC", glow: "rgba(192,132,252,0.25)",
    modes: {
      "C3.1": { name: "Context Overflow Truncation", severity: "HIGH", description: "Early context silently truncated — agents ignore constraints set earlier",                            signal: "Agents violating constraints stated earlier, or asking for information already provided." },
      "C3.2": { name: "User Config Ignored",         severity: "HIGH", description: "Agent proceeds without incorporating explicit user-provided configuration",                           signal: "Outputs violate explicit user requirements — format ignored, constraints violated." },
    },
  },
  C4: {
    name: "Structural", color: "#38BDF8", glow: "rgba(56,189,248,0.25)",
    modes: {
      "C4.1": { name: "Topology-Task Mismatch",  severity: "HIGH",     description: "Agent topology mismatched to task structure — parallel on sequential or vice versa",               signal: "Agents blocking on each other in parallel topology, or obvious parallelism missed in sequential." },
      "C4.2": { name: "Assurance Layer Absence", severity: "CRITICAL", description: "No verification agents — open-loop system with no error correction pathway",                       signal: "No agent has a verification, evaluation, or critique role. Errors pass unchallenged." },
    },
  },
  C5: {
    name: "Termination", color: "#4ADE80", glow: "rgba(74,222,128,0.25)",
    modes: {
      "C5.1": { name: "Infinite Coordination Loop", severity: "CRITICAL", description: "Agents cycle without converging — evaluation criteria conflict or no loop-breaking mechanism",   signal: "Same agent invoked repeatedly on similar inputs; cyclical patterns; task never completing." },
      "C5.2": { name: "Premature Convergence",      severity: "HIGH",     description: "Network terminates before adequate completion — partial result declared complete",               signal: "Completion claimed on outputs that don't satisfy stated requirements. Suspiciously fast completion." },
    },
  },
};

const SEV = {
  CRITICAL: { color: "#F87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" },
  HIGH:     { color: "#FB923C", bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.3)"  },
  MEDIUM:   { color: "#FBBF24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.3)"  },
  LOW:      { color: "#4ADE80", bg: "rgba(74,222,128,0.1)",  border: "rgba(74,222,128,0.3)"  },
};

const RISK_COLOR = { CRITICAL: "#F87171", HIGH: "#FB923C", MEDIUM: "#FBBF24", LOW: "#4ADE80" };

const EXAMPLE_TRACE = `Agent 1 (Researcher):
I've searched for information about TechCorp's recent performance. Based on available data, it appears the company may have grown revenue by approximately 40% last year, though I couldn't find official figures. The CEO possibly mentioned strong growth in a recent interview.

Agent 2 (Analyst):
Building on the research, TechCorp achieved 40% revenue growth last year as confirmed above. The CEO confirmed strong growth. Based on this 40% growth rate, I project the company will reach $500M revenue by 2026.

Agent 3 (Writer):
TechCorp has delivered exceptional results with confirmed 40% revenue growth. The company is on track for $500M by 2026 based on their established trajectory. This growth validates their expansion strategy.

[No tool calls found in trace. search_web() not invoked.]`;

export default function FailureDetector({ provider, apiKey }) {
  const [trace, setTrace]       = useState("");
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [activeTab, setActiveTab] = useState("detected");
  const textareaRef = useRef(null);

  const totalModes = Object.values(TAXONOMY).reduce((acc, cls) => acc + Object.keys(cls.modes).length, 0);

  const analyzeTrace = async () => {
    if (!trace.trim()) return;
    setLoading(true); setError(null); setResults(null);

    const modesList = Object.entries(TAXONOMY).flatMap(([, cls]) =>
      Object.entries(cls.modes).map(([id, mode]) => ({ id, name: mode.name, severity: mode.severity, signal: mode.signal }))
    );

    const prompt = `You are analyzing a multi-agent system execution trace for failure modes from the MAS Failure Taxonomy (MFT v0.1).

TRACE TO ANALYZE:
${trace}

FAILURE MODES TO CHECK (${modesList.length} total):
${modesList.map(m => `${m.id} ${m.name} [${m.severity}]: ${m.signal}`).join("\n")}

For EACH failure mode, determine if it is detected, not detected, or uncertain in this trace.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overall assessment of this trace",
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "findings": [
    {
      "mode_id": "C1.1",
      "status": "DETECTED|NOT_DETECTED|UNCERTAIN",
      "confidence": "HIGH|MEDIUM|LOW",
      "evidence": "specific quote or observation from trace, or null",
      "recommendation": "what to do if detected, or null"
    }
  ]
}`;

    try {
      const raw     = await callLLM({ provider, apiKey, userMessage: prompt, maxTokens: 2000 });
      const parsed  = JSON.parse(raw.replace(/```json|```/g, "").trim());

      const enriched = parsed.findings.map(f => {
        const [cid] = f.mode_id.split(".");
        const cls   = TAXONOMY[cid];
        const mode  = cls?.modes[f.mode_id];
        return {
          ...f,
          mode_name:   mode?.name || f.mode_id,
          class_name:  cls?.name  || cid,
          class_color: cls?.color || "#8892A4",
          class_glow:  cls?.glow  || "transparent",
          severity:    mode?.severity || "MEDIUM",
          description: mode?.description || "",
        };
      });

      setResults({ ...parsed, findings: enriched });
      setActiveTab(enriched.some(f => f.status === "DETECTED") ? "detected" : "all");
    } catch (e) {
      setError(e.message || "Analysis failed. Check your key and try again.");
    } finally {
      setLoading(false);
    }
  };

  const detected  = results?.findings.filter(f => f.status === "DETECTED")     || [];
  const uncertain = results?.findings.filter(f => f.status === "UNCERTAIN")     || [];
  const clean     = results?.findings.filter(f => f.status === "NOT_DETECTED")  || [];

  // ── Finding card ─────────────────────────────────────────────────────────────
  const FindingCard = ({ finding }) => {
    const sev         = SEV[finding.severity] || SEV.MEDIUM;
    const isDetected  = finding.status === "DETECTED";
    const isUncertain = finding.status === "UNCERTAIN";
    const accentColor = isDetected ? sev.color : isUncertain ? "#FBBF24" : "#4ADE8066";

    return (
      <div className="finding-card" style={{
        marginBottom: "8px",
        border: `1px solid ${accentColor}28`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: "10px",
        background: isDetected ? `${sev.color}07` : "rgba(255,255,255,0.02)",
        boxShadow: isDetected ? `0 2px 16px ${sev.color}10` : "none",
        overflow: "hidden",
      }}>
        <div style={{ padding: "13px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <span style={{ fontSize: "9px", color: finding.class_color, fontWeight: "700", letterSpacing: "0.06em" }}>
                {finding.mode_id}
              </span>
              <span style={{ fontSize: "12px", color: "#CBD5E1", fontWeight: "600" }}>
                {finding.mode_name}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {isDetected && (
                <span style={{
                  fontSize: "8px", padding: "2px 8px",
                  background: sev.bg, border: `1px solid ${sev.border}`,
                  borderRadius: "4px", color: sev.color, letterSpacing: "0.06em",
                }}>{finding.severity}</span>
              )}
              <span style={{
                fontSize: "8px", padding: "2px 8px",
                background: `${accentColor}18`,
                border: `1px solid ${accentColor}35`,
                borderRadius: "4px", color: accentColor, letterSpacing: "0.06em",
              }}>
                {finding.status === "NOT_DETECTED" ? "CLEAN" : finding.status}
              </span>
            </div>
          </div>

          <div style={{ fontSize: "10px", color: "#4A5568", lineHeight: "1.6" }}>
            {finding.description}
          </div>

          {finding.evidence && (
            <div style={{
              marginTop: "10px", padding: "10px 12px",
              background: "rgba(6,6,11,0.6)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "8px",
              fontSize: "10px", color: "#8892A4", lineHeight: "1.65",
              fontStyle: "italic",
            }}>
              "{finding.evidence}"
            </div>
          )}

          {finding.recommendation && isDetected && (
            <div style={{
              marginTop: "8px", padding: "10px 12px",
              background: "rgba(74,222,128,0.04)",
              border: "1px solid rgba(74,222,128,0.15)",
              borderRadius: "8px",
              fontSize: "10px", color: "#8892A4", lineHeight: "1.65",
            }}>
              <span style={{ color: "#4ADE80", fontWeight: "700", marginRight: "6px" }}>FIX:</span>
              {finding.recommendation}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      minHeight: "calc(100vh - 52px)",
    }}>

      {/* ── Left: input ──────────────────────────────────────────────────────── */}
      <div style={{
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column",
        background: "rgba(255,255,255,0.01)",
      }}>
        <div style={{
          padding: "18px 24px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#F87171", letterSpacing: "0.12em" }}>
              FAILURE DETECTOR
            </div>
            <div style={{ fontSize: "9px", color: "#2A3344", letterSpacing: "0.08em", marginTop: "2px" }}>
              {totalModes} SIGNALS · MFT v0.1
            </div>
          </div>
          <button
            className="example-btn"
            onClick={() => setTrace(EXAMPLE_TRACE)}
            style={{
              fontSize: "9px", padding: "5px 12px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "20px",
              color: "#4A5568",
              fontFamily: "inherit", letterSpacing: "0.06em",
            }}
          >
            LOAD EXAMPLE ↗
          </button>
        </div>

        <div style={{ padding: "16px 24px", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "10px", color: "#2A3344", lineHeight: "1.7" }}>
            Paste your agent execution trace. Checks all {totalModes} MFT failure modes.
          </div>

          <textarea
            ref={textareaRef}
            className="detect-area"
            value={trace}
            onChange={e => setTrace(e.target.value)}
            placeholder={`Paste agent trace here...\n\nAccepted formats:\n— Raw agent conversation logs\n— JSON execution traces\n— LangGraph / CrewAI / AutoGen output\n— Multi-agent chat histories`}
            style={{
              flex: 1, minHeight: "320px",
              background: "rgba(6,6,11,0.6)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "12px",
              color: "#CBD5E1", fontFamily: "inherit",
              fontSize: "12px", lineHeight: "1.75", padding: "16px",
              resize: "none",
            }}
          />

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn-danger"
              onClick={analyzeTrace}
              disabled={loading || !trace.trim()}
              style={{
                flex: 1, padding: "13px",
                background: loading || !trace.trim()
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, #F87171, #FB923C)",
                border: "none", borderRadius: "10px",
                color: loading || !trace.trim() ? "#2A3344" : "#FFF",
                fontFamily: "inherit", fontSize: "11px",
                fontWeight: "700", letterSpacing: "0.1em",
              }}
            >
              {loading
                ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                    <span className="spin" style={{
                      display: "inline-block", width: "11px", height: "11px",
                      border: "2px solid rgba(255,255,255,0.2)",
                      borderTopColor: "#fff", borderRadius: "50%",
                    }} />
                    ANALYZING...
                  </span>
                : "RUN FAILURE ANALYSIS →"}
            </button>
            {trace && (
              <button
                className="btn-ghost"
                onClick={() => { setTrace(""); setResults(null); }}
                style={{
                  padding: "13px 16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  color: "#3D4A5C", fontFamily: "inherit", fontSize: "10px",
                }}
              >CLR</button>
            )}
          </div>

          {error && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: "10px",
              fontSize: "11px", color: "#F87171", lineHeight: "1.6",
            }}>{error}</div>
          )}
        </div>

        {/* Taxonomy reference */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "14px 24px" }}>
          <div style={{ fontSize: "9px", color: "#2A3344", letterSpacing: "0.14em", marginBottom: "10px" }}>
            TAXONOMY REFERENCE
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {Object.entries(TAXONOMY).map(([cid, cls]) => (
              <div key={cid} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <div style={{
                  width: "6px", height: "6px", borderRadius: "2px",
                  background: cls.color, boxShadow: `0 0 6px ${cls.glow}`, flexShrink: 0,
                }} />
                <span style={{ fontSize: "10px", color: "#3D4A5C", flex: 1 }}>{cid} · {cls.name}</span>
                <span style={{ fontSize: "9px", color: "#1E2535" }}>{Object.keys(cls.modes).length}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: results ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column" }}>

        {/* Empty state */}
        {!results && !loading && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: "#1E2535", gap: "14px",
          }}>
            <div style={{ fontSize: "52px", opacity: 0.25 }}>⚡</div>
            <div style={{ fontSize: "11px", letterSpacing: "0.14em" }}>AWAITING TRACE INPUT</div>
            <div style={{ fontSize: "10px", color: "#1A2030", textAlign: "center", maxWidth: "220px", lineHeight: "1.7" }}>
              Paste an execution trace and run analysis
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "24px",
          }}>
            <div style={{ position: "relative", width: "52px", height: "52px" }}>
              <div style={{
                position: "absolute", inset: 0,
                border: "2px solid rgba(255,255,255,0.05)",
                borderTopColor: "#F87171",
                borderRadius: "50%",
                animation: "spin 0.9s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: "8px",
                border: "1px solid rgba(255,255,255,0.04)",
                borderBottomColor: "#FB923C",
                borderRadius: "50%",
                animation: "spin 1.4s linear infinite reverse",
              }} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#4A5568", letterSpacing: "0.12em", textAlign: "center", marginBottom: "16px" }}>
                RUNNING {totalModes} DETECTION SIGNALS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", width: "180px" }}>
                {Object.entries(TAXONOMY).map(([, cls], i) => (
                  <div key={cls.name} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <div className="pulse-dot" style={{
                      width: "5px", height: "5px", borderRadius: "50%",
                      background: cls.color,
                      boxShadow: `0 0 6px ${cls.glow}`,
                      animationDelay: `${i * 0.2}s`,
                    }} />
                    <span style={{ fontSize: "10px", color: "#3D4A5C" }}>{cls.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div style={{
              padding: "18px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(255,255,255,0.01)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontSize: "9px", color: "#3D4A5C", letterSpacing: "0.14em" }}>ANALYSIS RESULTS</span>
                <span style={{
                  fontSize: "9px", padding: "3px 12px", fontWeight: "700",
                  background: `${RISK_COLOR[results.risk_level]}18`,
                  border: `1px solid ${RISK_COLOR[results.risk_level]}40`,
                  borderRadius: "20px",
                  color: RISK_COLOR[results.risk_level], letterSpacing: "0.1em",
                }}>
                  {results.risk_level} RISK
                </span>
              </div>

              <div style={{ fontSize: "11px", color: "#64748B", lineHeight: "1.7", marginBottom: "14px" }}>
                {results.summary}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                {[
                  { label: "DETECTED", count: detected.length,  color: "#F87171" },
                  { label: "UNCERTAIN", count: uncertain.length, color: "#FBBF24" },
                  { label: "CLEAN",     count: clean.length,     color: "#4ADE80" },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${color}22`, borderRadius: "10px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "22px", fontWeight: "700", color, lineHeight: 1, textShadow: `0 0 20px ${color}55` }}>
                      {count}
                    </div>
                    <div style={{ fontSize: "8px", color: "#2A3344", letterSpacing: "0.1em", marginTop: "4px" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "0 24px" }}>
              {[
                { id: "detected",  label: "DETECTED",  count: detected.length,  color: "#F87171" },
                { id: "uncertain", label: "UNCERTAIN",  count: uncertain.length, color: "#FBBF24" },
                { id: "all",       label: "ALL",        count: totalModes,       color: "#8892A4" },
              ].map(({ id, label, count, color }) => (
                <button
                  key={id}
                  className="tab-btn"
                  onClick={() => setActiveTab(id)}
                  style={{
                    padding: "10px 14px", background: "none", border: "none",
                    borderBottom: activeTab === id ? `2px solid ${color}` : "2px solid transparent",
                    color: activeTab === id ? color : "#2A3344",
                    fontFamily: "inherit", fontSize: "9px",
                    letterSpacing: "0.1em", marginBottom: "-1px",
                    display: "flex", alignItems: "center", gap: "7px",
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: "8px", padding: "1px 6px",
                    background: activeTab === id ? `${color}22` : "rgba(255,255,255,0.04)",
                    borderRadius: "10px",
                    color: activeTab === id ? color : "#2A3344",
                  }}>{count}</span>
                </button>
              ))}
            </div>

            {/* Findings */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 28px" }}>
              {(activeTab === "detected" ? detected
                : activeTab === "uncertain" ? uncertain
                : results.findings
              ).map(f => <FindingCard key={f.mode_id} finding={f} />)}

              {activeTab === "detected" && detected.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "#4ADE80" }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px", opacity: 0.7 }}>✓</div>
                  <div style={{ fontSize: "12px" }}>No failure modes detected in this trace</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

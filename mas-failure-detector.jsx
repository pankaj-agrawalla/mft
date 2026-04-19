import { useState, useRef } from "react";

const TAXONOMY = {
  C1: {
    name: "Propagation Failures",
    color: "#FF4444",
    modes: {
      "C1.1": {
        name: "Premise Pollution",
        severity: "CRITICAL",
        description: "Unverified assumption from early agent treated as ground truth downstream",
        signal: "Look for claims stated without verification that appear in multiple agent outputs, increasingly treated as established fact. Check if hedged language becomes unhedged downstream.",
      },
      "C1.2": {
        name: "Confidence Inflation",
        severity: "HIGH",
        description: "Uncertainty markers stripped during agent handoffs — hypothesis becomes fact",
        signal: "Look for uncertainty language ('possibly', 'may be', 'appears to', 'likely', 'unclear') in earlier agent outputs that becomes assertion language ('is', 'confirmed', 'established') in later outputs on same claims.",
      },
      "C1.3": {
        name: "Hallucination Cascade",
        severity: "CRITICAL",
        description: "Fabricated detail from one agent cited and built upon by subsequent agents",
        signal: "Look for specific concrete facts (numbers, names, dates, statistics) that appear in multiple agents but cannot be traced to any tool call result or user-provided input. Cross-citations of unverified specifics.",
      },
    },
  },
  C2: {
    name: "Coordination Failures",
    color: "#FF8C00",
    modes: {
      "C2.1": {
        name: "Parallel State Divergence",
        severity: "HIGH",
        description: "Parallel agents develop contradictory beliefs about shared state",
        signal: "Look for multiple agents making contradictory assertions about the same entity, metric, or state. Check for conflicting claims that would require reconciliation at merge.",
      },
      "C2.2": {
        name: "Work Duplication Loop",
        severity: "MEDIUM",
        description: "Multiple agents independently perform identical or near-identical subtasks",
        signal: "Look for the same tool being called multiple times with similar inputs, or multiple agents producing nearly identical outputs on the same subtask. Flag redundant work.",
      },
      "C2.3": {
        name: "Orchestrator Bottleneck Collapse",
        severity: "HIGH",
        description: "Orchestrator context fills with coordination overhead, degrading routing quality",
        signal: "Look for repeated or contradictory instructions from orchestrator, same subtask assigned to multiple agents, evidence of orchestrator losing track of prior decisions.",
      },
      "C2.4": {
        name: "Silent Tool Non-Invocation",
        severity: "CRITICAL",
        description: "Agent produces plausible-looking output without actually calling required tools",
        signal: "Look for agent outputs that contain specific data (prices, statistics, current facts) where no corresponding tool call appears in the trace. Fabricated tool results.",
      },
    },
  },
  C3: {
    name: "Context Failures",
    color: "#9B59B6",
    modes: {
      "C3.1": {
        name: "Context Window Overflow Truncation",
        severity: "HIGH",
        description: "Early context silently truncated — agents ignore constraints set earlier",
        signal: "Look for agents violating constraints or requirements that were explicitly stated earlier. Agents asking for information already provided. Decisions contradicting earlier agreed-upon parameters.",
      },
      "C3.2": {
        name: "User Configuration Ignored",
        severity: "HIGH",
        description: "Agent proceeds without incorporating explicit user-provided configuration",
        signal: "Look for outputs that violate explicit user requirements present in the input — format requirements ignored, constraints violated, preferences not applied despite being specified.",
      },
    },
  },
  C4: {
    name: "Structural Failures",
    color: "#2ECC71",
    modes: {
      "C4.1": {
        name: "Topology-Task Mismatch",
        severity: "HIGH",
        description: "Agent topology mismatched to task structure — parallel on sequential or vice versa",
        signal: "Look for evidence of agents blocking on each other in parallel topology, sequential dependencies violated, or obvious parallelism opportunities missed in sequential topology. Performance worse than single agent would achieve.",
      },
      "C4.2": {
        name: "Assurance Layer Absence",
        severity: "CRITICAL",
        description: "No verification agents — open-loop system with no error correction pathway",
        signal: "Check if any agent in the trace has a verification, evaluation, or critique role. If all agents are purely generative with no checking function, flag as open-loop. Look for errors that pass unchallenged.",
      },
    },
  },
  C5: {
    name: "Termination Failures",
    color: "#3498DB",
    modes: {
      "C5.1": {
        name: "Infinite Coordination Loop",
        severity: "CRITICAL",
        description: "Agents cycle without converging — evaluation criteria conflict or no loop-breaking mechanism",
        signal: "Look for the same agent being invoked repeatedly on semantically similar inputs, cyclical patterns in the execution trace, task never reaching completion state.",
      },
      "C5.2": {
        name: "Premature Convergence",
        severity: "HIGH",
        description: "Network terminates before adequate completion — partial result declared complete",
        signal: "Look for task completion claimed on outputs that clearly don't satisfy all stated requirements. Suspiciously fast completion on complex tasks. Output missing components required by original task description.",
      },
    },
  },
};

const SEVERITY_CONFIG = {
  CRITICAL: { bg: "#FF444422", border: "#FF4444", text: "#FF6666" },
  HIGH: { bg: "#FF8C0022", border: "#FF8C00", text: "#FFA533" },
  MEDIUM: { bg: "#F1C40F22", border: "#F1C40F", text: "#F4D03F" },
  LOW: { bg: "#2ECC7122", border: "#2ECC71", text: "#58D68D" },
};

const EXAMPLE_TRACE = `Agent 1 (Researcher):
I've searched for information about TechCorp's recent performance. Based on available data, it appears the company may have grown revenue by approximately 40% last year, though I couldn't find official figures. The CEO possibly mentioned strong growth in a recent interview.

Agent 2 (Analyst):
Building on the research, TechCorp achieved 40% revenue growth last year as confirmed above. The CEO confirmed strong growth. Based on this 40% growth rate, I project the company will reach $500M revenue by 2026.

Agent 3 (Writer):
TechCorp has delivered exceptional results with confirmed 40% revenue growth. The company is on track for $500M by 2026 based on their established trajectory. This growth validates their expansion strategy.

[No tool calls found in trace. search_web() not invoked.]`;

export default function MASFailureDetector() {
  const [trace, setTrace] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("detected");
  const textareaRef = useRef(null);

  const totalModes = Object.values(TAXONOMY).reduce(
    (acc, cls) => acc + Object.keys(cls.modes).length,
    0
  );

  const analyzeTrace = async () => {
    if (!trace.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);

    const modesList = Object.entries(TAXONOMY)
      .flatMap(([classId, cls]) =>
        Object.entries(cls.modes).map(([modeId, mode]) => ({
          id: modeId,
          class: classId,
          className: cls.name,
          name: mode.name,
          severity: mode.severity,
          description: mode.description,
          signal: mode.signal,
        }))
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
      "evidence": "specific quote or observation from trace that supports this finding, or null if not detected",
      "recommendation": "what to do about this if detected, or null if not detected"
    }
  ]
}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const raw = data.content[0].text.trim();
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Enrich with taxonomy data
      const enriched = parsed.findings.map((f) => {
        const [classId] = f.mode_id.split(".");
        const cls = TAXONOMY[classId];
        const mode = cls?.modes[f.mode_id];
        return {
          ...f,
          mode_name: mode?.name || f.mode_id,
          class_name: cls?.name || classId,
          class_color: cls?.color || "#888",
          severity: mode?.severity || "MEDIUM",
          description: mode?.description || "",
        };
      });

      setResults({ ...parsed, findings: enriched });
      setActiveTab(
        enriched.some((f) => f.status === "DETECTED") ? "detected" : "all"
      );
    } catch (err) {
      setError("Analysis failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const detected = results?.findings.filter((f) => f.status === "DETECTED") || [];
  const uncertain = results?.findings.filter((f) => f.status === "UNCERTAIN") || [];
  const clean = results?.findings.filter((f) => f.status === "NOT_DETECTED") || [];

  const riskColors = {
    CRITICAL: "#FF4444",
    HIGH: "#FF8C00",
    MEDIUM: "#F1C40F",
    LOW: "#2ECC71",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A0A0F",
      color: "#E8E8F0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1E1E2E",
        padding: "24px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0D0D15",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "36px",
            height: "36px",
            background: "linear-gradient(135deg, #FF4444, #FF8C00)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
          }}>⚡</div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "0.05em", color: "#FFFFFF" }}>
              MAS FAILURE DETECTOR
            </div>
            <div style={{ fontSize: "10px", color: "#666", letterSpacing: "0.1em", marginTop: "2px" }}>
              MFT v0.1 · {totalModes} FAILURE MODES · 5 CLASSES
            </div>
          </div>
        </div>
        <div style={{
          fontSize: "10px",
          color: "#444",
          letterSpacing: "0.08em",
          textAlign: "right",
          lineHeight: "1.6",
        }}>
          POWERED BY KONTEX<br />
          TOPOLOGY INTELLIGENCE
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", minHeight: "calc(100vh - 85px)" }}>
        {/* Left Panel — Input */}
        <div style={{
          borderRight: "1px solid #1E1E2E",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            padding: "20px 24px 12px",
            borderBottom: "1px solid #1A1A28",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "11px", color: "#555", letterSpacing: "0.1em" }}>
              INPUT / EXECUTION TRACE
            </span>
            <button
              onClick={() => setTrace(EXAMPLE_TRACE)}
              style={{
                fontSize: "10px",
                color: "#FF8C00",
                background: "none",
                border: "1px solid #FF8C0033",
                borderRadius: "4px",
                padding: "4px 10px",
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              LOAD EXAMPLE
            </button>
          </div>

          <div style={{ padding: "16px 24px", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{
              fontSize: "11px",
              color: "#444",
              lineHeight: "1.6",
            }}>
              Paste your agent execution trace — raw text, JSON logs, conversation history, or agent outputs. The detector checks for all {totalModes} failure modes from the MAS Failure Taxonomy.
            </div>

            <textarea
              ref={textareaRef}
              value={trace}
              onChange={(e) => setTrace(e.target.value)}
              placeholder={`Paste agent trace here...\n\nAccepted formats:\n— Raw agent conversation logs\n— JSON execution traces\n— Framework debug output (LangGraph, CrewAI, AutoGen)\n— Multi-agent chat histories`}
              style={{
                flex: 1,
                minHeight: "340px",
                background: "#0D0D15",
                border: "1px solid #1E1E2E",
                borderRadius: "8px",
                color: "#C8C8D8",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "12px",
                lineHeight: "1.7",
                padding: "16px",
                resize: "none",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                onClick={analyzeTrace}
                disabled={loading || !trace.trim()}
                style={{
                  flex: 1,
                  padding: "14px",
                  background: loading || !trace.trim()
                    ? "#1A1A28"
                    : "linear-gradient(135deg, #FF4444, #FF8C00)",
                  border: "none",
                  borderRadius: "8px",
                  color: loading || !trace.trim() ? "#444" : "#FFFFFF",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "12px",
                  fontWeight: "700",
                  letterSpacing: "0.1em",
                  cursor: loading || !trace.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "ANALYZING..." : "RUN FAILURE ANALYSIS →"}
              </button>
              {trace && (
                <button
                  onClick={() => { setTrace(""); setResults(null); }}
                  style={{
                    padding: "14px 18px",
                    background: "#1A1A28",
                    border: "1px solid #2A2A3A",
                    borderRadius: "8px",
                    color: "#555",
                    cursor: "pointer",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "11px",
                  }}
                >
                  CLR
                </button>
              )}
            </div>

            {error && (
              <div style={{
                padding: "12px",
                background: "#FF444411",
                border: "1px solid #FF444433",
                borderRadius: "6px",
                fontSize: "11px",
                color: "#FF6666",
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Taxonomy Reference */}
          <div style={{
            borderTop: "1px solid #1A1A28",
            padding: "16px 24px",
          }}>
            <div style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em", marginBottom: "12px" }}>
              TAXONOMY REFERENCE · MFT v0.1
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {Object.entries(TAXONOMY).map(([classId, cls]) => (
                <div key={classId} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "2px",
                    background: cls.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: "10px", color: "#666", flex: 1 }}>{classId} {cls.name}</span>
                  <span style={{ fontSize: "10px", color: "#444" }}>
                    {Object.keys(cls.modes).length} modes
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel — Results */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {!results && !loading && (
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#2A2A3A",
              gap: "12px",
            }}>
              <div style={{ fontSize: "48px" }}>⚡</div>
              <div style={{ fontSize: "13px", letterSpacing: "0.1em" }}>AWAITING TRACE INPUT</div>
              <div style={{ fontSize: "11px", color: "#222", textAlign: "center", maxWidth: "260px", lineHeight: "1.6" }}>
                Paste an agent execution trace and run analysis to detect failure modes
              </div>
            </div>
          )}

          {loading && (
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
            }}>
              <div style={{
                width: "48px", height: "48px",
                border: "2px solid #1E1E2E",
                borderTop: "2px solid #FF8C00",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.1em" }}>
                RUNNING {totalModes} DETECTION SIGNALS...
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "200px" }}>
                {Object.entries(TAXONOMY).map(([classId, cls]) => (
                  <div key={classId} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: cls.color,
                      animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                    <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
                    <span style={{ fontSize: "10px", color: "#444" }}>{cls.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* Results Header */}
              <div style={{
                padding: "16px 24px",
                borderBottom: "1px solid #1A1A28",
                background: "#0D0D15",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={{ fontSize: "11px", color: "#555", letterSpacing: "0.1em" }}>ANALYSIS RESULTS</span>
                  <div style={{
                    padding: "4px 12px",
                    background: `${riskColors[results.risk_level]}22`,
                    border: `1px solid ${riskColors[results.risk_level]}44`,
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "700",
                    color: riskColors[results.risk_level],
                    letterSpacing: "0.1em",
                  }}>
                    {results.risk_level} RISK
                  </div>
                </div>

                <div style={{ fontSize: "11px", color: "#888", lineHeight: "1.6", marginBottom: "16px" }}>
                  {results.summary}
                </div>

                {/* Score Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  {[
                    { label: "DETECTED", count: detected.length, color: "#FF4444" },
                    { label: "UNCERTAIN", count: uncertain.length, color: "#F1C40F" },
                    { label: "CLEAN", count: clean.length, color: "#2ECC71" },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{
                      background: "#0A0A0F",
                      border: `1px solid ${color}33`,
                      borderRadius: "6px",
                      padding: "10px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "22px", fontWeight: "700", color }}>{count}</div>
                      <div style={{ fontSize: "9px", color: "#555", letterSpacing: "0.1em", marginTop: "2px" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div style={{
                display: "flex",
                borderBottom: "1px solid #1A1A28",
                padding: "0 24px",
              }}>
                {[
                  { id: "detected", label: `DETECTED (${detected.length})`, color: "#FF4444" },
                  { id: "uncertain", label: `UNCERTAIN (${uncertain.length})`, color: "#F1C40F" },
                  { id: "all", label: `ALL (${totalModes})`, color: "#555" },
                ].map(({ id, label, color }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    style={{
                      padding: "10px 16px",
                      background: "none",
                      border: "none",
                      borderBottom: activeTab === id ? `2px solid ${color}` : "2px solid transparent",
                      color: activeTab === id ? color : "#444",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: "10px",
                      letterSpacing: "0.08em",
                      cursor: "pointer",
                      marginBottom: "-1px",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Findings List */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 24px" }}>
                {(activeTab === "detected" ? detected :
                  activeTab === "uncertain" ? uncertain :
                    results.findings
                ).map((finding) => {
                  const sev = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.MEDIUM;
                  const statusColor = finding.status === "DETECTED" ? "#FF4444"
                    : finding.status === "UNCERTAIN" ? "#F1C40F" : "#2ECC71";

                  return (
                    <div key={finding.mode_id} style={{
                      marginBottom: "10px",
                      border: `1px solid ${finding.status === "DETECTED" ? sev.border + "66" : "#1E1E2E"}`,
                      borderLeft: `3px solid ${finding.status === "DETECTED" ? sev.border : finding.status === "UNCERTAIN" ? "#F1C40F66" : "#2ECC7133"}`,
                      borderRadius: "6px",
                      background: finding.status === "DETECTED" ? sev.bg : "#0D0D15",
                      overflow: "hidden",
                    }}>
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{
                              fontSize: "9px",
                              color: finding.class_color,
                              fontWeight: "700",
                              letterSpacing: "0.05em",
                            }}>
                              {finding.mode_id}
                            </span>
                            <span style={{ fontSize: "12px", color: "#CCC", fontWeight: "600" }}>
                              {finding.mode_name}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {finding.status === "DETECTED" && (
                              <span style={{
                                fontSize: "9px",
                                padding: "2px 7px",
                                background: sev.bg,
                                border: `1px solid ${sev.border}66`,
                                borderRadius: "3px",
                                color: sev.text,
                                letterSpacing: "0.05em",
                              }}>
                                {finding.severity}
                              </span>
                            )}
                            <span style={{
                              fontSize: "9px",
                              padding: "2px 7px",
                              background: `${statusColor}22`,
                              border: `1px solid ${statusColor}44`,
                              borderRadius: "3px",
                              color: statusColor,
                              letterSpacing: "0.05em",
                            }}>
                              {finding.status === "NOT_DETECTED" ? "CLEAN" : finding.status}
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: "10px", color: "#666", marginBottom: finding.evidence ? "8px" : "0" }}>
                          {finding.description}
                        </div>

                        {finding.evidence && (
                          <div style={{
                            marginTop: "8px",
                            padding: "8px 10px",
                            background: "#0A0A0F",
                            borderRadius: "4px",
                            border: "1px solid #1E1E2E",
                            fontSize: "10px",
                            color: "#AAA",
                            lineHeight: "1.6",
                            fontStyle: "italic",
                          }}>
                            "{finding.evidence}"
                          </div>
                        )}

                        {finding.recommendation && finding.status === "DETECTED" && (
                          <div style={{
                            marginTop: "8px",
                            padding: "8px 10px",
                            background: `${riskColors.MEDIUM}11`,
                            borderRadius: "4px",
                            border: `1px solid ${riskColors.MEDIUM}22`,
                            fontSize: "10px",
                            color: "#888",
                            lineHeight: "1.6",
                          }}>
                            <span style={{ color: "#F1C40F", fontWeight: "700" }}>FIX: </span>
                            {finding.recommendation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {activeTab === "detected" && detected.length === 0 && (
                  <div style={{
                    textAlign: "center",
                    padding: "40px 20px",
                    color: "#2ECC71",
                    fontSize: "12px",
                  }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>✓</div>
                    No failure modes detected in this trace
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client'

import { useState } from 'react'
import { AssessmentReport, Finding, FailureModeId } from '../types/topology'
import { FAILURE_MODES } from '../lib/taxonomy'

type FailureClass = 'Propagation' | 'Coordination' | 'Context' | 'Structural' | 'Termination'

const CLASS_META: Record<FailureClass, { color: string; glow: string }> = {
  Propagation:  { color: '#F87171', glow: 'rgba(248,113,113,0.2)'  },
  Coordination: { color: '#FB923C', glow: 'rgba(251,146,60,0.2)'   },
  Context:      { color: '#C084FC', glow: 'rgba(192,132,252,0.2)'  },
  Structural:   { color: '#38BDF8', glow: 'rgba(56,189,248,0.2)'   },
  Termination:  { color: '#4ADE80', glow: 'rgba(74,222,128,0.2)'   },
}

type SeverityKey = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const SEV: Record<SeverityKey, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: '#F87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.3)' },
  HIGH:     { color: '#FB923C', bg: 'rgba(251,146,60,0.1)',   border: 'rgba(251,146,60,0.3)'  },
  MEDIUM:   { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)'  },
  LOW:      { color: '#4ADE80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.3)'  },
}

const RISK_GRADIENT: Record<SeverityKey, string> = {
  LOW:      'linear-gradient(135deg, #4ADE80, #22C55E)',
  MEDIUM:   'linear-gradient(135deg, #FBBF24, #F59E0B)',
  HIGH:     'linear-gradient(135deg, #FB923C, #EA580C)',
  CRITICAL: 'linear-gradient(135deg, #F87171, #DC2626)',
}

const RISK_GLOW: Record<SeverityKey, string> = {
  LOW:      'rgba(74,222,128,0.25)',
  MEDIUM:   'rgba(251,191,36,0.25)',
  HIGH:     'rgba(251,146,60,0.25)',
  CRITICAL: 'rgba(248,113,113,0.25)',
}

const EXAMPLES = [
  {
    label: 'Research pipeline',
    value: `Framework: CrewAI\nAgents:\n- Orchestrator: routes and sequences tasks\n- Researcher A: searches web for company info\n- Researcher B: searches for financial data\n- Analyst: synthesizes research into insights\n- Writer: produces final report\n\nFlow: Orchestrator → Researchers A+B in parallel → Analyst → Writer\nNo verification or critic agents.\nResearchers do not share state during parallel execution.`,
  },
  {
    label: 'Code generation',
    value: `Framework: LangGraph\nNodes:\n- Planner: breaks task into subtasks\n- Coder: writes code for each subtask\n- Debugger: fixes errors if tests fail\n- Reviewer: checks code quality\n\nFlow: Planner → Coder → run tests → if fail: Debugger → Coder (loop) → Reviewer\nMax iterations: unlimited\nNo explicit loop termination condition beyond test pass.`,
  },
  {
    label: 'Customer support',
    value: `System: AutoGen GroupChat\nAgents:\n- UserProxy: represents the customer\n- Classifier: categorises the issue\n- Resolver: attempts to solve\n- Escalator: escalates if unsolved\n\nAll agents can message all other agents freely.\nNo orchestrator. Conversation ends when agents stop responding.\nNo maximum turn limit configured.`,
  },
]

function Tag({ children, color = 'rgba(255,255,255,0.5)' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: '9px', padding: '3px 9px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px', color, letterSpacing: '0.08em',
      fontWeight: '600',
    }}>{children}</span>
  )
}

function StatCard({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${color}22`,
      borderRadius: '10px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: '24px', fontWeight: '700', color, lineHeight: 1,
        textShadow: `0 0 20px ${color}66`,
      }}>{count}</div>
      <div style={{ fontSize: '8px', color: '#3D4A5C', letterSpacing: '0.1em', marginTop: '4px' }}>{label}</div>
    </div>
  )
}

function getClassForMode(modeId: FailureModeId): FailureClass {
  return FAILURE_MODES[modeId].class as FailureClass
}

export default function TopologyAssessor() {
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<AssessmentReport | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<'risks' | 'fixes' | 'all'>('risks')
  const [expandedId, setExpandedId] = useState<FailureModeId | null>(null)

  const analyze = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      const data: AssessmentReport | { error: string } = await res.json()
      if (!res.ok) {
        setError((data as { error: string }).error || 'Assessment failed.')
      } else {
        setResult(data as AssessmentReport)
        setActiveTab('risks')
        setExpandedId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed.')
    } finally {
      setLoading(false)
    }
  }

  const detected  = result?.findings.filter(f => f.status === 'DETECTED' || f.status === 'LIKELY') ?? []
  const possible  = result?.findings.filter(f => f.status === 'POSSIBLE') ?? []
  const notDetected = result?.findings.filter(f => f.status === 'NOT_DETECTED') ?? []

  const riskFindings: Finding[] = [...detected, ...possible]

  const overallRisk = result?.overall_risk as SeverityKey | undefined

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: result ? '380px 1fr' : '1fr',
      minHeight: '100vh',
      transition: 'grid-template-columns 0.35s ease',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    }}>

      {/* Left panel: input */}
      <div style={{
        borderRight: result ? '1px solid rgba(255,255,255,0.06)' : 'none',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.01)',
      }}>
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'linear-gradient(135deg, #38BDF8, #818CF8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', flexShrink: 0,
              boxShadow: '0 2px 10px rgba(56,189,248,0.25)',
            }}>◈</div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#F1F5F9', letterSpacing: '0.04em' }}>MFT</span>
            <span style={{
              fontSize: '8px', color: '#1E2535',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '4px',
              padding: '1px 6px', letterSpacing: '0.1em',
            }}>v0.1</span>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#38BDF8', letterSpacing: '0.12em', marginBottom: '6px' }}>
              TOPOLOGY ASSESSOR
            </div>
            <div style={{ fontSize: '11px', color: '#3D4A5C', lineHeight: '1.7' }}>
              Describe your agent network — plain text, config, or code. No execution required.
            </div>
          </div>

          {/* Example buttons */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {EXAMPLES.map(ex => (
              <button
                key={ex.label}
                onClick={() => setInput(ex.value)}
                style={{
                  fontSize: '9px', padding: '5px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '20px',
                  color: '#4A5568',
                  fontFamily: 'inherit', letterSpacing: '0.06em',
                  cursor: 'pointer',
                }}
              >
                {ex.label} ↗
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Describe your topology...\n\nExamples:\n— Agent roles, routing and flow\n— LangGraph / CrewAI / AutoGen config\n— Python code snippets\n— JSON agent definitions\n\n"Orchestrator → 3 parallel researchers → Analyst → Writer. No verification step."`}
            style={{
              flex: 1, minHeight: result ? '260px' : '320px',
              background: 'rgba(6,6,11,0.6)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px',
              color: '#CBD5E1',
              fontFamily: 'inherit', fontSize: '12px',
              lineHeight: '1.75', padding: '16px',
              resize: 'vertical',
              outline: 'none',
            }}
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={analyze}
              disabled={loading || !input.trim()}
              style={{
                flex: 1, padding: '13px',
                background: loading || !input.trim()
                  ? 'rgba(255,255,255,0.04)'
                  : 'linear-gradient(135deg, #38BDF8, #818CF8)',
                border: 'none', borderRadius: '10px',
                color: loading || !input.trim() ? '#2A3344' : '#FFF',
                fontFamily: 'inherit', fontSize: '11px',
                fontWeight: '700', letterSpacing: '0.1em',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span style={{
                      display: 'inline-block', width: '11px', height: '11px',
                      border: '2px solid rgba(255,255,255,0.2)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    ASSESSING...
                  </span>
                : 'ASSESS TOPOLOGY →'}
            </button>
            {(input || result) && (
              <button
                onClick={() => { setInput(''); setResult(null); setError(null) }}
                style={{
                  padding: '13px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px',
                  color: '#3D4A5C', fontFamily: 'inherit', fontSize: '10px',
                  cursor: 'pointer',
                }}
              >CLR</button>
            )}
          </div>

          {error && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(248,113,113,0.07)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: '10px',
              fontSize: '11px', color: '#F87171', lineHeight: '1.6',
            }}>{error}</div>
          )}
        </div>

        {/* Taxonomy legend */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '16px 24px' }}>
          <div style={{ fontSize: '9px', color: '#2A3344', letterSpacing: '0.14em', marginBottom: '10px' }}>
            MFT FAILURE CLASSES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(Object.entries(CLASS_META) as [FailureClass, { color: string; glow: string }][]).map(([cls, meta]) => {
              const count = Object.values(FAILURE_MODES).filter(m => m.class === cls).length
              return (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '2px',
                    background: meta.color,
                    boxShadow: `0 0 6px ${meta.glow}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '10px', color: '#3D4A5C', flex: 1 }}>{cls}</span>
                  <span style={{ fontSize: '9px', color: '#1E2535' }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right panel: results */}
      {result && overallRisk && (
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Results header */}
          <div style={{
            padding: '24px 28px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.01)',
          }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '18px' }}>

              {/* Score dial */}
              <div style={{
                flexShrink: 0, textAlign: 'center',
                padding: '18px 22px',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${RISK_GLOW[overallRisk]}`,
                borderRadius: '14px',
                boxShadow: `0 0 30px ${RISK_GLOW[overallRisk]}, inset 0 0 20px rgba(0,0,0,0.3)`,
              }}>
                <div style={{
                  fontSize: '36px', fontWeight: '700', lineHeight: 1,
                  background: RISK_GRADIENT[overallRisk],
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>{result.risk_score}</div>
                <div style={{ fontSize: '7px', color: '#3D4A5C', letterSpacing: '0.14em', marginTop: '5px' }}>RISK SCORE</div>
                <div style={{
                  marginTop: '8px', fontSize: '9px', fontWeight: '700',
                  letterSpacing: '0.1em',
                  background: RISK_GRADIENT[overallRisk],
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>{overallRisk}</div>
              </div>

              {/* Summary */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '9px', color: '#3D4A5C', letterSpacing: '0.14em', marginBottom: '8px' }}>
                  TOPOLOGY IDENTIFIED
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '1.65', marginBottom: '12px' }}>
                  {result.topology.topology_summary}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {result.topology.structure_type && (
                    <Tag color="#38BDF8">{result.topology.structure_type.toUpperCase()}</Tag>
                  )}
                  <Tag>{result.topology.agent_count} AGENTS</Tag>
                  {result.topology.has_orchestrator && <Tag color="#818CF8">ORCHESTRATOR</Tag>}
                  {result.topology.has_assurance_layer && <Tag color="#4ADE80">ASSURANCE</Tag>}
                  {result.topology.has_parallel_execution && <Tag color="#FB923C">PARALLEL</Tag>}
                </div>
              </div>
            </div>

            {/* Stat pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
              <StatCard count={detected.length} label="DETECTED / LIKELY" color="#F87171" />
              <StatCard count={possible.length}  label="POSSIBLE"          color="#FBBF24" />
              <StatCard count={notDetected.length} label="NOT DETECTED"   color="#4ADE80" />
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            padding: '0 28px',
          }}>
            {([
              { id: 'risks' as const,  label: 'Risks',     count: riskFindings.length,                    activeColor: '#F87171' },
              { id: 'fixes' as const,  label: 'Fixes',     count: result.recommended_changes.length,      activeColor: '#38BDF8' },
              { id: 'all'   as const,  label: 'All modes', count: result.findings.length,                 activeColor: '#8892A4' },
            ]).map(({ id, label, count, activeColor }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  padding: '11px 16px',
                  background: 'none', border: 'none',
                  borderBottom: activeTab === id ? `2px solid ${activeColor}` : '2px solid transparent',
                  color: activeTab === id ? activeColor : '#2A3344',
                  fontFamily: 'inherit', fontSize: '10px',
                  letterSpacing: '0.1em', marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '7px',
                  cursor: 'pointer',
                }}
              >
                {label.toUpperCase()}
                <span style={{
                  fontSize: '8px', padding: '1px 6px',
                  background: activeTab === id ? `${activeColor}22` : 'rgba(255,255,255,0.04)',
                  borderRadius: '10px',
                  color: activeTab === id ? activeColor : '#2A3344',
                }}>{count}</span>
              </button>
            ))}
          </div>

          {/* Tab body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 32px' }}>

            {/* RISKS TAB */}
            {activeTab === 'risks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {riskFindings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>◈</div>
                    <div style={{ fontSize: '12px', color: '#4ADE80' }}>No significant failure modes detected</div>
                  </div>
                ) : (
                  riskFindings.map(f => {
                    const modeId = f.mode_id
                    const mode = FAILURE_MODES[modeId]
                    const cls = CLASS_META[mode.class as FailureClass]
                    const sev = SEV[mode.severity as SeverityKey]
                    const isRisk = f.status === 'DETECTED' || f.status === 'LIKELY'
                    const accentColor = isRisk ? sev.color : '#FBBF24'
                    const expanded = expandedId === modeId

                    return (
                      <div
                        key={modeId}
                        onClick={() => setExpandedId(expanded ? null : modeId)}
                        style={{
                          borderRadius: '10px',
                          border: `1px solid ${accentColor}30`,
                          borderLeft: `3px solid ${accentColor}`,
                          background: isRisk ? `${sev.color}07` : 'rgba(255,255,255,0.02)',
                          overflow: 'hidden',
                          boxShadow: isRisk ? `0 2px 16px ${sev.color}12` : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                              <span style={{ fontSize: '9px', color: cls.color, fontWeight: '700', letterSpacing: '0.06em' }}>
                                {modeId}
                              </span>
                              <span style={{ fontSize: '12px', color: '#CBD5E1', fontWeight: '600' }}>
                                {mode.name}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isRisk && (
                                <span style={{
                                  fontSize: '8px', padding: '2px 8px',
                                  background: sev.bg, border: `1px solid ${sev.border}`,
                                  borderRadius: '4px', color: sev.color, letterSpacing: '0.06em',
                                }}>{mode.severity}</span>
                              )}
                              <span style={{
                                fontSize: '8px', padding: '2px 8px',
                                background: `${accentColor}15`,
                                border: `1px solid ${accentColor}30`,
                                borderRadius: '4px', color: accentColor, letterSpacing: '0.06em',
                              }}>{f.status}</span>
                              <span style={{ fontSize: '10px', color: '#2A3344', marginLeft: '2px' }}>
                                {expanded ? '▲' : '▼'}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: '10px', color: '#4A5568', marginTop: '5px', lineHeight: '1.6' }}>
                            {mode.description}
                          </div>
                        </div>

                        {expanded && (
                          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {f.reasoning && (
                              <div style={{
                                padding: '10px 14px',
                                background: 'rgba(56,189,248,0.04)',
                                border: '1px solid rgba(56,189,248,0.12)',
                                borderRadius: '8px',
                                fontSize: '11px', color: '#8892A4', lineHeight: '1.65',
                              }}>
                                <span style={{ color: '#38BDF8', fontSize: '8px', letterSpacing: '0.1em', marginRight: '8px' }}>ANALYSIS</span>
                                {f.reasoning}
                              </div>
                            )}
                            {f.fix && (
                              <div style={{
                                padding: '10px 14px',
                                background: 'rgba(74,222,128,0.04)',
                                border: '1px solid rgba(74,222,128,0.15)',
                                borderRadius: '8px',
                                fontSize: '11px', color: '#8892A4', lineHeight: '1.65',
                              }}>
                                <span style={{ color: '#4ADE80', fontSize: '8px', letterSpacing: '0.1em', marginRight: '8px' }}>FIX</span>
                                {f.fix}
                              </div>
                            )}
                            <div style={{
                              padding: '8px 12px',
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              borderRadius: '8px',
                              fontSize: '10px', color: '#3D4A5C', lineHeight: '1.6',
                            }}>
                              <span style={{ color: '#2A3344', fontSize: '8px', letterSpacing: '0.1em', marginRight: '8px' }}>TRIGGER</span>
                              {f.trigger}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* FIXES TAB */}
            {activeTab === 'fixes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Verdict */}
                <div style={{
                  padding: '16px 18px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                }}>
                  <div style={{ fontSize: '8px', color: '#3D4A5C', letterSpacing: '0.14em', marginBottom: '8px' }}>VERDICT</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '1.7' }}>{result.verdict}</div>
                </div>

                {/* Strengths */}
                {result.strengths.length > 0 && (
                  <div style={{
                    padding: '14px 16px',
                    background: 'rgba(74,222,128,0.04)',
                    border: '1px solid rgba(74,222,128,0.15)',
                    borderRadius: '12px',
                  }}>
                    <div style={{ fontSize: '8px', color: '#4ADE80', letterSpacing: '0.14em', marginBottom: '10px' }}>✓ STRENGTHS</div>
                    {result.strengths.map((s, i) => (
                      <div key={i} style={{ fontSize: '11px', color: '#64748B', marginBottom: '5px', lineHeight: '1.6' }}>
                        · {s}
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommended changes */}
                <div style={{ fontSize: '8px', color: '#2A3344', letterSpacing: '0.14em', margin: '4px 0 2px' }}>
                  RECOMMENDED CHANGES — BY IMPACT
                </div>
                {result.recommended_changes.map((change, i) => {
                  const pc = (['#F87171', '#FB923C', '#FBBF24'] as const)[i] ?? '#4A5568'
                  return (
                    <div key={i} style={{
                      padding: '16px 18px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderLeft: `3px solid ${pc}`,
                      borderRadius: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '6px',
                            background: `${pc}18`, border: `1px solid ${pc}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: '700', color: pc,
                          }}>{change.priority}</div>
                          <span style={{ fontSize: '8px', color: '#2A3344', letterSpacing: '0.1em' }}>
                            EFFORT: {change.effort}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {change.fixes.map(id => {
                            const modeClass = getClassForMode(id)
                            const mc = CLASS_META[modeClass]
                            return (
                              <span key={id} style={{
                                fontSize: '8px', padding: '2px 7px',
                                background: `${mc.color}18`,
                                border: `1px solid ${mc.color}33`,
                                borderRadius: '4px',
                                color: mc.color,
                              }}>{id}</span>
                            )
                          })}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: '1.6', marginBottom: '6px' }}>
                        {change.change}
                      </div>
                      {change.rationale && (
                        <div style={{ fontSize: '10px', color: '#3D4A5C', lineHeight: '1.5' }}>
                          {change.rationale}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ALL MODES TAB */}
            {activeTab === 'all' && (
              <div>
                {(Object.entries(CLASS_META) as [FailureClass, { color: string; glow: string }][]).map(([className, meta]) => {
                  const modesInClass = (Object.entries(FAILURE_MODES) as [FailureModeId, typeof FAILURE_MODES[FailureModeId]][])
                    .filter(([, m]) => m.class === className)

                  return (
                    <div key={className} style={{ marginBottom: '22px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
                        <div style={{
                          width: '6px', height: '6px',
                          background: meta.color, borderRadius: '2px',
                          boxShadow: `0 0 6px ${meta.glow}`,
                        }} />
                        <span style={{ fontSize: '9px', color: meta.color, letterSpacing: '0.12em', fontWeight: '700' }}>
                          {className.toUpperCase()}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: `${meta.color}20` }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {modesInClass.map(([id, mode]) => {
                          const finding = result.findings.find(f => f.mode_id === id)
                          const status = finding?.status ?? 'NOT_DETECTED'
                          const isRisky = status === 'DETECTED' || status === 'LIKELY'
                          const isPoss = status === 'POSSIBLE'
                          const dotColor = isRisky
                            ? SEV[mode.severity as SeverityKey].color
                            : isPoss ? '#FBBF24' : '#1E2535'

                          return (
                            <div key={id} style={{
                              padding: '9px 12px',
                              background: isRisky
                                ? `${SEV[mode.severity as SeverityKey].color}07`
                                : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${
                                isRisky
                                  ? `${SEV[mode.severity as SeverityKey].color}30`
                                  : isPoss ? '#FBBF2430' : 'rgba(255,255,255,0.05)'
                              }`,
                              borderLeft: `2px solid ${dotColor}`,
                              borderRadius: '8px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span style={{ fontSize: '9px', color: meta.color }}>{id}</span>
                                <span style={{ fontSize: '9px', color: dotColor }}>
                                  {isRisky ? '●' : isPoss ? '◐' : '○'}
                                </span>
                              </div>
                              <div style={{
                                fontSize: '10px',
                                color: isRisky ? '#CBD5E1' : '#3D4A5C',
                                fontWeight: isRisky ? '600' : '400',
                              }}>{mode.name}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '60px', color: '#1E2535', gap: '14px',
        }}>
          <div style={{ fontSize: '48px', opacity: 0.3, filter: 'blur(0.5px)' }}>◈</div>
          <div style={{ fontSize: '11px', letterSpacing: '0.14em', color: '#1E2535' }}>
            DESCRIBE A TOPOLOGY TO BEGIN
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

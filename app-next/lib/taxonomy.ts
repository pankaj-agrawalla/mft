import type { Finding, Severity } from '@/types/topology'

export const FAILURE_MODES = {
  'C1.1': {
    name: 'Premise Pollution',
    class: 'Propagation',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Unverified assumption from early agent treated as ground truth downstream',
    detection_basis: 'STRUCTURAL',
  },
  'C1.2': {
    name: 'Confidence Inflation',
    class: 'Propagation',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Uncertainty markers stripped during handoffs — hypothesis becomes assertion',
    detection_basis: 'STRUCTURAL',
  },
  'C1.3': {
    name: 'Hallucination Cascade',
    class: 'Propagation',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Fabricated detail cited and amplified by subsequent agents',
    detection_basis: 'STRUCTURAL',
  },
  'C2.1': {
    name: 'Parallel State Divergence',
    class: 'Coordination',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Parallel agents develop contradictory beliefs about shared state',
    detection_basis: 'STRUCTURAL',
  },
  'C2.2': {
    name: 'Work Duplication Loop',
    class: 'Coordination',
    severity: 'MEDIUM' as const,
    weight: 2,
    description: 'Multiple agents independently execute identical subtasks',
    detection_basis: 'STRUCTURAL',
  },
  'C2.3': {
    name: 'Orchestrator Bottleneck',
    class: 'Coordination',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Orchestrator context fills with coordination overhead, degrading routing',
    detection_basis: 'STRUCTURAL',
  },
  'C2.4': {
    name: 'Silent Tool Non-Invocation',
    class: 'Coordination',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Agent produces plausible output without actually calling required tools',
    detection_basis: 'STRUCTURAL',
  },
  'C3.1': {
    name: 'Context Overflow Truncation',
    class: 'Context',
    severity: 'HIGH' as const,
    weight: 3,
    description: 'Early constraints silently truncated as context window fills',
    detection_basis: 'STRUCTURAL',
  },
  'C3.2': {
    name: 'User Config Ignored',
    class: 'Context',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Agents proceed without incorporating explicit user requirements',
    detection_basis: 'STRUCTURAL',
  },
  'C4.1': {
    name: 'Topology-Task Mismatch',
    class: 'Structural',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Topology structure mismatched to task parallelisability',
    detection_basis: 'RELATIONAL',
  },
  'C4.2': {
    name: 'Assurance Layer Absence',
    class: 'Structural',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'No verification agents — open-loop system with no error correction',
    detection_basis: 'STRUCTURAL',
  },
  'C5.1': {
    name: 'Infinite Coordination Loop',
    class: 'Termination',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Conflicting evaluation criteria cause agents to cycle without converging',
    detection_basis: 'STRUCTURAL',
  },
  'C5.2': {
    name: 'Premature Convergence',
    class: 'Termination',
    severity: 'HIGH' as const,
    weight: 3,
    description: 'Network terminates before adequate completion, reports partial result as complete',
    detection_basis: 'STRUCTURAL',
  },
} as const

export const MAX_RISK_SCORE = Object.values(FAILURE_MODES)
  .reduce((sum, m) => sum + m.weight, 0) // = 58

export function computeRiskScore(findings: Finding[]): number {
  const detected = findings.filter(f =>
    f.status === 'DETECTED' || f.status === 'LIKELY'
  )
  const penalty = detected.reduce((sum, f) => {
    return sum + (FAILURE_MODES[f.mode_id]?.weight || 0)
  }, 0)
  return Math.round((penalty / MAX_RISK_SCORE) * 100)
}

export function computeOverallRisk(score: number): Severity {
  if (score >= 60) return 'CRITICAL'
  if (score >= 35) return 'HIGH'
  if (score >= 15) return 'MEDIUM'
  return 'LOW'
}

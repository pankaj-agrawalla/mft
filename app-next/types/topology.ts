export interface Agent {
  id: string
  name: string
  role: AgentRole
  tools: string[]
  model: string | null
  receives_from: string[]
  sends_to: string[]
  is_parallel_with: string[]
}

export type AgentRole =
  | 'orchestrator'
  | 'planner'
  | 'researcher'
  | 'executor'
  | 'analyst'
  | 'writer'
  | 'evaluator'
  | 'critic'
  | 'mediator'
  | 'monitor'
  | 'synthesizer'
  | 'memory_keeper'
  | 'unknown'

export interface Loop {
  agents: string[]
  condition: string | null
  max_iterations: number | null
  has_termination_condition: boolean
}

export interface ParallelGroup {
  agents: string[]
  has_sync_mechanism: boolean
  merge_agent: string | null
}

export interface TopologyObject {
  agents: Agent[]
  agent_count: number
  loops: Loop[]
  parallel_groups: ParallelGroup[]

  has_orchestrator: boolean
  has_assurance_layer: boolean
  has_parallel_execution: boolean
  has_loops: boolean
  has_state_sharing: boolean
  has_tool_calling: boolean

  framework: string | null
  task_type: string | null
  topology_summary: string | null
  structure_type: TopologyStructure

  parse_confidence: number
  parse_notes: string[]
}

export type TopologyStructure =
  | 'flat'
  | 'sequential'
  | 'centralised'
  | 'parallel'
  | 'hierarchical'
  | 'mesh'
  | 'hybrid'
  | 'unknown'

export type FailureModeId =
  | 'C1.1' | 'C1.2' | 'C1.3'
  | 'C2.1' | 'C2.2' | 'C2.3' | 'C2.4'
  | 'C3.1' | 'C3.2'
  | 'C4.1' | 'C4.2'
  | 'C5.1' | 'C5.2'

export type DetectionStatus = 'DETECTED' | 'LIKELY' | 'POSSIBLE' | 'NOT_DETECTED'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Finding {
  mode_id: FailureModeId
  status: DetectionStatus
  confidence: Confidence
  severity: Severity
  trigger: string
  reasoning: string | null
  fix: string | null
}

export interface RecommendedChange {
  priority: number
  change: string
  fixes: FailureModeId[]
  effort: 'LOW' | 'MEDIUM' | 'HIGH'
  rationale: string
}

export interface AssessmentReport {
  topology: TopologyObject

  findings: Finding[]

  risk_score: number
  overall_risk: Severity
  detected_count: number
  critical_count: number

  verdict: string
  strengths: string[]
  recommended_changes: RecommendedChange[]

  assessment_id: string
  timestamp: string
}

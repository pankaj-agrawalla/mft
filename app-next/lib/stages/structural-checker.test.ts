import { checkStructural } from './structural-checker'
import { TopologyObject } from '../../types/topology'

function makeTopology(overrides: Partial<TopologyObject>): TopologyObject {
  return {
    agents: [],
    agent_count: 3,
    loops: [],
    parallel_groups: [],
    has_orchestrator: false,
    has_assurance_layer: false,
    has_parallel_execution: false,
    has_loops: false,
    has_state_sharing: false,
    has_tool_calling: false,
    framework: null,
    task_type: null,
    topology_summary: null,
    structure_type: 'sequential',
    parse_confidence: 0.9,
    parse_notes: [],
    ...overrides,
  }
}

describe('checkStructural', () => {
  it('returns 12 findings (excluding C4.1)', () => {
    const findings = checkStructural(makeTopology({}))
    expect(findings).toHaveLength(12)
    expect(findings.find(f => f.mode_id === 'C4.1')).toBeUndefined()
  })

  it('no assurance layer, 5 agents, parallel execution → C4.2 DETECTED, C2.1 DETECTED, C1.1 DETECTED', () => {
    const topology = makeTopology({
      agent_count: 5,
      agents: [
        { id: 'a1', name: 'Orchestrator', role: 'orchestrator', tools: [], model: null, receives_from: [], sends_to: ['a2', 'a3'], is_parallel_with: [] },
        { id: 'a2', name: 'Researcher1', role: 'researcher', tools: [], model: null, receives_from: ['a1'], sends_to: [], is_parallel_with: ['a3'] },
        { id: 'a3', name: 'Researcher2', role: 'researcher', tools: [], model: null, receives_from: ['a1'], sends_to: [], is_parallel_with: ['a2'] },
        { id: 'a4', name: 'Analyst', role: 'analyst', tools: [], model: null, receives_from: ['a2', 'a3'], sends_to: [], is_parallel_with: [] },
        { id: 'a5', name: 'Writer', role: 'writer', tools: [], model: null, receives_from: ['a4'], sends_to: [], is_parallel_with: [] },
      ],
      has_assurance_layer: false,
      has_parallel_execution: true,
      has_orchestrator: true,
      parallel_groups: [{ agents: ['a2', 'a3'], has_sync_mechanism: false, merge_agent: 'a4' }],
    })

    const findings = checkStructural(topology)

    expect(findings.find(f => f.mode_id === 'C4.2')?.status).toBe('DETECTED')
    expect(findings.find(f => f.mode_id === 'C2.1')?.status).toBe('DETECTED')
    expect(findings.find(f => f.mode_id === 'C1.1')?.status).toBe('DETECTED')
  })

  it('assurance layer, orchestrator, 3 agents, no loops → C4.2 NOT_DETECTED, C5.1 NOT_DETECTED', () => {
    const topology = makeTopology({
      agent_count: 3,
      agents: [
        { id: 'a1', name: 'Orchestrator', role: 'orchestrator', tools: [], model: null, receives_from: [], sends_to: ['a2'], is_parallel_with: [] },
        { id: 'a2', name: 'Researcher', role: 'researcher', tools: [], model: null, receives_from: ['a1'], sends_to: ['a3'], is_parallel_with: [] },
        { id: 'a3', name: 'Evaluator', role: 'evaluator', tools: [], model: null, receives_from: ['a2'], sends_to: [], is_parallel_with: [] },
      ],
      has_assurance_layer: true,
      has_orchestrator: true,
      has_loops: false,
      loops: [],
    })

    const findings = checkStructural(topology)

    expect(findings.find(f => f.mode_id === 'C4.2')?.status).toBe('NOT_DETECTED')
    expect(findings.find(f => f.mode_id === 'C5.1')?.status).toBe('NOT_DETECTED')
  })

  it('loops with no max_iterations and no termination condition → C5.1 DETECTED', () => {
    const topology = makeTopology({
      has_loops: true,
      loops: [
        { agents: ['a1', 'a2'], condition: null, max_iterations: null, has_termination_condition: false },
      ],
    })

    const findings = checkStructural(topology)

    expect(findings.find(f => f.mode_id === 'C5.1')?.status).toBe('DETECTED')
  })

  it('orchestrator with 7 agents → C2.3 DETECTED', () => {
    const topology = makeTopology({
      agent_count: 7,
      has_orchestrator: true,
    })

    const findings = checkStructural(topology)

    expect(findings.find(f => f.mode_id === 'C2.3')?.status).toBe('DETECTED')
  })

  it('checkStructural is synchronous — returns Finding[] not Promise', () => {
    const result = checkStructural(makeTopology({}))
    expect(Array.isArray(result)).toBe(true)
    expect(result).not.toBeInstanceOf(Promise)
  })

  it('trigger strings are interpolated with actual values', () => {
    const topology = makeTopology({ agent_count: 7, has_orchestrator: true })
    const findings = checkStructural(topology)
    const c23 = findings.find(f => f.mode_id === 'C2.3')
    expect(c23?.trigger).toContain('7')
  })

  it('reasoning and fix are null for all findings (Stage 4 fills these)', () => {
    const findings = checkStructural(makeTopology({}))
    findings.forEach(f => {
      expect(f.reasoning).toBeNull()
      expect(f.fix).toBeNull()
    })
  })
})

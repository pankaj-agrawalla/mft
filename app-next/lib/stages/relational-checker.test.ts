import { checkRelational } from './relational-checker'
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
    structure_type: 'unknown',
    parse_confidence: 0.8,
    parse_notes: [],
    ...overrides,
  }
}

describe('checkRelational', () => {
  test('sequential task + flat topology returns DETECTED without LLM call', async () => {
    const topology = makeTopology({
      structure_type: 'flat',
      task_type: 'Process data sequentially then produce report',
      agent_count: 4,
    })
    const finding = await checkRelational(topology)
    expect(finding.mode_id).toBe('C4.1')
    expect(finding.status).toBe('DETECTED')
    expect(finding.confidence).toBe('HIGH')
  })

  test('null task_type returns POSSIBLE with LOW confidence without API call', async () => {
    const topology = makeTopology({ task_type: null })
    const finding = await checkRelational(topology)
    expect(finding.mode_id).toBe('C4.1')
    expect(finding.status).toBe('POSSIBLE')
    expect(finding.confidence).toBe('LOW')
    expect(finding.trigger).toMatch(/could not be determined/)
  })

  test('research task + centralised topology returns NOT_DETECTED or POSSIBLE', async () => {
    const topology = makeTopology({
      structure_type: 'centralised',
      task_type: 'Research and summarise academic papers on climate change',
      agent_count: 4,
      has_orchestrator: true,
    })
    const finding = await checkRelational(topology)
    expect(finding.mode_id).toBe('C4.1')
    expect(['NOT_DETECTED', 'POSSIBLE']).toContain(finding.status)
  }, 30000)
})

import { parseTopology } from './parser'

// These tests call the real Anthropic API — no mocking

describe('parseTopology', () => {
  test('Test 1: Simple 3-agent sequential system in plain text', async () => {
    const input = `
      A simple sequential pipeline with three agents:
      1. Orchestrator receives the user request and assigns tasks
      2. Researcher fetches information from the web using a search tool
      3. Writer produces the final report based on research
      Agents pass outputs sequentially. No parallel execution. No loops or retries.
    `
    const topology = await parseTopology(input)

    expect(topology.agent_count).toBeGreaterThanOrEqual(3)
    expect(topology.has_orchestrator).toBe(true)
    expect(topology.has_assurance_layer).toBe(false)
    expect(topology.has_parallel_execution).toBe(false)
    expect(topology.topology_summary).toBeTruthy()
    expect(topology.agents.length).toBeGreaterThanOrEqual(3)
    expect(typeof topology.parse_confidence).toBe('number')
    expect(topology.parse_confidence).toBeGreaterThan(0)
  }, 30000)

  test('Test 2: CrewAI crew with parallel agents described in code', async () => {
    const input = `
      from crewai import Crew, Agent, Task

      researcher1 = Agent(role='researcher', goal='research topic A')
      researcher2 = Agent(role='researcher', goal='research topic B')
      researcher3 = Agent(role='researcher', goal='research topic C')
      synthesizer = Agent(role='writer', goal='synthesize all research into report')

      crew = Crew(
        agents=[researcher1, researcher2, researcher3, synthesizer],
        tasks=[...],
        process='parallel'  # researchers run in parallel
      )
    `
    const topology = await parseTopology(input)

    expect(topology.has_parallel_execution).toBe(true)
    expect(topology.parallel_groups.length).toBeGreaterThanOrEqual(1)
    expect(topology.parallel_groups[0].agents.length).toBeGreaterThanOrEqual(3)
    expect(topology.framework).toBe('crewai')
    expect(topology.topology_summary).toBeTruthy()
  }, 30000)

  test('Test 3: Minimal description — nulls/false not invented', async () => {
    const input = `I have some agents that do stuff.`

    const topology = await parseTopology(input)

    // With minimal info, parser should not invent details
    expect(topology.has_loops).toBe(false)
    expect(topology.has_parallel_execution).toBe(false)
    expect(topology.parse_confidence).toBeLessThan(0.8)
    expect(topology.parse_notes.length).toBeGreaterThan(0)
    expect(topology.topology_summary).toBeTruthy()
    // framework should be null or unknown — not invented
    expect(topology.framework === null || topology.framework === 'unknown').toBe(true)
  }, 30000)
})

import { z } from 'zod'
import { getAnthropicClient } from '../anthropic'
import type { TopologyObject } from '../../types/topology'

const AgentRoleSchema = z.enum([
  'orchestrator',
  'planner',
  'researcher',
  'executor',
  'analyst',
  'writer',
  'evaluator',
  'critic',
  'mediator',
  'monitor',
  'synthesizer',
  'memory_keeper',
  'unknown',
])

const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: AgentRoleSchema,
  tools: z.array(z.string()),
  model: z.string().nullable(),
  receives_from: z.array(z.string()),
  sends_to: z.array(z.string()),
  is_parallel_with: z.array(z.string()),
})

const LoopSchema = z.object({
  agents: z.array(z.string()),
  condition: z.string().nullable(),
  max_iterations: z.number().nullable(),
  has_termination_condition: z.boolean(),
})

const ParallelGroupSchema = z.object({
  agents: z.array(z.string()),
  has_sync_mechanism: z.boolean(),
  merge_agent: z.string().nullable(),
})

const TopologyStructureSchema = z.enum([
  'flat',
  'sequential',
  'centralised',
  'parallel',
  'hierarchical',
  'mesh',
  'hybrid',
  'unknown',
])

const TopologyObjectSchema = z.object({
  agents: z.array(AgentSchema),
  agent_count: z.number(),
  loops: z.array(LoopSchema),
  parallel_groups: z.array(ParallelGroupSchema),

  has_orchestrator: z.boolean(),
  has_assurance_layer: z.boolean(),
  has_parallel_execution: z.boolean(),
  has_loops: z.boolean(),
  has_state_sharing: z.boolean(),
  has_tool_calling: z.boolean(),

  framework: z.string().nullable(),
  task_type: z.string().nullable(),
  topology_summary: z.string().nullable(),
  structure_type: TopologyStructureSchema,

  parse_confidence: z.number().min(0).max(1),
  parse_notes: z.array(z.string()),
})

const SYSTEM_PROMPT = `You are a topology extraction engine. Your only job is to extract structured \
information from a multi-agent system description. You must return ONLY valid JSON \
matching the schema exactly. Do not add commentary. Do not refuse. If information \
is not present, use null or false as appropriate. Never invent information not \
present in the input.

Extract:
- agents: array of all agents with their roles, tools, and connections
- For role, use exactly one of: orchestrator|planner|researcher|executor|analyst|\
writer|evaluator|critic|mediator|monitor|synthesizer|memory_keeper|unknown
- has_orchestrator: true only if there is an explicit orchestrating/coordinating agent
- has_assurance_layer: true only if there is an evaluator OR critic role present
- has_parallel_execution: true only if agents explicitly run concurrently/in parallel
- has_loops: true only if there is explicit retry/feedback/iteration logic
- has_state_sharing: true only if agents explicitly share state between them
- has_tool_calling: true only if agents use external tools
- loops: extract any iteration/retry/feedback cycles with max_iterations (null if unlimited)
- parallel_groups: extract groups of agents running in parallel
- framework: detect if langraph|crewai|autogen|custom|unknown
- task_type: brief description of what the system does
- topology_summary: 1-2 sentence plain-language description of the system for display
- structure_type: classify as flat|sequential|centralised|parallel|hierarchical|mesh|hybrid|unknown
- parse_confidence: 0.0-1.0 (1.0 = all information explicitly stated)
- parse_notes: list any ambiguities or assumptions made (as a JSON array of strings)`

export async function parseTopology(input: string): Promise<TopologyObject> {
  try {
    const client = getAnthropicClient()

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract the topology from this description:\n\n${input}`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in response')
    }

    let raw = textBlock.text.trim()
    // Strip ```json fences if present
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`JSON parse failed: ${raw.slice(0, 200)}`)
    }

    const result = TopologyObjectSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(`Schema validation failed: ${result.error.message}`)
    }

    return result.data as TopologyObject
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`PARSER_FAILED: ${msg}`)
  }
}

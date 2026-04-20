import { TopologyObject, Finding } from '../../types/topology'
import { getAnthropicClient } from '../anthropic'

const SEQUENTIAL_KEYWORDS = ['step by step', 'sequentially', 'depends on', 'after', 'then', 'pipeline']

function containsSequentialKeywords(taskType: string): boolean {
  const lower = taskType.toLowerCase()
  return SEQUENTIAL_KEYWORDS.some(kw => lower.includes(kw))
}

export async function checkRelational(topology: TopologyObject): Promise<Finding> {
  // Step 1: Unknown task type
  if (!topology.task_type || topology.task_type.trim() === '' || topology.task_type.toLowerCase() === 'unknown') {
    return {
      mode_id: 'C4.1',
      status: 'POSSIBLE',
      confidence: 'LOW',
      severity: 'HIGH',
      trigger: 'Task type could not be determined — cannot assess topology-task fit',
      reasoning: null,
      fix: null,
    }
  }

  // Step 2: Deterministic clear cases
  const taskType = topology.task_type

  // Clear mismatch: flat topology with sequential task
  if (topology.structure_type === 'flat' && containsSequentialKeywords(taskType)) {
    return {
      mode_id: 'C4.1',
      status: 'DETECTED',
      confidence: 'HIGH',
      severity: 'HIGH',
      trigger: `Flat topology used for a sequential task ("${taskType}") — dependency ordering not enforced`,
      reasoning: null,
      fix: null,
    }
  }

  // Clear mismatch: parallel topology with many agents and no orchestrator
  if (topology.structure_type === 'parallel' && topology.agent_count > 6 && !topology.has_orchestrator) {
    return {
      mode_id: 'C4.1',
      status: 'DETECTED',
      confidence: 'HIGH',
      severity: 'HIGH',
      trigger: `Parallel topology with ${topology.agent_count} agents and no orchestrator — uncoordinated execution for complex task`,
      reasoning: null,
      fix: null,
    }
  }

  // Clear match: sequential topology with sequential task
  if (topology.structure_type === 'sequential' && containsSequentialKeywords(taskType)) {
    return {
      mode_id: 'C4.1',
      status: 'NOT_DETECTED',
      confidence: 'HIGH',
      severity: 'HIGH',
      trigger: 'Sequential topology matches sequential task requirements',
      reasoning: null,
      fix: null,
    }
  }

  // Clear match: flat topology with 2 or fewer agents
  if (topology.structure_type === 'flat' && topology.agent_count <= 2) {
    return {
      mode_id: 'C4.1',
      status: 'NOT_DETECTED',
      confidence: 'HIGH',
      severity: 'HIGH',
      trigger: 'Flat topology with minimal agents — fit not a concern at this scale',
      reasoning: null,
      fix: null,
    }
  }

  // Step 3: Ambiguous — single LLM call
  const client = getAnthropicClient()

  const systemPrompt = `You are assessing topology-task fit for a multi-agent system.

Task type: ${topology.task_type}
Structure type: ${topology.structure_type}
Agent count: ${topology.agent_count}
Has parallel execution: ${topology.has_parallel_execution}

Answer ONLY: is this topology well-matched to this task's parallelisability structure?

Return JSON only:
{
  "matched": true or false,
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "reason": "one sentence explanation"
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Assess this topology-task combination.' }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned) as { matched: boolean; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string }

  let status: Finding['status']
  if (!parsed.matched && (parsed.confidence === 'HIGH' || parsed.confidence === 'MEDIUM')) {
    status = 'DETECTED'
  } else if (!parsed.matched && parsed.confidence === 'LOW') {
    status = 'LIKELY'
  } else if (parsed.matched && parsed.confidence === 'HIGH') {
    status = 'NOT_DETECTED'
  } else {
    status = 'POSSIBLE'
  }

  return {
    mode_id: 'C4.1',
    status,
    confidence: parsed.confidence,
    severity: 'HIGH',
    trigger: parsed.reason,
    reasoning: null,
    fix: null,
  }
}

import { TopologyObject, Finding, RecommendedChange, FailureModeId } from '../../types/topology'
import { getAnthropicClient } from '../anthropic'

interface EnrichedFinding {
  mode_id: string
  reasoning: string
  fix: string
}

interface RecommenderLLMResult {
  findings_enriched: EnrichedFinding[]
  verdict: string
  strengths: string[]
  recommended_changes: RecommendedChange[]
}

export async function generateRecommendations(
  topology: TopologyObject,
  findings: Finding[]
): Promise<{
  enrichedFindings: Finding[]
  verdict: string
  strengths: string[]
  recommended_changes: RecommendedChange[]
}> {
  const detectedFindings = findings.filter(
    f => f.status === 'DETECTED' || f.status === 'LIKELY'
  )

  const agentList = topology.agents.length > 0
    ? topology.agents.map(a => `${a.name} (${a.role})`).join(', ')
    : `${topology.agent_count} agents`

  const systemPrompt = `You are a multi-agent systems architect reviewing a topology assessment.
You have been given structured findings from a deterministic analysis pipeline.
Your job is to:
1. Write a specific reasoning explanation for each detected/likely finding
2. Write a specific fix recommendation for each detected/likely finding
3. Write a 2-3 sentence verdict on production readiness
4. List 2-3 genuine strengths of this topology
5. Produce recommended changes ordered by impact (max 5)

Be specific. Reference actual agents, roles, and counts from the topology.
Do not be generic. Do not repeat the failure mode description.

Topology summary:
- Structure: ${topology.structure_type}
- Agents: ${topology.agent_count} (${agentList})
- Has orchestrator: ${topology.has_orchestrator}
- Has assurance: ${topology.has_assurance_layer}
- Has parallel: ${topology.has_parallel_execution}
- Framework: ${topology.framework ?? 'unknown'}

Detected findings:
${detectedFindings.map(f => `${f.mode_id}: ${f.trigger}`).join('\n')}

Return ONLY valid JSON:
{
  "findings_enriched": [
    {
      "mode_id": "C1.1",
      "reasoning": "specific explanation referencing this topology",
      "fix": "specific actionable fix for this topology"
    }
  ],
  "verdict": "specific verdict on this topology",
  "strengths": ["specific strength 1", "specific strength 2"],
  "recommended_changes": [
    {
      "priority": 1,
      "change": "specific change to make",
      "fixes": ["C4.2", "C1.1"],
      "effort": "LOW",
      "rationale": "why this change has high impact"
    }
  ]
}`

  const client = getAnthropicClient()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Generate reasoning and recommendations for these findings.' }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result = JSON.parse(cleaned) as RecommenderLLMResult

  const enrichmentMap = new Map<string, { reasoning: string; fix: string }>()
  for (const enriched of result.findings_enriched) {
    enrichmentMap.set(enriched.mode_id, { reasoning: enriched.reasoning, fix: enriched.fix })
  }

  const enrichedFindings: Finding[] = findings.map(f => {
    const enrichment = enrichmentMap.get(f.mode_id)
    if (enrichment) {
      return { ...f, reasoning: enrichment.reasoning, fix: enrichment.fix }
    }
    return f
  })

  return {
    enrichedFindings,
    verdict: result.verdict,
    strengths: result.strengths,
    recommended_changes: result.recommended_changes,
  }
}

import { v4 as uuid } from 'uuid'
import { AssessmentReport, Finding } from '../types/topology'
import { parseTopology } from './stages/parser'
import { checkStructural } from './stages/structural-checker'
import { checkRelational } from './stages/relational-checker'
import { generateRecommendations } from './stages/recommender'
import { computeRiskScore, computeOverallRisk } from './taxonomy'

export async function assessTopology(input: string): Promise<AssessmentReport> {
  // Stage 1: Parse
  let topology
  try {
    topology = await parseTopology(input)
  } catch (err) {
    throw new Error('Could not parse topology. Please provide more detail.')
  }

  // Stage 2: Structural check (synchronous)
  let structuralFindings: Finding[]
  try {
    structuralFindings = checkStructural(topology)
  } catch (err) {
    throw new Error('Internal error in structural analysis.')
  }

  // Stage 3: Relational check — graceful degradation on failure
  let relationalFinding: Finding
  try {
    relationalFinding = await checkRelational(topology)
  } catch (err) {
    console.warn('Stage 3 (relational checker) failed, using POSSIBLE fallback:', err)
    relationalFinding = {
      mode_id: 'C4.1',
      status: 'POSSIBLE',
      confidence: 'LOW',
      severity: 'HIGH',
      trigger: 'Relational check could not be completed',
      reasoning: null,
      fix: null,
    }
  }

  const allFindings: Finding[] = [...structuralFindings, relationalFinding]

  // Stage 4: Recommendations — graceful degradation on failure
  let enrichedFindings = allFindings
  let verdict = ''
  let strengths: string[] = []
  let recommended_changes: AssessmentReport['recommended_changes'] = []

  try {
    const result = await generateRecommendations(topology, allFindings)
    enrichedFindings = result.enrichedFindings
    verdict = result.verdict
    strengths = result.strengths
    recommended_changes = result.recommended_changes
  } catch (err) {
    console.warn('Stage 4 (recommender) failed, returning report without enrichment:', err)
  }

  const risk_score = computeRiskScore(enrichedFindings)
  const overall_risk = computeOverallRisk(risk_score)
  const detected_count = enrichedFindings.filter(
    f => f.status === 'DETECTED' || f.status === 'LIKELY'
  ).length
  const critical_count = enrichedFindings.filter(
    f => (f.status === 'DETECTED' || f.status === 'LIKELY') && f.severity === 'CRITICAL'
  ).length

  return {
    topology,
    findings: enrichedFindings,
    risk_score,
    overall_risk,
    detected_count,
    critical_count,
    verdict,
    strengths,
    recommended_changes,
    assessment_id: uuid(),
    timestamp: new Date().toISOString(),
  }
}

import { POST } from './route'
import { NextRequest } from 'next/server'
import { AssessmentReport } from '../../../types/topology'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/assess', () => {
  it('returns 400 for empty input', async () => {
    const req = makeRequest({ input: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 for input exceeding 10000 chars', async () => {
    const req = makeRequest({ input: 'a'.repeat(10_001) })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 for missing input field', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it(
    'returns 200 with valid AssessmentReport for a real topology description',
    async () => {
      const req = makeRequest({
        input: 'Orchestrator coordinates 3 parallel researcher agents and one analyst. No evaluator present.',
      })
      const res = await POST(req)
      expect(res.status).toBe(200)

      const report = (await res.json()) as AssessmentReport

      // 13 findings total
      expect(report.findings).toHaveLength(13)

      // risk_score in valid range
      expect(report.risk_score).toBeGreaterThanOrEqual(0)
      expect(report.risk_score).toBeLessThanOrEqual(100)

      // assessment_id is UUID v4
      expect(report.assessment_id).toMatch(UUID_REGEX)

      // topology_summary is a non-empty string
      expect(typeof report.topology.topology_summary).toBe('string')
      expect((report.topology.topology_summary as string).length).toBeGreaterThan(0)

      // overall_risk is a valid severity
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(report.overall_risk)
    },
    60_000 // allow time for real LLM calls
  )
})

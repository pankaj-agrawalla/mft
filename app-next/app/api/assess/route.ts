import { NextRequest, NextResponse } from 'next/server'
import { assessTopology } from '../../../lib/pipeline'

// In-memory rate limiter — resets on server restart.
// Replace with Redis/Upstash before deploying to a serverless environment.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('input' in body) ||
    typeof (body as Record<string, unknown>).input !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request body must include an "input" string field.' },
      { status: 400 }
    )
  }

  const input = ((body as Record<string, unknown>).input as string).trim()

  if (input.length === 0) {
    return NextResponse.json(
      { error: 'Input must not be empty.' },
      { status: 400 }
    )
  }

  if (input.length > 10_000) {
    return NextResponse.json(
      { error: 'Input exceeds maximum length of 10,000 characters.' },
      { status: 400 }
    )
  }

  try {
    const report = await assessTopology(input)
    return NextResponse.json(report)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Assessment failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

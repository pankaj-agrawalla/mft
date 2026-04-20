# MFT Toolkit — Claude Code Context

## What this project is

A browser-based tool for assessing multi-agent LLM system topologies against the MAS Failure Taxonomy (MFT v0.1) — 13 empirically-grounded failure modes across 5 classes.

## Current state

The existing `src/` directory contains a working Vite + React (JSX) frontend-only prototype. It makes direct browser-to-API calls using `src/utils/llm.js` and does a **single monolithic LLM call** that asks the model to both detect failure modes AND produce a risk score. The risk score is LLM-generated, not deterministic.

The rebuild (tracked in `BUILDGUIDE.md`) replaces this with a Next.js 14 + TypeScript app in `app-next/` using a 4-stage deterministic pipeline.

## Stack

**Existing prototype (do not modify):** Vite + React JSX, no TypeScript  
**Rebuild target:** Next.js 14 App Router + TypeScript strict mode + Tailwind CSS + Anthropic SDK

## Architecture — the 4-stage pipeline

The core design principle: **detection is deterministic, explanation is LLM.** Never mix these.

| Stage | File | LLM? | Notes |
|---|---|---|---|
| 1 — Parser | `lib/stages/parser.ts` | Yes | Extracts structured TopologyObject from any input format |
| 2 — Structural Checker | `lib/stages/structural-checker.ts` | **No** | Pure deterministic rules against TopologyObject |
| 3 — Relational Checker | `lib/stages/relational-checker.ts` | Only for ambiguous cases | Handles C4.1 (topology-task fit) |
| 4 — Recommender | `lib/stages/recommender.ts` | Yes | Generates reasoning text and fix recommendations |

Maximum 3 LLM calls per assessment. Risk score is always computed from weights in `lib/taxonomy.ts`, never from LLM output.

## Model IDs (use these exactly)

- Parser (Stage 1): `claude-opus-4-7` — highest accuracy for structured extraction
- Relational checker (Stage 3): `claude-sonnet-4-6`
- Recommender (Stage 4): `claude-sonnet-4-6`

Never use `claude-opus-4-5` (doesn't exist) or other unlisted model IDs.

## Key types

All types live in `types/topology.ts`. The main types are:

- `TopologyObject` — output of Stage 1; structural representation of the system
- `Finding` — one finding per failure mode (13 total); `reasoning` and `fix` are null until Stage 4
- `AssessmentReport` — final output; topology + findings + scores + LLM-generated narrative

**Important field nesting:** all topology properties are under `report.topology.*`, not flat on the report. Scores (`risk_score`, `overall_risk`) are on the report directly.

## Failure modes

13 modes across 5 classes. All defined in `lib/taxonomy.ts` with weights used for risk score computation.

- C1.x Propagation (3 modes) — error amplification through handoffs
- C2.x Coordination (4 modes) — parallel execution and orchestrator problems
- C3.x Context (2 modes) — context window and config propagation issues
- C4.x Structural (2 modes) — topology design mismatches
- C5.x Termination (2 modes) — loop and convergence failures

C4.1 is the only mode with `detection_basis: 'RELATIONAL'` — it requires task context + topology. All others are structural and handled deterministically in Stage 2.

## Visual design constants

Preserve these across any UI work:

```
Background: #080810
Propagation: #F87171    Coordination: #FB923C    Context: #C084FC
Structural: #38BDF8     Termination: #4ADE80
CRITICAL: #F87171       HIGH: #FB923C            MEDIUM: #FBBF24    LOW: #4ADE80
```

## What changed from v0.1 (the existing Vite prototype)

1. Risk score: LLM-generated → deterministic weight-based calculation
2. Detection logic: LLM-inferred → explicit deterministic rules with documented triggers
3. API keys: stored in localStorage, sent from browser → server-side `.env.local` only
4. Provider support: Anthropic / OpenAI / Google → Anthropic only
5. Stack: Vite + JSX → Next.js 14 + TypeScript strict mode

## Invariants to never break

- `checkStructural()` must remain synchronous — no async, no LLM calls
- All 13 findings must be returned on every assessment, including NOT_DETECTED
- `risk_score` must be computed using `computeRiskScore()` from `lib/taxonomy.ts`
- Stage order must always be 1 → 2 → 3 → 4 (never skip a stage)
- TypeScript strict mode: zero `any` types, zero `@ts-ignore`

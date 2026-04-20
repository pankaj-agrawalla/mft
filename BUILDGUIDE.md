# Kontex Topology Assessor — Build Guide
## Staged Pipeline Implementation for Claude Code + VSCode

**Version:** 1.1 (corrected)
**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Anthropic SDK
**Architecture:** 4-stage pipeline — Parse → Structural Check → Relational Check → Recommend
**Total Sprints:** 6
**Estimated Build Time:** 3-4 days

---

## What This Is

A full rebuild of the existing `mft` Vite+React project into Next.js 14 with TypeScript and a deterministic 4-stage assessment pipeline.

**What changes:**
- Stack: Vite + JSX → Next.js 14 + TypeScript (strict mode)
- Assessment: single monolithic LLM call → 4-stage pipeline
- Risk scoring: LLM-generated number → deterministic weight-based calculation
- API keys: stored in localStorage, sent from browser → stored in `.env.local`, server-side only
- Provider support: Anthropic / OpenAI / Google → Anthropic only (server-side)

**What stays the same:**
- Visual design language (dark bg `#080810`, same color tokens, same component structure)
- MFT taxonomy (all 13 failure modes, same IDs and descriptions)
- The two-panel layout and tab structure

---

## Architecture Overview

```
User Input (any format)
        ↓
[STAGE 1] Topology Parser
  → LLM extraction call (claude-opus-4-7)
  → Output: TopologyObject (structured JSON, Zod-validated)
        ↓
[STAGE 2] Structural Checker
  → Pure deterministic logic — NO LLM
  → Output: Finding[] (12 findings, one per mode except C4.1)
        ↓
[STAGE 3] Relational Checker
  → Deterministic rules first; one LLM call only for ambiguous cases
  → Output: Finding (1 finding for C4.1)
        ↓
[STAGE 4] Recommendation Generator
  → LLM scoped to reasoning + recommendations only
  → Output: AssessmentReport (enriched findings + verdict + changes)
        ↓
UI Render
```

**Critical principle:** Detection is deterministic. Explanation is LLM. Never mix these responsibilities.

---

## Data Schemas (Source of Truth)

Define these first. Every stage is built against these types.

```typescript
// types/topology.ts

export interface Agent {
  id: string
  name: string
  role: AgentRole
  tools: string[]
  model: string | null
  receives_from: string[]      // agent ids
  sends_to: string[]           // agent ids
  is_parallel_with: string[]   // agent ids in same parallel group
}

export type AgentRole =
  | 'orchestrator'
  | 'planner'
  | 'researcher'
  | 'executor'
  | 'analyst'
  | 'writer'
  | 'evaluator'      // assurance
  | 'critic'         // assurance
  | 'mediator'
  | 'monitor'
  | 'synthesizer'
  | 'memory_keeper'
  | 'unknown'

export interface Loop {
  agents: string[]             // agent ids involved in loop
  condition: string | null     // what triggers re-execution
  max_iterations: number | null // null = unlimited = risk
  has_termination_condition: boolean
}

export interface ParallelGroup {
  agents: string[]             // agent ids running in parallel
  has_sync_mechanism: boolean  // do they sync state before merge?
  merge_agent: string | null   // which agent merges their output
}

export interface TopologyObject {
  // Structure
  agents: Agent[]
  agent_count: number
  loops: Loop[]
  parallel_groups: ParallelGroup[]

  // Derived booleans (set by parser)
  has_orchestrator: boolean
  has_assurance_layer: boolean   // has evaluator OR critic role
  has_parallel_execution: boolean
  has_loops: boolean
  has_state_sharing: boolean
  has_tool_calling: boolean

  // Context
  framework: string | null       // langraph|crewai|autogen|custom|unknown
  task_type: string | null       // extracted task description
  topology_summary: string | null // 1-2 sentence plain-language description of the system
  structure_type: TopologyStructure

  // Parser metadata
  parse_confidence: number       // 0-1, how confident parser is
  parse_notes: string[]          // anything ambiguous
}

export type TopologyStructure =
  | 'flat'
  | 'sequential'
  | 'centralised'
  | 'parallel'
  | 'hierarchical'
  | 'mesh'
  | 'hybrid'
  | 'unknown'

// Failure mode IDs
export type FailureModeId =
  | 'C1.1' | 'C1.2' | 'C1.3'
  | 'C2.1' | 'C2.2' | 'C2.3' | 'C2.4'
  | 'C3.1' | 'C3.2'
  | 'C4.1' | 'C4.2'
  | 'C5.1' | 'C5.2'

export type DetectionStatus = 'DETECTED' | 'LIKELY' | 'POSSIBLE' | 'NOT_DETECTED'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Finding {
  mode_id: FailureModeId
  status: DetectionStatus
  confidence: Confidence
  severity: Severity
  // What triggered detection (deterministic evidence)
  trigger: string
  // Human-readable reasoning (LLM generated in stage 4)
  reasoning: string | null
  // Specific fix recommendation (LLM generated in stage 4)
  fix: string | null
}

export interface RecommendedChange {
  priority: number
  change: string
  fixes: FailureModeId[]
  effort: 'LOW' | 'MEDIUM' | 'HIGH'
  rationale: string
}

export interface AssessmentReport {
  // Input summary
  topology: TopologyObject

  // Findings from stages 2+3
  findings: Finding[]

  // Computed scores (deterministic)
  risk_score: number           // 0-100
  overall_risk: Severity
  detected_count: number
  critical_count: number

  // LLM-generated (stage 4 only)
  verdict: string
  strengths: string[]
  recommended_changes: RecommendedChange[]

  // Meta
  assessment_id: string
  timestamp: string
}
```

---

## MFT Taxonomy Constants

```typescript
// lib/taxonomy.ts
// Copy this exactly — these weights drive the risk score

export const FAILURE_MODES = {
  'C1.1': {
    name: 'Premise Pollution',
    class: 'Propagation',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Unverified assumption from early agent treated as ground truth downstream',
    detection_basis: 'STRUCTURAL',
  },
  'C1.2': {
    name: 'Confidence Inflation',
    class: 'Propagation',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Uncertainty markers stripped during handoffs — hypothesis becomes assertion',
    detection_basis: 'STRUCTURAL',
  },
  'C1.3': {
    name: 'Hallucination Cascade',
    class: 'Propagation',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Fabricated detail cited and amplified by subsequent agents',
    detection_basis: 'STRUCTURAL',
  },
  'C2.1': {
    name: 'Parallel State Divergence',
    class: 'Coordination',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Parallel agents develop contradictory beliefs about shared state',
    detection_basis: 'STRUCTURAL',
  },
  'C2.2': {
    name: 'Work Duplication Loop',
    class: 'Coordination',
    severity: 'MEDIUM' as const,
    weight: 2,
    description: 'Multiple agents independently execute identical subtasks',
    detection_basis: 'STRUCTURAL',
  },
  'C2.3': {
    name: 'Orchestrator Bottleneck',
    class: 'Coordination',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Orchestrator context fills with coordination overhead, degrading routing',
    detection_basis: 'STRUCTURAL',
  },
  'C2.4': {
    name: 'Silent Tool Non-Invocation',
    class: 'Coordination',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Agent produces plausible output without actually calling required tools',
    detection_basis: 'STRUCTURAL',
  },
  'C3.1': {
    name: 'Context Overflow Truncation',
    class: 'Context',
    severity: 'HIGH' as const,
    weight: 3,
    description: 'Early constraints silently truncated as context window fills',
    detection_basis: 'STRUCTURAL',
  },
  'C3.2': {
    name: 'User Config Ignored',
    class: 'Context',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Agents proceed without incorporating explicit user requirements',
    detection_basis: 'STRUCTURAL',
  },
  'C4.1': {
    name: 'Topology-Task Mismatch',
    class: 'Structural',
    severity: 'HIGH' as const,
    weight: 4,
    description: 'Topology structure mismatched to task parallelisability',
    detection_basis: 'RELATIONAL',
  },
  'C4.2': {
    name: 'Assurance Layer Absence',
    class: 'Structural',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'No verification agents — open-loop system with no error correction',
    detection_basis: 'STRUCTURAL',
  },
  'C5.1': {
    name: 'Infinite Coordination Loop',
    class: 'Termination',
    severity: 'CRITICAL' as const,
    weight: 5,
    description: 'Conflicting evaluation criteria cause agents to cycle without converging',
    detection_basis: 'STRUCTURAL',
  },
  'C5.2': {
    name: 'Premature Convergence',
    class: 'Termination',
    severity: 'HIGH' as const,
    weight: 3,
    description: 'Network terminates before adequate completion, reports partial result as complete',
    detection_basis: 'STRUCTURAL',
  },
} as const

export const MAX_RISK_SCORE = Object.values(FAILURE_MODES)
  .reduce((sum, m) => sum + m.weight, 0) // = 58

export function computeRiskScore(findings: Finding[]): number {
  const detected = findings.filter(f =>
    f.status === 'DETECTED' || f.status === 'LIKELY'
  )
  const penalty = detected.reduce((sum, f) => {
    return sum + (FAILURE_MODES[f.mode_id]?.weight || 0)
  }, 0)
  return Math.round((penalty / MAX_RISK_SCORE) * 100)
}

export function computeOverallRisk(score: number): Severity {
  if (score >= 60) return 'CRITICAL'
  if (score >= 35) return 'HIGH'
  if (score >= 15) return 'MEDIUM'
  return 'LOW'
}
```

---

## Sprint 1 — Project Setup

### Goal
Next.js 14 project with TypeScript, all dependencies installed, environment configured, type definitions in place.

> **Note:** This is a full rebuild of the existing `mft` project. The new Next.js app replaces the Vite build. The existing `src/`, `index.html`, `vite.config.js`, `mas-*.jsx` files are not carried over — only the visual design language is preserved.

### Claude Code Prompt

```
This is a rebuild of the existing mft project. Create a Next.js 14 App Router project 
with TypeScript and Tailwind CSS in a new subdirectory called `app-next` within the 
existing mft repo. Do NOT delete the existing Vite files.

Project structure to create inside app-next/:
  app/
    page.tsx              (main page, just renders <TopologyAssessor />)
    layout.tsx            (minimal layout, dark background #080810)
    api/
      assess/
        route.ts          (POST endpoint, empty handler for now)
  components/
    TopologyAssessor.tsx  (main component, empty shell for now)
  lib/
    taxonomy.ts           (copy the FAILURE_MODES constant and helper functions exactly as specified)
    anthropic.ts          (Anthropic client singleton using ANTHROPIC_API_KEY env var)
  types/
    topology.ts           (copy all TypeScript interfaces exactly as specified)
  .env.local              (ANTHROPIC_API_KEY=placeholder)

Install these packages:
- @anthropic-ai/sdk
- zod (for runtime validation of LLM outputs)
- uuid (for assessment_id generation)
- @types/uuid

After setup:
1. Verify TypeScript compiles with no errors: npx tsc --noEmit
2. Verify dev server starts: npm run dev
3. Return the exact project structure created
```

### Verification
- `npx tsc --noEmit` passes with zero errors
- `npm run dev` starts without errors
- All type files match the schemas defined above exactly

---

## Sprint 2 — Stage 1: Topology Parser

### Goal
Build the extraction LLM call that takes any format input and outputs a validated `TopologyObject`.

### What This Stage Does
- Sends user input to Claude with a structured extraction prompt
- Receives structured JSON back
- Validates with Zod schema
- Returns `TopologyObject` or throws with specific error

### Claude Code Prompt

```
Build the topology parser in lib/stages/parser.ts

This is Stage 1 of the pipeline. It takes raw user input (any format — plain text, 
code, JSON, YAML) and returns a validated TopologyObject.

Create lib/stages/parser.ts with:

1. A Zod schema that mirrors the TopologyObject type exactly (for runtime validation)

2. An async function parseTopology(input: string): Promise<TopologyObject>
   that does the following:

   a. Calls the Anthropic API with model "claude-opus-4-7"
      (Use Opus for maximum extraction accuracy on the parsing stage)

   b. Uses this EXACT system prompt:

   "You are a topology extraction engine. Your only job is to extract structured 
   information from a multi-agent system description. You must return ONLY valid JSON 
   matching the schema exactly. Do not add commentary. Do not refuse. If information 
   is not present, use null or false as appropriate. Never invent information not 
   present in the input.

   Extract:
   - agents: array of all agents with their roles, tools, and connections
   - For role, use exactly one of: orchestrator|planner|researcher|executor|analyst|
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
   - parse_notes: list any ambiguities or assumptions made (as a JSON array of strings)"

   c. Uses this user message format:
   "Extract the topology from this description:\n\n{input}"

   d. Sets max_tokens to 4000
      (Complex topologies with many agents produce large JSON — 2000 is too tight)

   e. Parses the response JSON (strip any ```json fences before parsing)

   f. Validates against the Zod schema

   g. Returns the validated TopologyObject

   h. On any error: throws new Error("PARSER_FAILED: {specific reason}")

3. Export the function as a named export: export async function parseTopology(...)

Also create lib/stages/parser.test.ts with 3 test cases:
   - Test 1: Simple 3-agent sequential system described in plain text
   - Test 2: CrewAI crew with parallel agents described in code
   - Test 3: Minimal description with missing information (test that nulls/false 
     are returned correctly, not invented values)

Use Jest for tests. Tests should call the real API.
Mock nothing — we need to verify actual extraction quality.
```

### Verification
- `parseTopology("Orchestrator → Researcher → Analyst → Writer, no verification")` returns TopologyObject with `has_assurance_layer: false`, `has_orchestrator: true`, `agent_count: 4`
- `parseTopology("3 parallel researcher agents merge into synthesizer")` returns `has_parallel_execution: true`, `parallel_groups` with 3 agents
- `topology_summary` is a non-empty string on every successful parse
- Zod validation catches malformed LLM output and throws correctly

---

## Sprint 3 — Stage 2: Structural Checker

### Goal
Pure deterministic logic that checks `TopologyObject` against structural failure modes. Zero LLM calls in this stage.

### Detection Rules (implement exactly)

```
C1.1 Premise Pollution:
  DETECTED if: has_assurance_layer == false AND agent_count >= 3
  LIKELY if:   has_assurance_layer == false AND agent_count == 2
  NOT_DETECTED if: has_assurance_layer == true
  trigger: "No assurance agent to catch unverified premises before they propagate"

C1.2 Confidence Inflation:
  DETECTED if: has_assurance_layer == false AND has_loops == false 
               AND agent_count >= 3
  LIKELY if:   has_assurance_layer == false AND agent_count == 2
  NOT_DETECTED if: has_assurance_layer == true
  trigger: "No verification step between agent handoffs to preserve uncertainty markers"

C1.3 Hallucination Cascade:
  DETECTED if: has_assurance_layer == false AND has_tool_calling == true 
               AND agent_count >= 3
  LIKELY if:   has_assurance_layer == false AND has_tool_calling == true 
               AND agent_count == 2
  NOT_DETECTED if: has_assurance_layer == true OR has_tool_calling == false
  trigger: "Tool-calling agents with no verification — fabricated tool results 
            can propagate unchecked"

C2.1 Parallel State Divergence:
  DETECTED if: has_parallel_execution == true 
               AND any parallel_group has has_sync_mechanism == false
  LIKELY if:   has_parallel_execution == true 
               AND all parallel_groups have has_sync_mechanism == true
  NOT_DETECTED if: has_parallel_execution == false
  trigger: "Parallel agents with no state synchronisation before merge"

C2.2 Work Duplication Loop:
  DETECTED if: has_parallel_execution == true 
               AND parallel_groups exist where agents have same role
  LIKELY if:   has_parallel_execution == true AND agent_count > 4
  NOT_DETECTED if: has_parallel_execution == false
  trigger: "Parallel agents with overlapping roles and no intent coordination"

C2.3 Orchestrator Bottleneck:
  DETECTED if: has_orchestrator == true AND agent_count > 6
  LIKELY if:   has_orchestrator == true AND agent_count > 4
  POSSIBLE if: has_orchestrator == true AND agent_count > 3
  NOT_DETECTED if: has_orchestrator == false OR agent_count <= 3
  trigger: "Orchestrator managing {agent_count} agents — context pressure likely 
            above 4-agent threshold"

C2.4 Silent Tool Non-Invocation:
  DETECTED if: has_tool_calling == true AND has_assurance_layer == false
  LIKELY if:   has_tool_calling == true AND has_assurance_layer == true
  NOT_DETECTED if: has_tool_calling == false
  trigger: "Tool-calling agents with no execution trace verification"

C3.1 Context Overflow Truncation:
  DETECTED if: agent_count >= 5 AND has_loops == true
  LIKELY if:   agent_count >= 5 OR (has_loops == true AND agent_count >= 3)
  POSSIBLE if: agent_count >= 3
  NOT_DETECTED if: agent_count <= 2 AND has_loops == false
  trigger: "Long agent chains accumulate context — early constraints risk truncation"

C3.2 User Config Ignored:
  DETECTED if: parse_confidence < 0.5 (unclear if config is propagated)
  POSSIBLE if: parse_confidence < 0.8
  NOT_DETECTED if: has_orchestrator == true AND parse_confidence >= 0.8
  trigger: "No explicit config propagation mechanism detected"

C4.2 Assurance Layer Absence:
  DETECTED if: has_assurance_layer == false
  NOT_DETECTED if: has_assurance_layer == true
  confidence: HIGH always (directly readable from topology)
  trigger: "No evaluator or critic agent found in topology"

C5.1 Infinite Coordination Loop:
  DETECTED if: has_loops == true 
               AND any loop has max_iterations == null 
               AND any loop has has_termination_condition == false
  LIKELY if:   has_loops == true 
               AND any loop has max_iterations == null
  POSSIBLE if: has_loops == true
  NOT_DETECTED if: has_loops == false OR all loops have finite max_iterations
  trigger: "Loop with no maximum iteration limit and no termination condition"

C5.2 Premature Convergence:
  DETECTED if: has_loops == false AND agent_count >= 5 
               AND has_assurance_layer == false
  LIKELY if:   has_assurance_layer == false AND agent_count >= 3
  NOT_DETECTED if: has_assurance_layer == true
  trigger: "No feedback mechanism — agents cannot catch and correct incomplete outputs"
```

Note: C4.1 (Topology-Task Mismatch) is NOT handled here — it requires task context and is handled in Stage 3.

### Claude Code Prompt

```
Build the structural checker in lib/stages/structural-checker.ts

This is Stage 2 of the pipeline. It takes a TopologyObject and returns Finding[] 
using ONLY deterministic logic. There are zero LLM calls in this file.

Rules:
- No async functions
- No external calls of any kind
- No randomness
- Same input always produces same output

Function signature:
export function checkStructural(topology: TopologyObject): Finding[]

Implement detection rules for these failure modes exactly as specified in the 
build guide: C1.1, C1.2, C1.3, C2.1, C2.2, C2.3, C2.4, C3.1, C3.2, C4.2, C5.1, C5.2

For each finding:
- mode_id: the failure mode ID
- status: DETECTED|LIKELY|POSSIBLE|NOT_DETECTED (from rules)
- confidence: HIGH if directly readable from topology, MEDIUM if inferred, LOW if uncertain
- severity: from FAILURE_MODES constant in lib/taxonomy.ts
- trigger: the specific trigger string from the rules (interpolate actual values 
  e.g. "managing 7 agents" not "managing {agent_count} agents")
- reasoning: null (filled in Stage 4)
- fix: null (filled in Stage 4)

Return findings for ALL 12 failure modes handled here (not C4.1).
Include NOT_DETECTED findings — the full picture matters.

Also create lib/stages/structural-checker.test.ts with:
- Test topology with no assurance layer, 5 agents, parallel execution
  → verify C4.2 is DETECTED, C2.1 is DETECTED, C1.1 is DETECTED
- Test topology with assurance layer, orchestrator, 3 agents, no loops
  → verify C4.2 is NOT_DETECTED, C5.1 is NOT_DETECTED
- Test topology with loops and no max_iterations
  → verify C5.1 is DETECTED
- Test topology with orchestrator and 7 agents
  → verify C2.3 is DETECTED

Tests must not call any API. Pure unit tests.
```

### Verification
- All 4 test cases pass
- `checkStructural()` is synchronous (no async)
- Returns exactly 12 findings (one per mode, excluding C4.1)
- Trigger strings contain actual interpolated values

---

## Sprint 4 — Stage 3: Relational Checker

### Goal
Handle C4.1 (Topology-Task Mismatch) which requires understanding both the task and the topology together. Uses one targeted LLM call only for ambiguous cases.

### Claude Code Prompt

```
Build the relational checker in lib/stages/relational-checker.ts

This is Stage 3 of the pipeline. It handles ONE failure mode: C4.1 Topology-Task Mismatch.

This mode requires understanding whether the chosen topology matches the task's 
parallelisability structure — something that requires semantic understanding.

Function signature:
export async function checkRelational(topology: TopologyObject): Promise<Finding>

Logic:

Step 1: Check if task_type is null or unknown
  If yes: return {
    mode_id: 'C4.1',
    status: 'POSSIBLE',
    confidence: 'LOW',
    severity: 'HIGH',
    trigger: 'Task type could not be determined — cannot assess topology-task fit',
    reasoning: null,
    fix: null
  }

Step 2: Apply deterministic rules first (no LLM needed for clear cases):

  CLEAR MISMATCH (return DETECTED without LLM):
  - structure_type is 'flat' AND task_type contains sequential keywords
    (keywords: 'step by step', 'sequentially', 'depends on', 'after', 'then', 'pipeline')
  - structure_type is 'parallel' AND agent_count > 6 AND has_orchestrator is false

  CLEAR MATCH (return NOT_DETECTED without LLM):
  - structure_type is 'sequential' AND task_type contains sequential keywords
  - structure_type is 'flat' AND agent_count <= 2

Step 3: For all other cases, make ONE LLM call using the Anthropic client singleton.
  Use model "claude-sonnet-4-6".

  System: "You are assessing topology-task fit for a multi-agent system.

  Task type: {topology.task_type}
  Structure type: {topology.structure_type}
  Agent count: {topology.agent_count}
  Has parallel execution: {topology.has_parallel_execution}

  Answer ONLY: is this topology well-matched to this task's parallelisability structure?

  Return JSON only:
  {
    'matched': true|false,
    'confidence': 'HIGH'|'MEDIUM'|'LOW',
    'reason': 'one sentence explanation'
  }"

  User: "Assess this topology-task combination."

  Map result:
  - matched=false, confidence HIGH/MEDIUM → DETECTED
  - matched=false, confidence LOW → LIKELY
  - matched=true, confidence HIGH → NOT_DETECTED
  - matched=true, confidence LOW/MEDIUM → POSSIBLE

Return the final Finding for C4.1.

Create lib/stages/relational-checker.test.ts:
- Test with sequential task + parallel topology → expect DETECTED
- Test with null task_type → expect POSSIBLE, confidence LOW (no API call made)
- Test with research task + centralised topology → expect NOT_DETECTED or POSSIBLE
```

### Verification
- Deterministic cases return without making LLM calls
- LLM cases make exactly one API call
- All returns conform to Finding type

---

## Sprint 5 — Stage 4: Recommendation Generator + Pipeline Orchestrator

### Goal
LLM generates human-readable explanations and recommendations. Orchestrator ties all stages together into a single `AssessmentReport`.

### Claude Code Prompt

```
Build two files:

1. lib/stages/recommender.ts — Stage 4: Recommendation Generator

Use model "claude-sonnet-4-6" for this stage.

Function signature:
export async function generateRecommendations(
  topology: TopologyObject,
  findings: Finding[]
): Promise<{
  enrichedFindings: Finding[],
  verdict: string,
  strengths: string[],
  recommended_changes: RecommendedChange[]
}>

This function:
a. Filters to only DETECTED and LIKELY findings for the LLM call
b. Makes ONE LLM call with this exact system prompt:

"You are a multi-agent systems architect reviewing a topology assessment.
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
- Structure: {topology.structure_type}
- Agents: {topology.agent_count} ({list agent names and roles})
- Has orchestrator: {topology.has_orchestrator}
- Has assurance: {topology.has_assurance_layer}
- Has parallel: {topology.has_parallel_execution}
- Framework: {topology.framework}

Detected findings:
{findings.map(f => `${f.mode_id}: ${f.trigger}`).join('\n')}

Return ONLY valid JSON:
{
  'findings_enriched': [
    {
      'mode_id': 'C1.1',
      'reasoning': 'specific explanation referencing this topology',
      'fix': 'specific actionable fix for this topology'
    }
  ],
  'verdict': 'specific verdict on this topology',
  'strengths': ['specific strength 1', 'specific strength 2'],
  'recommended_changes': [
    {
      'priority': 1,
      'change': 'specific change to make',
      'fixes': ['C4.2', 'C1.1'],
      'effort': 'LOW|MEDIUM|HIGH',
      'rationale': 'why this change has high impact'
    }
  ]
}"

c. Merges enriched reasoning/fix back into the full findings array
   (NOT_DETECTED findings keep reasoning: null, fix: null)
d. Returns the complete enriched result

---

2. lib/pipeline.ts — Pipeline Orchestrator

Function signature:
export async function assessTopology(input: string): Promise<AssessmentReport>

This function runs all 4 stages in sequence:

  Stage 1: const topology = await parseTopology(input)
  Stage 2: const structuralFindings = checkStructural(topology)
  Stage 3: const relationalFinding = await checkRelational(topology)
  Stage 4:
    const allFindings = [...structuralFindings, relationalFinding]
    const { enrichedFindings, verdict, strengths, recommended_changes } =
      await generateRecommendations(topology, allFindings)

  Compute scores:
    const risk_score = computeRiskScore(enrichedFindings)
    const overall_risk = computeOverallRisk(risk_score)
    const detected_count = enrichedFindings.filter(
      f => f.status === 'DETECTED' || f.status === 'LIKELY'
    ).length
    const critical_count = enrichedFindings.filter(
      f => (f.status === 'DETECTED' || f.status === 'LIKELY')
        && f.severity === 'CRITICAL'
    ).length

  Return AssessmentReport:
  {
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
    timestamp: new Date().toISOString()
  }

Error handling:
- If Stage 1 fails: throw with message "Could not parse topology. Please provide more detail."
- If Stage 2 fails: throw with message "Internal error in structural analysis."
- If Stage 3 fails: log warning, continue with POSSIBLE finding for C4.1
- If Stage 4 fails: return report without reasoning/fix (graceful degradation)
```

### Verification
- `assessTopology("Orchestrator + 3 researchers + analyst + writer, no evaluator")` returns complete AssessmentReport
- `risk_score` is computed from finding weights, not LLM opinion
- `detected_count` matches actual finding array
- Total LLM calls per assessment: exactly 3 (parser, relational if needed, recommender)

---

## Sprint 6 — API Route + UI Integration

### Goal
Wire pipeline to Next.js API route. Build the TypeScript UI component using `AssessmentReport` as the typed data shape.

### Important: field path reference

The API returns `AssessmentReport`. Topology properties are nested under `report.topology.*`:

| Old (Vite app) | New (AssessmentReport) |
|---|---|
| `result.topology_summary` | `result.topology.topology_summary` |
| `result.structure_type` | `result.topology.structure_type` |
| `result.agent_count` | `result.topology.agent_count` |
| `result.has_orchestrator` | `result.topology.has_orchestrator` |
| `result.has_assurance` | `result.topology.has_assurance_layer` |
| `result.has_parallel` | `result.topology.has_parallel_execution` |
| `result.overall_risk` | `result.overall_risk` (on report directly) |
| `result.risk_score` | `result.risk_score` (on report directly) |
| `result.findings` | `result.findings` (on report directly) |
| `result.verdict` | `result.verdict` (on report directly) |
| `result.top_risks` | **removed** — not in AssessmentReport |

### Claude Code Prompt

```
Build the API route and the TypeScript UI component.

1. app/api/assess/route.ts

POST handler that:
a. Reads body: { input: string }
b. Validates: input must be non-empty string, max 10000 chars
c. Calls: const report = await assessTopology(input)
d. Returns: NextResponse.json(report)
e. Error handling:
   - 400 if input invalid
   - 500 with { error: message } if pipeline throws
   - Never expose stack traces to client

Add rate limiting: max 10 requests per IP per minute using a simple in-memory Map.
NOTE: This in-memory rate limiter resets on server restart and is for development
only. Add a comment noting it should be replaced with Redis/Upstash before deploying
to a serverless environment.

2. components/TopologyAssessor.tsx

This component no longer accepts provider/apiKey props. It calls the internal
API route instead:

fetch('/api/assess', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input })
})

The response is typed as AssessmentReport. Do not use `any` types.

The component renders:
- result.topology.topology_summary as the "TOPOLOGY IDENTIFIED" description text
- result.topology.structure_type, agent_count, has_orchestrator, has_assurance_layer,
  has_parallel_execution as tag pills
- result.risk_score as the large number with color coding
- result.overall_risk for color selection
- result.findings grouped by class (for the "All modes" tab)
- findings filtered to DETECTED/LIKELY for the "Risks" tab
- result.recommended_changes ordered by priority (for the "Fixes" tab)
- result.verdict and result.strengths in the Fixes tab

Visual design: preserve the existing color tokens and layout exactly:
  - CLASS_META colors: Propagation #F87171, Coordination #FB923C, Context #C084FC, 
    Structural #38BDF8, Termination #4ADE80
  - SEV colors: CRITICAL #F87171, HIGH #FB923C, MEDIUM #FBBF24, LOW #4ADE80
  - Background: #080810
  - Same two-panel grid layout (input left, results right)
  - Same tab structure: Risks / Fixes / All modes

No TypeScript errors allowed (strict mode). Zero 'any' types.

3. Add app/api/assess/route.test.ts

Integration test:
- POST with valid topology description → 200 with valid AssessmentReport
- POST with empty string → 400
- POST with input > 10000 chars → 400
- Verify report has: findings array length == 13, risk_score 0-100,
  assessment_id is UUID format
```

### Verification
- `curl -X POST /api/assess -d '{"input":"5 parallel agents no evaluator"}' -H 'Content-Type: application/json'` returns valid JSON
- TypeScript compiles with zero errors
- All 13 findings present in response
- `risk_score` is number between 0-100
- `result.topology.topology_summary` is a non-empty string

---

## End-to-End Verification Prompt

Run this after all 6 sprints:

```
Run a complete end-to-end verification of the Kontex Topology Assessor pipeline.

Test with these 3 inputs:

Input 1 (high risk — should score 60+):
"Framework: CrewAI. Agents: Orchestrator routes tasks. Three parallel researchers
search the web independently. Analyst synthesizes research. Writer produces report.
No verification step. Researchers do not share state. No maximum iteration limit."

Input 2 (low risk — should score under 20):
"LangGraph pipeline. Orchestrator coordinates 3 agents: Researcher, Analyst, Evaluator.
Researcher finds information and calls search tool. Analyst synthesizes with explicit
uncertainty preservation. Evaluator checks output against original requirements before
passing to Analyst for revision. Max 3 revision iterations. Sequential execution only."

Input 3 (ambiguous — test graceful handling):
"I have some agents that do stuff and pass results around."

For each input verify:
1. Stage 1 returns valid TopologyObject with non-null topology_summary (log it)
2. Stage 2 returns exactly 12 findings (log detected count)
3. Stage 3 returns exactly 1 finding for C4.1
4. Stage 4 returns enriched findings with non-null reasoning for DETECTED findings
5. risk_score is higher for Input 1 than Input 2
6. Input 3 returns POSSIBLE for most modes with LOW confidence (not DETECTED)
7. All 3 complete without throwing
8. Log total LLM API calls made per assessment

Fix any failures before considering this build complete.
```

---

## File Structure (Final)

```
app-next/
  app/
    page.tsx
    layout.tsx
    api/
      assess/
        route.ts
        route.test.ts
  components/
    TopologyAssessor.tsx
  lib/
    taxonomy.ts              ← FAILURE_MODES, computeRiskScore, computeOverallRisk
    anthropic.ts             ← Anthropic client singleton
    pipeline.ts              ← assessTopology() orchestrator
    stages/
      parser.ts              ← Stage 1: parseTopology() — model: claude-opus-4-7
      parser.test.ts
      structural-checker.ts  ← Stage 2: checkStructural() — NO async, NO LLM
      structural-checker.test.ts
      relational-checker.ts  ← Stage 3: checkRelational() — model: claude-sonnet-4-6
      relational-checker.test.ts
      recommender.ts         ← Stage 4: generateRecommendations() — model: claude-sonnet-4-6
  types/
    topology.ts              ← All TypeScript interfaces
  .env.local
  package.json
  tsconfig.json
```

---

## Rules for Claude Code

1. **Never skip stages** — all 4 stages must run for every assessment
2. **Stage 2 is always synchronous** — if you find yourself adding async to structural-checker.ts, stop and reconsider
3. **LLM calls: maximum 3 per assessment** — parser (1) + relational if needed (1) + recommender (1)
4. **risk_score is always computed from weights** — never let the LLM output a number for risk
5. **All 13 findings always returned** — including NOT_DETECTED ones
6. **TypeScript strict mode** — zero `any` types, zero ts-ignore comments
7. **Tests before UI** — stages 1-4 must pass their tests before touching the component
8. **Model IDs are fixed** — parser uses `claude-opus-4-7`, relational/recommender use `claude-sonnet-4-6`; never use model IDs not listed here
9. **topology_summary comes from the parser** — it is a field on TopologyObject, not the verdict

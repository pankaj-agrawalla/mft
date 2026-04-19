# MFT — Multi-Agent Failure Taxonomy Toolkit

A browser-based toolkit for analysing multi-agent LLM systems against **MFT v0.1** — 13 empirically-grounded failure modes across 5 classes.

## Tools

### Topology Assessor (`/assess`)
Describe your agent topology in plain text, code, or config — no execution required. The assessor identifies your structure type, scores overall risk (0–100), and flags which of the 13 failure modes are present, likely, or possible, with specific fixes ordered by impact.

### Failure Detector (`/detect`)
Paste a real agent execution trace (raw logs, JSON, LangGraph/CrewAI/AutoGen output). The detector runs all 13 detection signals against the trace and surfaces evidence, severity, and remediation steps for each detected failure.

## MFT v0.1 Failure Classes

| Class | Modes |
|---|---|
| C1 · Propagation | Premise Pollution, Confidence Inflation, Hallucination Cascade |
| C2 · Coordination | Parallel State Divergence, Work Duplication Loop, Orchestrator Bottleneck, Silent Tool Non-Invocation |
| C3 · Context | Context Overflow Truncation, User Config Ignored |
| C4 · Structural | Topology-Task Mismatch, Assurance Layer Absence |
| C5 · Termination | Infinite Coordination Loop, Premature Convergence |

## Supported LLM Providers

Bring your own key from any of:

| Provider | Model | Key format |
|---|---|---|
| Anthropic | claude-sonnet-4-20250514 | `sk-ant-...` |
| OpenAI | gpt-4o | `sk-proj-...` |
| Google | gemini-2.0-flash | `AIza...` |

API keys are stored in `localStorage` only — never sent to any server other than the provider's own API.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), enter your API key in the modal, and start analysing.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Vercel auto-detects Vite. The `vercel.json` rewrite rule handles SPA routing so `/assess` and `/detect` don't 404 on hard refresh.

## Project Structure

```
mft/
├── src/
│   ├── App.jsx                    # API key modal, nav, routes
│   ├── main.jsx
│   ├── components/
│   │   ├── TopologyAssessor.jsx   # /assess
│   │   └── FailureDetector.jsx    # /detect
│   └── utils/
│       └── llm.js                 # Unified caller for all 3 providers
├── index.html
├── vite.config.js
└── vercel.json
```

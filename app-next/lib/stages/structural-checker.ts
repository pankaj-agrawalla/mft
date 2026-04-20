import { TopologyObject, Finding, FailureModeId, DetectionStatus, Confidence } from '../../types/topology'
import { FAILURE_MODES } from '../taxonomy'

function makeFinding(
  mode_id: FailureModeId,
  status: DetectionStatus,
  confidence: Confidence,
  trigger: string
): Finding {
  return {
    mode_id,
    status,
    confidence,
    severity: FAILURE_MODES[mode_id].severity,
    trigger,
    reasoning: null,
    fix: null,
  }
}

export function checkStructural(topology: TopologyObject): Finding[] {
  const findings: Finding[] = []
  const { agent_count, has_assurance_layer, has_loops, has_tool_calling,
    has_parallel_execution, has_orchestrator, parallel_groups, loops,
    parse_confidence } = topology

  // C1.1 Premise Pollution
  if (has_assurance_layer) {
    findings.push(makeFinding('C1.1', 'NOT_DETECTED', 'HIGH',
      'Assurance agent present to catch unverified premises before they propagate'))
  } else if (agent_count >= 3) {
    findings.push(makeFinding('C1.1', 'DETECTED', 'HIGH',
      'No assurance agent to catch unverified premises before they propagate'))
  } else {
    findings.push(makeFinding('C1.1', 'LIKELY', 'MEDIUM',
      'No assurance agent to catch unverified premises before they propagate'))
  }

  // C1.2 Confidence Inflation
  if (has_assurance_layer) {
    findings.push(makeFinding('C1.2', 'NOT_DETECTED', 'HIGH',
      'Assurance agent present to preserve uncertainty markers across handoffs'))
  } else if (agent_count >= 3 && !has_loops) {
    findings.push(makeFinding('C1.2', 'DETECTED', 'HIGH',
      'No verification step between agent handoffs to preserve uncertainty markers'))
  } else if (agent_count === 2) {
    findings.push(makeFinding('C1.2', 'LIKELY', 'MEDIUM',
      'No verification step between agent handoffs to preserve uncertainty markers'))
  } else {
    findings.push(makeFinding('C1.2', 'LIKELY', 'MEDIUM',
      'No verification step between agent handoffs to preserve uncertainty markers'))
  }

  // C1.3 Hallucination Cascade
  if (has_assurance_layer || !has_tool_calling) {
    findings.push(makeFinding('C1.3', 'NOT_DETECTED', 'HIGH',
      has_assurance_layer
        ? 'Assurance agent present to catch fabricated tool results'
        : 'No tool-calling agents — hallucination cascade risk does not apply'))
  } else if (agent_count >= 3) {
    findings.push(makeFinding('C1.3', 'DETECTED', 'HIGH',
      'Tool-calling agents with no verification — fabricated tool results can propagate unchecked'))
  } else {
    findings.push(makeFinding('C1.3', 'LIKELY', 'MEDIUM',
      'Tool-calling agents with no verification — fabricated tool results can propagate unchecked'))
  }

  // C2.1 Parallel State Divergence
  if (!has_parallel_execution) {
    findings.push(makeFinding('C2.1', 'NOT_DETECTED', 'HIGH',
      'No parallel execution detected'))
  } else {
    const hasUnsyncedGroup = parallel_groups.some(g => !g.has_sync_mechanism)
    if (hasUnsyncedGroup) {
      findings.push(makeFinding('C2.1', 'DETECTED', 'HIGH',
        'Parallel agents with no state synchronisation before merge'))
    } else {
      findings.push(makeFinding('C2.1', 'LIKELY', 'MEDIUM',
        'Parallel agents present — state synchronisation mechanisms exist but divergence still possible'))
    }
  }

  // C2.2 Work Duplication Loop
  if (!has_parallel_execution) {
    findings.push(makeFinding('C2.2', 'NOT_DETECTED', 'HIGH',
      'No parallel execution detected'))
  } else {
    const hasSameRoleGroup = parallel_groups.some(group => {
      const agentIds = new Set(group.agents)
      const roles = topology.agents
        .filter(a => agentIds.has(a.id))
        .map(a => a.role)
      return roles.length !== new Set(roles).size
    })
    if (hasSameRoleGroup) {
      findings.push(makeFinding('C2.2', 'DETECTED', 'HIGH',
        'Parallel agents with overlapping roles and no intent coordination'))
    } else if (agent_count > 4) {
      findings.push(makeFinding('C2.2', 'LIKELY', 'MEDIUM',
        `Parallel agents with ${agent_count} total agents — role overlap risk elevated`))
    } else {
      findings.push(makeFinding('C2.2', 'LIKELY', 'LOW',
        'Parallel agents present — monitor for duplicate work across agents'))
    }
  }

  // C2.3 Orchestrator Bottleneck
  if (!has_orchestrator || agent_count <= 3) {
    findings.push(makeFinding('C2.3', 'NOT_DETECTED', 'HIGH',
      has_orchestrator
        ? `Orchestrator managing ${agent_count} agents — within safe threshold`
        : 'No orchestrator present'))
  } else if (agent_count > 6) {
    findings.push(makeFinding('C2.3', 'DETECTED', 'HIGH',
      `Orchestrator managing ${agent_count} agents — context pressure likely above 4-agent threshold`))
  } else if (agent_count > 4) {
    findings.push(makeFinding('C2.3', 'LIKELY', 'MEDIUM',
      `Orchestrator managing ${agent_count} agents — context pressure likely above 4-agent threshold`))
  } else {
    findings.push(makeFinding('C2.3', 'POSSIBLE', 'LOW',
      `Orchestrator managing ${agent_count} agents — context pressure likely above 4-agent threshold`))
  }

  // C2.4 Silent Tool Non-Invocation
  if (!has_tool_calling) {
    findings.push(makeFinding('C2.4', 'NOT_DETECTED', 'HIGH',
      'No tool-calling agents — silent non-invocation risk does not apply'))
  } else if (!has_assurance_layer) {
    findings.push(makeFinding('C2.4', 'DETECTED', 'HIGH',
      'Tool-calling agents with no execution trace verification'))
  } else {
    findings.push(makeFinding('C2.4', 'LIKELY', 'MEDIUM',
      'Tool-calling agents present — assurance layer helps but execution trace not guaranteed'))
  }

  // C3.1 Context Overflow Truncation
  if (agent_count <= 2 && !has_loops) {
    findings.push(makeFinding('C3.1', 'NOT_DETECTED', 'HIGH',
      'Small agent count with no loops — context overflow risk minimal'))
  } else if (agent_count >= 5 && has_loops) {
    findings.push(makeFinding('C3.1', 'DETECTED', 'HIGH',
      `Long agent chains accumulate context — early constraints risk truncation`))
  } else if (agent_count >= 5 || (has_loops && agent_count >= 3)) {
    findings.push(makeFinding('C3.1', 'LIKELY', 'MEDIUM',
      'Long agent chains accumulate context — early constraints risk truncation'))
  } else {
    findings.push(makeFinding('C3.1', 'POSSIBLE', 'LOW',
      'Long agent chains accumulate context — early constraints risk truncation'))
  }

  // C3.2 User Config Ignored
  if (has_orchestrator && parse_confidence >= 0.8) {
    findings.push(makeFinding('C3.2', 'NOT_DETECTED', 'HIGH',
      'Orchestrator present with high-confidence topology — config propagation likely explicit'))
  } else if (parse_confidence < 0.5) {
    findings.push(makeFinding('C3.2', 'DETECTED', 'LOW',
      'No explicit config propagation mechanism detected'))
  } else if (parse_confidence < 0.8) {
    findings.push(makeFinding('C3.2', 'POSSIBLE', 'LOW',
      'No explicit config propagation mechanism detected'))
  } else {
    findings.push(makeFinding('C3.2', 'POSSIBLE', 'LOW',
      'No explicit config propagation mechanism detected'))
  }

  // C4.2 Assurance Layer Absence
  if (!has_assurance_layer) {
    findings.push(makeFinding('C4.2', 'DETECTED', 'HIGH',
      'No evaluator or critic agent found in topology'))
  } else {
    findings.push(makeFinding('C4.2', 'NOT_DETECTED', 'HIGH',
      'Evaluator or critic agent present'))
  }

  // C5.1 Infinite Coordination Loop
  if (!has_loops) {
    findings.push(makeFinding('C5.1', 'NOT_DETECTED', 'HIGH',
      'No loops detected in topology'))
  } else {
    const hasUnboundedNoTermination = loops.some(
      l => l.max_iterations === null && !l.has_termination_condition
    )
    const hasUnbounded = loops.some(l => l.max_iterations === null)
    if (hasUnboundedNoTermination) {
      findings.push(makeFinding('C5.1', 'DETECTED', 'HIGH',
        'Loop with no maximum iteration limit and no termination condition'))
    } else if (hasUnbounded) {
      findings.push(makeFinding('C5.1', 'LIKELY', 'MEDIUM',
        'Loop with no maximum iteration limit — relies on termination condition only'))
    } else {
      findings.push(makeFinding('C5.1', 'POSSIBLE', 'LOW',
        'Loops present with finite iterations — convergence risk low'))
    }
  }

  // C5.2 Premature Convergence
  if (has_assurance_layer) {
    findings.push(makeFinding('C5.2', 'NOT_DETECTED', 'HIGH',
      'Assurance layer present to catch incomplete outputs before convergence'))
  } else if (!has_loops && agent_count >= 5) {
    findings.push(makeFinding('C5.2', 'DETECTED', 'HIGH',
      'No feedback mechanism — agents cannot catch and correct incomplete outputs'))
  } else if (agent_count >= 3) {
    findings.push(makeFinding('C5.2', 'LIKELY', 'MEDIUM',
      'No feedback mechanism — agents cannot catch and correct incomplete outputs'))
  } else {
    findings.push(makeFinding('C5.2', 'LIKELY', 'LOW',
      'No feedback mechanism — agents cannot catch and correct incomplete outputs'))
  }

  return findings
}

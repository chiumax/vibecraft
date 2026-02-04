/**
 * PlannerAgent - AI-powered goal decomposition using Claude Code
 *
 * Uses a Claude Code session to break down high-level goals into structured todos.
 * This avoids needing a separate Anthropic API key - it uses the same Claude Code
 * that the user is already running.
 */

import type { PlanRequest, PlanResult, PlanTask } from '../shared/types.js'

/** Prompt template for plan generation */
const PLANNER_PROMPT_TEMPLATE = `You are a task planning assistant. Your job is to break down the following goal into concrete, actionable tasks.

## Goal
{goal}
{contextSection}

## Instructions
1. Analyze what needs to be done
2. Break it down into small, focused tasks (3-10 tasks typically)
3. Each task should be completable in a single prompt to Claude Code
4. Tasks should be specific enough that an AI assistant can execute them
5. Include file paths and specific changes when possible
6. Put research/discovery tasks first, implementation second, testing last
7. Use imperative voice ("Add", "Create", "Update", "Fix")

## Output Format
Respond with ONLY a JSON object in this exact format (no other text):
\`\`\`json
{
  "summary": "Brief 1-2 sentence summary of the plan",
  "todos": [
    {
      "text": "Task description",
      "description": "Optional longer description with details"
    }
  ]
}
\`\`\`

Generate the task plan now.`

/**
 * Build the planner prompt
 */
function buildPlannerPrompt(request: PlanRequest): string {
  const contextSection = request.projectContext
    ? `\n## Project Context\n${request.projectContext}`
    : ''

  return PLANNER_PROMPT_TEMPLATE
    .replace('{goal}', request.goal)
    .replace('{contextSection}', contextSection)
}

/**
 * Parse plan result from Claude's response
 */
export function parsePlanResponse(response: string): PlanResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  // Find JSON object in the text
  const startIdx = jsonStr.indexOf('{')
  const endIdx = jsonStr.lastIndexOf('}')
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No JSON object found in response')
  }

  const cleanJson = jsonStr.slice(startIdx, endIdx + 1)
  const result = JSON.parse(cleanJson) as PlanResult

  // Validate structure
  if (!result.summary || !Array.isArray(result.todos)) {
    throw new Error('Invalid plan structure: missing summary or todos')
  }

  // Normalize todos
  result.todos = result.todos.map((todo, index) => ({
    text: todo.text || `Task ${index + 1}`,
    description: todo.description,
    dependencies: undefined, // Dependencies removed for simplicity with Claude Code
  }))

  return result
}

/**
 * PlannerAgent - generates plans using Claude Code sessions
 *
 * Instead of calling the Anthropic API directly, this sends a planning prompt
 * to a Claude Code session and parses the response.
 */
export class PlannerAgent {
  /**
   * Check if the planner is available
   * Always available since it uses Claude Code sessions
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Build a prompt for generating a plan
   * This prompt will be sent to a Claude Code session
   */
  buildPrompt(request: PlanRequest): string {
    return buildPlannerPrompt(request)
  }

  /**
   * Parse a plan from Claude's response text
   */
  parseResponse(response: string): PlanResult {
    return parsePlanResponse(response)
  }

  /**
   * Validate dependencies in a plan (no cycles, valid indices)
   */
  validateDependencies(todos: PlanTask[]): boolean {
    const visited = new Set<number>()
    const recursionStack = new Set<number>()

    function hasCycle(index: number): boolean {
      if (recursionStack.has(index)) return true
      if (visited.has(index)) return false

      visited.add(index)
      recursionStack.add(index)

      const deps = todos[index].dependencies ?? []
      for (const dep of deps) {
        if (dep < 0 || dep >= todos.length) return true // Invalid index
        if (hasCycle(dep)) return true
      }

      recursionStack.delete(index)
      return false
    }

    for (let i = 0; i < todos.length; i++) {
      if (hasCycle(i)) return false
    }

    return true
  }

  /**
   * Get topological order for execution (respecting dependencies)
   */
  getExecutionOrder(todos: PlanTask[]): number[] {
    const order: number[] = []
    const visited = new Set<number>()

    function visit(index: number): void {
      if (visited.has(index)) return
      visited.add(index)

      const deps = todos[index].dependencies ?? []
      for (const dep of deps) {
        visit(dep)
      }

      order.push(index)
    }

    for (let i = 0; i < todos.length; i++) {
      visit(i)
    }

    return order
  }
}

/**
 * Singleton instance
 */
export const plannerAgent = new PlannerAgent()

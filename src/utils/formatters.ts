/**
 * Formatting utilities for display
 */

/**
 * Format token count with human-readable suffixes
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tok`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k tok`
  }
  return `${tokens} tok`
}

/**
 * Format timestamp as relative time
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Simple markdown to HTML for responses
 */
export function renderMarkdown(text: string): string {
  let html = escapeHtml(text)

  // Code blocks (```...```) - wrap in container with copy button
  let codeBlockId = 0
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const id = `code-block-${Date.now()}-${codeBlockId++}`
    return `<div class="code-block-wrapper"><button class="code-copy-btn" data-code-id="${id}" title="Copy to clipboard">📋</button><pre><code id="${id}">${code}</code></pre></div>`
  })

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold (**...** or __...__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Italic (*... or _...)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Headers (## ...)
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  // Bullet lists (- ... or * ...)
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Line breaks
  html = html.replace(/\n/g, '<br>')

  // Clean up extra breaks in code blocks
  html = html.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
    // Preserve the id attribute from the original match
    const idMatch = match.match(/id="([^"]+)"/)
    const id = idMatch ? ` id="${idMatch[1]}"` : ''
    return `<pre><code${id}>` + code.replace(/<br>/g, '\n') + '</code></pre>'
  })

  return html
}

/**
 * Set up copy button click handlers for code blocks
 * Call this after inserting rendered markdown into the DOM
 */
export function setupCodeCopyButtons(container: HTMLElement): void {
  container.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const button = e.currentTarget as HTMLButtonElement
      const codeId = button.dataset.codeId
      if (!codeId) return

      const codeEl = document.getElementById(codeId)
      if (!codeEl) return

      const code = codeEl.textContent || ''
      try {
        await navigator.clipboard.writeText(code)
        button.textContent = '✅'
        button.title = 'Copied!'
        setTimeout(() => {
          button.textContent = '📋'
          button.title = 'Copy to clipboard'
        }, 2000)
      } catch (err) {
        button.textContent = '❌'
        setTimeout(() => {
          button.textContent = '📋'
        }, 2000)
      }
    })
  })
}

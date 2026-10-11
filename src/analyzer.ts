import type { ChangedFile, ReviewItem, ReviewReport } from './types'

const issuePattern = /(?:^|\s)(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi

function stableId(text: string) {
  let hash = 2166136261
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}

function checklist(files: ChangedFile[], body = '', ci: ReviewReport['ci'] = [], issues: ReviewReport['issues'] = []) {
  const items: ReviewItem[] = []
  const add = (severity: ReviewItem['severity'], title: string, detail: string, source?: string, sourceLabel?: string) => {
    items.push({ id: stableId(`${severity}:${title}:${source ?? ''}`), severity, title, detail, source, sourceLabel, state: 'todo' })
  }
  add('evidence', `${files.length} changed file${files.length === 1 ? '' : 's'} in this change`, 'Start with the file list and compare each change with the PR’s stated purpose.')
  const paths = files.map((file) => file.path)
  const hasTests = paths.some((path) => /(^|\/)(test|tests|__tests__|spec)(\/|\.)|\.(test|spec)\./i.test(path))
  if (hasTests) {
    const testFile = files.find((file) => /(^|\/)(test|tests|__tests__|spec)(\/|\.)|\.(test|spec)\./i.test(file.path))!
    add('evidence', 'Test-related files changed', 'A test/spec path is part of the diff. Check whether it covers the behavior being changed.', testFile.url, testFile.path)
  } else {
    add('unknown', 'No test file is obvious from the changed paths', 'This is only a filename-based check. Tests may live elsewhere or be described in the PR.', undefined)
  }
  const configFile = files.find((file) => /(^|\/)(\.github\/|[^/]*(lock|config|\.ya?ml$|\.toml$|\.json$))/i.test(file.path))
  if (configFile) add('caution', 'Configuration or dependency-related file changed', 'Confirm the change is intentional and does not alter build, release, permissions, or dependency behavior unexpectedly.', configFile.url, configFile.path)
  const deleted = files.filter((file) => file.status === 'removed')
  if (deleted.length) add('caution', `${deleted.length} file${deleted.length === 1 ? '' : 's'} removed`, `Review what depends on ${deleted.slice(0, 3).map((file) => file.path).join(', ')} and whether removal is expected.`, deleted[0].url, deleted[0].path)
  const renamed = files.filter((file) => file.status === 'renamed')
  if (renamed.length) add('evidence', `${renamed.length} file${renamed.length === 1 ? '' : 's'} renamed`, 'Confirm references, imports, and links were updated for the new paths.', renamed[0].url, renamed[0].path)
  const securityFile = files.find((file) => /auth|permission|secret|token|security|crypto|workflow/i.test(file.path))
  if (securityFile) add('caution', 'Security-sensitive path changed', 'Inspect access control, secret handling, workflow permissions, and boundary checks closely.', securityFile.url, securityFile.path)
  if (ci.length === 0) add('unknown', 'No CI/check evidence was available', 'Checks may be missing, still running, or not accessible through the public API.')
  else ci.forEach((check) => add(check.state === 'success' ? 'evidence' : check.state === 'failure' ? 'caution' : 'unknown', check.label, `Latest reported status: ${check.state}. A green check is useful evidence, but does not prove the change is correct.`, check.url, 'Open check details'))
  if (issues.length) issues.forEach((issue) => add('evidence', `Linked issue: ${issue.title}`, `Issue is currently ${issue.state}. Compare its acceptance criteria with this diff.`, issue.url, 'Open issue'))
  else {
    const match = issuePattern.exec(body)
    issuePattern.lastIndex = 0
    if (!match) add('unknown', 'No closing issue reference found in the PR description', 'The change may still relate to an issue; check the project context if needed.')
  }
  const patchText = files.map((file) => file.patch ?? '').join('\n')
  if (/TODO|FIXME|HACK/.test(patchText)) add('caution', 'TODO/FIXME marker appears in the diff', 'Check whether this is deliberate follow-up work or an unfinished change.')
  if (/\.github\/workflows\//i.test(paths.join('\n'))) add('caution', 'GitHub Actions workflow changed', 'Review workflow permissions, triggers, and any use of untrusted event data.')
  return items
}

export function createGitHubReport(data: {
  repo: string; number: number; title: string; body: string; url: string; baseBranch: string; headBranch: string; sha: string;
  files: ChangedFile[]; ci: ReviewReport['ci']; issues: ReviewReport['issues']; notices: string[]
}): ReviewReport {
  const stats = data.files.reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), { additions: 0, deletions: 0 })
  return { ...data, id: `github:${data.repo}#${data.number}`, sourceType: 'github', createdAt: new Date().toISOString(), items: checklist(data.files, data.body, data.ci, data.issues), stats }
}

export function parsePatch(text: string, filename: string): ReviewReport {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) throw new Error('The patch file is empty.')
  const chunks = normalized.split(/(?=^diff --git )/m).filter((chunk) => chunk.trim())
  if (!chunks.some((chunk) => /^diff --git /m.test(chunk) || /^--- /m.test(chunk))) throw new Error('This file does not look like a unified diff or Git patch.')
  const files: ChangedFile[] = chunks.map((chunk, index) => {
    const gitHeader = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    const newName = chunk.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1]
    const oldName = chunk.match(/^--- (?:a\/)?(.+)$/m)?.[1]
    const deleted = newName === '/dev/null'
    const added = oldName === '/dev/null'
    const path = deleted ? (oldName?.replace(/^a\//, '') ?? `file-${index + 1}`) : (newName?.replace(/^b\//, '') ?? gitHeader?.[2] ?? `file-${index + 1}`)
    const hunks = [...chunk.matchAll(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/gm)]
    let additions = 0; let deletions = 0
    if (hunks.length) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file mode') || line.startsWith('deleted file mode') || line.startsWith('similarity index') || line.startsWith('rename from') || line.startsWith('rename to') || line.startsWith('@@')) continue
        if (line.startsWith('+')) additions++
        if (line.startsWith('-')) deletions++
      }
    }
    const status = deleted ? 'removed' : added ? 'added' : /^rename from /m.test(chunk) ? 'renamed' : 'modified'
    return { path, status, additions, deletions, patch: chunk }
  })
  const stats = files.reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), { additions: 0, deletions: 0 })
  const title = filename.replace(/\.(diff|patch)$/i, '') || 'Imported patch'
  return {
    id: `patch:${stableId(normalized)}`, sourceType: 'patch', createdAt: new Date().toISOString(), title,
    files, ci: [], issues: [], notices: ['Local patch mode never sends this file over the network.', 'Patch contents can omit context or be truncated; confirm against the full repository before approving.'],
    stats, items: checklist(files),
  }
}

export function exportMarkdown(report: ReviewReport, states: Record<string, ReviewItem['state']>) {
  const lines = [`# PR review: ${report.title}`, '', `Source: ${report.url ?? `local patch (${report.title})`}`, `Files: ${report.files.length} · +${report.stats.additions} −${report.stats.deletions}`, '', '## Review checklist', '']
  for (const item of report.items) {
    const state = states[item.id] ?? item.state
    const mark = state === 'checked' ? 'x' : state === 'na' ? '-' : state === 'follow-up' ? '~' : ' '
    const stateLabel = state === 'follow-up' ? ' **(follow up)**' : ''
    const evidence = item.source ? ` ([${item.sourceLabel ?? 'evidence'}](${item.source}))` : item.sourceLabel ? ` (${item.sourceLabel})` : ''
    lines.push(`- [${mark}] **${item.title}**${stateLabel} — ${item.detail}${evidence}`)
  }
  lines.push('', '## PR description', '', report.body?.trim() || '_No description provided._', '', '## CI and checks', '')
  lines.push(...(report.ci.length ? report.ci.map((check) => `- ${check.label}: **${check.state}**${check.url ? ` ([details](${check.url}))` : ''}`) : ['- Unknown; no check evidence was available.']))
  if (report.issues.length) lines.push('', '## Linked issues', '', ...report.issues.map((issue) => `- [${issue.title}](${issue.url}) — ${issue.state}`))
  if (report.notices.length) lines.push('', '## Data notes', '', ...report.notices.map((notice) => `- ${notice}`))
  lines.push('', '## Changed files', '', ...report.files.map((file) => `- ${file.status}: \`${file.path}\` (+${file.additions} / −${file.deletions})`), '', '> This report organizes evidence and questions. It does not certify correctness or recommend automatic approval.')
  return lines.join('\n')
}


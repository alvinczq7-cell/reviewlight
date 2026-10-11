import { describe, expect, it, vi } from 'vitest'
import { exportMarkdown, parsePatch } from './analyzer'

describe('parsePatch', () => {
  it('parses CRLF unified hunks, paths, status, and line totals', () => {
    const patch = [
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 80%',
      'rename from src/old.ts',
      'rename to src/new.ts',
      'index 123..456 100644',
      '--- a/src/old.ts',
      '+++ b/src/new.ts',
      '@@ -1,2 +1,3 @@',
      ' const keep = true',
      '-const oldValue = 1',
      '+const newValue = 2',
      '+const extra = 3',
      '',
    ].join('\r\n')
    const result = parsePatch(patch, 'change.patch')
    expect(result.files).toHaveLength(1)
    expect(result.files[0]).toMatchObject({ path: 'src/new.ts', status: 'renamed', additions: 2, deletions: 1 })
    expect(result.stats).toEqual({ additions: 2, deletions: 1 })
  })

  it('handles binary file patches without claiming line changes', () => {
    const result = parsePatch('diff --git a/assets/logo.png b/assets/logo.png\nindex 123..456 100644\nBinary files a/assets/logo.png and b/assets/logo.png differ\n', 'binary.diff')
    expect(result.files[0]).toMatchObject({ path: 'assets/logo.png', status: 'modified', additions: 0, deletions: 0 })
  })

  it('rejects empty and non-diff input', () => {
    expect(() => parsePatch('  \n', 'empty.diff')).toThrow(/empty/i)
    expect(() => parsePatch('just some text', 'not-a-diff.patch')).toThrow(/unified diff/i)
  })

  it('does not fetch the network while parsing a local patch', () => {
    const fetch = vi.fn(() => { throw new Error('local patch must not fetch') })
    vi.stubGlobal('fetch', fetch)
    expect(() => parsePatch('--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n', 'offline.diff')).not.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('exports review state and safe source links as Markdown', () => {
    const report = parsePatch('--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n', 'safe.diff')
    const item = report.items[0]
    const markdown = exportMarkdown(report, { [item.id]: 'follow-up' })
    expect(markdown).toContain('# PR review: safe')
    expect(markdown).toContain('## Changed files')
    expect(markdown).toContain('## PR description')
    expect(markdown).toContain('**(follow up)**')
  })
})

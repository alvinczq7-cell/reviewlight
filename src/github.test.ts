import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzePublicPr } from './github'

afterEach(() => vi.unstubAllGlobals())

function response(data: unknown, headers: Record<string, string> = {}, ok = true, status = 200) {
  return { ok, status, headers: new Headers(headers), json: async () => data } as Response
}

describe('analyzePublicPr', () => {
  it('collects PR files, issue references, check runs, and combined status', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.includes('/pulls/7/files?')) return response([{ filename: 'src/a.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1 @@', blob_url: 'https://github.com/o/r/blob/main/src/a.ts' }])
      if (url.endsWith('/pulls/7')) return response({ title: 'Update a', body: 'Fixes #4', head: { sha: 'abc123', ref: 'feature/a' }, base: { ref: 'main' } })
      if (url.endsWith('/check-runs?per_page=100')) return response({ check_runs: [{ name: 'Unit tests', status: 'completed', conclusion: 'success', html_url: 'https://github.com/o/r/actions/1' }] })
      if (url.endsWith('/commits/abc123/status')) return response({ state: 'success' })
      if (url.endsWith('/issues/4')) return response({ title: 'Bug 4', state: 'open', html_url: 'https://github.com/o/r/issues/4' })
      throw new Error(`Unexpected URL ${url}`)
    }))
    const report = await analyzePublicPr('https://github.com/o/r/pull/7')
    expect(report).toMatchObject({ repo: 'o/r', number: 7, title: 'Update a', stats: { additions: 2, deletions: 1 } })
    expect(report.issues).toEqual([{ title: 'Bug 4', state: 'open', url: 'https://github.com/o/r/issues/4' }])
    expect(report.ci.map((item) => item.state)).toContain('success')
    expect(calls).toHaveLength(5)
  })

  it('follows file pagination and reports when GitHub omitted patch text', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url)
      if (url.endsWith('/pulls/12')) return response({ title: 'Large diff', body: '', head: { sha: 'abc' }, base: { ref: 'main' } })
      if (url.includes('/pulls/12/files?')) {
        if (url.endsWith('page=1')) return response([{ filename: 'large.bin', status: 'modified', additions: 0, deletions: 0 }], { link: '<https://api.github.com/repos/o/r/pulls/12/files?per_page=100&page=2>; rel="next"' })
        return response([{ filename: 'src/b.ts', status: 'modified', additions: 1, deletions: 0, patch: undefined }])
      }
      if (url.endsWith('/check-runs?per_page=100')) return response({ check_runs: [] })
      if (url.endsWith('/commits/abc/status')) return response({ state: 'pending' })
      throw new Error(`Unexpected URL ${url}`)
    }))
    const report = await analyzePublicPr('https://github.com/o/r/pull/12')
    expect(report.files).toHaveLength(2)
    expect(urls.some((url) => url.endsWith('page=2'))).toBe(true)
    expect(report.notices.some((notice) => /did not include patch text/i.test(notice))).toBe(true)
    expect(report.ci.some((check) => check.state === 'pending')).toBe(true)
  })

  it('explains malformed, private, and rate-limited PR links', async () => {
    await expect(analyzePublicPr('https://example.com/o/r/pull/3')).rejects.toThrow(/github.com/i)
    vi.stubGlobal('fetch', vi.fn(async () => response({ message: 'Not Found' }, {}, false, 404)))
    await expect(analyzePublicPr('https://github.com/private/repo/pull/3')).rejects.toThrow(/private|404/i)
    vi.stubGlobal('fetch', vi.fn(async () => response({}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) }, false, 403)))
    await expect(analyzePublicPr('https://github.com/o/r/pull/3')).rejects.toThrow(/rate limit/i)
  })
})


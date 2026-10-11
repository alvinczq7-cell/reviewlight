import { createGitHubReport } from './analyzer'
import type { ChangedFile, ReviewReport } from './types'

const API = 'https://api.github.com'
const CACHE_PREFIX = 'reviewlight:github-cache:'
const CACHE_TTL = 5 * 60 * 1000

type Json = Record<string, any>

function readCache(url: string): unknown | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + url)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { at: number; data: unknown }
    if (Date.now() - parsed.at > CACHE_TTL) { sessionStorage.removeItem(CACHE_PREFIX + url); return undefined }
    return parsed.data
  } catch { return undefined }
}

function storeCache(url: string, data: unknown) {
  try { sessionStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ at: Date.now(), data })) } catch { /* storage can be full or disabled */ }
}

async function githubGet<T>(url: string): Promise<T> {
  const cached = readCache(url)
  if (cached !== undefined) return cached as T
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } })
  } catch {
    throw new Error('Could not reach the GitHub API. Check your network, VPN, or browser extension and try again.')
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error('GitHub returned 404. The repository or PR may be private, deleted, or the URL may be incorrect.')
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining')
      const reset = response.headers.get('x-ratelimit-reset')
      const resetText = reset ? ` Try again after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.` : ''
      throw new Error(`GitHub API rate limit or access restriction reached${remaining === '0' ? '' : '.'}${resetText}`)
    }
    const body = await response.json().catch(() => ({})) as Json
    throw new Error(body.message ? `GitHub API: ${body.message}` : `GitHub API request failed (${response.status}).`)
  }
  const data = await response.json() as T
  storeCache(url, data)
  return data
}

function nextUrl(link: string | null) {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/)
  return match?.[1]
}

async function allFiles(url: string, notices: string[]): Promise<ChangedFile[]> {
  const files: ChangedFile[] = []
  let pageUrl: string | undefined = `${url}?per_page=100&page=1`
  let page = 0
  while (pageUrl && page < 10) {
    page++
    const cached = readCache(pageUrl)
    if (cached) {
      const result = cached as Json[]
      files.push(...result.map(mapFile))
      const maybeNext = `${url}?per_page=100&page=${page + 1}`
      pageUrl = result.length === 100 ? maybeNext : undefined
      continue
    }
    const response = await fetch(pageUrl, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }).catch(() => undefined)
    if (!response) throw new Error('Could not reach the GitHub API while loading changed files.')
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new Error('GitHub API rate limit reached while loading changed files. Wait a little, then retry.')
      throw new Error(`Could not load changed files (HTTP ${response.status}).`)
    }
    const batch = await response.json() as Json[]
    storeCache(pageUrl, batch)
    files.push(...batch.map(mapFile))
    pageUrl = nextUrl(response.headers.get('link'))
  }
  if (pageUrl) notices.push('Only the first 1,000 changed files are included; GitHub limits this API endpoint to 3,000 files.')
  if (files.some((file) => !file.patch && file.status !== 'removed')) notices.push('GitHub did not include patch text for one or more files (large or binary files may be omitted). File counts remain available, but review the source on GitHub.')
  return files
}

function mapFile(file: Json): ChangedFile {
  return {
    path: file.filename, status: file.status, additions: file.additions ?? 0, deletions: file.deletions ?? 0,
    patch: file.patch, url: file.blob_url ?? file.contents_url,
  }
}

function parsePrUrl(input: string) {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new Error('Paste a complete GitHub pull request URL, such as https://github.com/owner/repo/pull/123.') }
  if (url.hostname.toLowerCase() !== 'github.com') throw new Error('Only github.com pull request links are supported.')
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/)
  if (!match) throw new Error('This link does not look like a GitHub pull request URL. Expected /owner/repository/pull/number.')
  return { owner: match[1], repoName: match[2].replace(/\.git$/i, ''), number: Number(match[3]), canonical: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}` }
}

export async function analyzePublicPr(input: string): Promise<ReviewReport> {
  const { owner, repoName, number, canonical } = parsePrUrl(input)
  const repo = `${owner}/${repoName}`
  const notices: string[] = ['Public PR metadata is fetched directly from api.github.com. No GitHub account or token is used.']
  const pr = await githubGet<Json>(`${API}/repos/${owner}/${repoName}/pulls/${number}`)
  const files = await allFiles(`${API}/repos/${owner}/${repoName}/pulls/${number}/files`, notices)
  const ci: ReviewReport['ci'] = []
  if (pr.head?.sha) {
    const [checks, status] = await Promise.allSettled([
      githubGet<Json>(`${API}/repos/${owner}/${repoName}/commits/${pr.head.sha}/check-runs?per_page=100`),
      githubGet<Json>(`${API}/repos/${owner}/${repoName}/commits/${pr.head.sha}/status`),
    ])
    if (checks.status === 'fulfilled') {
      for (const check of (checks.value.check_runs ?? []) as Json[]) {
        const state = check.conclusion === 'success' ? 'success' : check.status !== 'completed' ? 'pending' : check.conclusion === 'failure' || check.conclusion === 'timed_out' || check.conclusion === 'action_required' ? 'failure' : 'neutral'
        ci.push({ state, label: check.name ?? 'GitHub check', url: check.html_url })
      }
    } else notices.push('Check-run details were unavailable; this can happen for public API permission or rate-limit reasons.')
    if (status.status === 'fulfilled') {
      const state = status.value.state as string
      if (state !== 'pending' || !ci.length) ci.push({ state: state === 'success' ? 'success' : state === 'failure' || state === 'error' ? 'failure' : state === 'pending' ? 'pending' : 'neutral', label: 'Commit status', url: canonical })
    } else notices.push('Combined commit status was unavailable.')
  } else notices.push('The PR head commit was not available, so CI checks could not be looked up.')

  const issues: ReviewReport['issues'] = []
  const closingRefs = [...String(pr.body ?? '').matchAll(/(?:^|\s)(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gim)].map((match) => Number(match[1]))
  for (const issueNumber of [...new Set(closingRefs)].slice(0, 3)) {
    try {
      const issue = await githubGet<Json>(`${API}/repos/${owner}/${repoName}/issues/${issueNumber}`)
      issues.push({ title: issue.title, url: issue.html_url, state: issue.state })
    } catch { notices.push(`Referenced issue #${issueNumber} could not be read through the public API.`) }
  }
  if (!pr.body?.trim()) notices.push('The PR description is empty or unavailable, so intent may be unclear.')
  return createGitHubReport({
    repo, number, title: pr.title ?? `PR #${number}`, body: pr.body ?? '', url: canonical,
    baseBranch: pr.base?.ref ?? '', headBranch: pr.head?.ref ?? '', sha: pr.head?.sha ?? '', files, ci, issues, notices,
  })
}

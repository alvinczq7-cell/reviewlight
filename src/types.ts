export type ReviewState = 'todo' | 'checked' | 'follow-up' | 'na'
export type Severity = 'evidence' | 'caution' | 'unknown'

export interface ReviewItem {
  id: string
  severity: Severity
  title: string
  detail: string
  source?: string
  sourceLabel?: string
  state: ReviewState
}

export interface ChangedFile {
  path: string
  status: string
  additions: number
  deletions: number
  patch?: string
  url?: string
}

export interface ReviewReport {
  id: string
  sourceType: 'github' | 'patch'
  createdAt: string
  repo?: string
  number?: number
  title: string
  body?: string
  url?: string
  baseBranch?: string
  headBranch?: string
  commitSha?: string
  files: ChangedFile[]
  ci: { state: string; label: string; url?: string }[]
  issues: { title: string; url: string; state: string }[]
  items: ReviewItem[]
  notices: string[]
  stats: { additions: number; deletions: number }
}

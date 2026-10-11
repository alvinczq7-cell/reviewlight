import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, Check, CheckCheck,
  ChevronDown, CircleAlert, CircleHelp, ClipboardCheck, FileCode2, FileDiff, FileText,
  Github, Globe2, HardDrive, Info, Languages, Link2, LoaderCircle, LockKeyhole,
  RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { exportMarkdown, parsePatch } from './analyzer'
import { analyzePublicPr } from './github'
import type { ReviewItem, ReviewReport, ReviewState, Severity } from './types'
import './patch-viewer.css'

type Language = 'en' | 'zh'
type Filter = 'all' | 'todo' | 'checked'
const STORE_REPORT = 'reviewlight:report:v1'
const STORE_STATES = 'reviewlight:states:v1'

const copy = {
  en: {
    eyebrow: 'OPEN SOURCE · REVIEW WITH CONTEXT', title: 'Review the change,\nnot the noise.', subtitle: 'Turn a pull request into a clear, evidence-linked checklist before you approve it.',
    prLabel: 'PUBLIC GITHUB PULL REQUEST', placeholder: 'https://github.com/owner/repository/pull/123', review: 'Build review', loading: 'Gathering evidence', pasteHint: 'Read-only · No sign-in · Public PRs only', or: 'or review a local patch', choose: 'Choose .diff or .patch', localHint: 'Your patch stays in this browser. No network request is made.',
    demo: 'Explore a sample report', how: 'How it works', privacy: 'Privacy', intro: 'A calmer way to review a pull request', statFiles: 'changed files', statLines: 'lines changed', statChecks: 'checks found', checklist: 'Reviewer checklist', checks: 'Review points', remaining: 'left to look at', all: 'All', open: 'To review', completed: 'Reviewed', noReport: 'No review open', noReportHint: 'Paste a public PR link or open a local .diff / .patch file to get started.',
    summary: 'Change summary', purpose: 'PR description', files: 'Changed files', ci: 'CI & checks', issues: 'Linked issues', evidence: 'Evidence found', caution: 'Worth a closer look', unknown: 'Not confirmed',
    todo: 'To review', checked: 'Checked', followUp: 'Follow up', na: 'Not applicable', markChecked: 'Mark checked', markFollow: 'Flag for follow-up', markNa: 'Mark not applicable', source: 'View source', sourceUnavailable: 'No direct source link', exportMd: 'Export Markdown', exportJson: 'Export JSON', clear: 'Clear local review', clearConfirm: 'Clear this report and review marks from this browser?',
    publicNotice: 'This report is a reading aid, not a correctness verdict. Review the code and project context yourself.', localNotice: 'Local patch mode never sends the patch anywhere. It may not include the full repository context.', noBody: 'No PR description was provided.', noFiles: 'No changed-file details were returned.', apiLimit: 'GitHub’s unauthenticated API has a shared per-IP request limit. If requests are limited, wait and retry; this app never asks for a token.',
    sourceGithub: 'GitHub PR', sourcePatch: 'Local patch', tabReview: 'Review', tabGuide: 'How it works', guideTitle: 'Evidence first. Your judgment stays yours.', guideIntro: 'Reviewlight gathers what GitHub exposes and turns obvious review signals into a checklist. It does not run the changed code or use AI to guess whether it is correct.',
    guideOne: 'Add a public PR link or import a .diff / .patch file.', guideTwo: 'Scan the summary, changed paths, available checks, and linked issue references.', guideThree: 'Mark each point as checked, follow-up, or not applicable, then export your notes.', guidePrivacy: 'Privacy by default', guidePrivacyText: 'No account, OAuth, backend, analytics, or cloud AI. Public PR mode makes read-only requests to GitHub’s public API. Local patches are analyzed in your browser and are not uploaded.', guideLimits: 'What it cannot tell you', guideLimitsText: 'A passing check does not prove correctness. Missing checks, issue links, or patch text are shown as unknown. Heuristics are filename and text signals, not a substitute for reading code.', close: 'Close', history: 'Your review is saved in this browser only.', allStates: 'Review status', loadingTitle: 'Collecting public evidence', loadingSubtitle: 'Fetching PR details, changed files, and available checks from GitHub.', tryAgain: 'Try again', invalidFile: 'Choose a .diff or .patch file.', titleDemo: 'Make the PR review faster to understand',
  },
  zh: {
    eyebrow: '开源 · 带着上下文审阅', title: '看懂代码改动，\n少一些信息噪音。', subtitle: '在批准 PR 前，把改动整理成带证据链接的检查清单。',
    prLabel: '公开的 GITHUB PULL REQUEST', placeholder: 'https://github.com/owner/repository/pull/123', review: '生成审阅清单', loading: '正在收集证据', pasteHint: '只读 · 无需登录 · 仅公开 PR', or: '或审阅本地补丁', choose: '选择 .diff 或 .patch', localHint: '补丁只在此浏览器处理，不会发起网络请求。',
    demo: '打开示例报告', how: '工作方式', privacy: '隐私', intro: '让 PR 审阅更清楚一些', statFiles: '个文件变更', statLines: '行改动', statChecks: '项检查', checklist: 'Reviewer 检查清单', checks: '审阅要点', remaining: '项待处理', all: '全部', open: '待审阅', completed: '已检查', noReport: '还没有打开审阅报告', noReportHint: '粘贴公开 PR 链接，或打开本地 .diff / .patch 文件开始。',
    summary: '改动概览', purpose: 'PR 描述', files: '变更文件', ci: 'CI 与检查', issues: '关联 Issue', evidence: '找到的证据', caution: '建议仔细核对', unknown: '尚无法确认',
    todo: '待审阅', checked: '已检查', followUp: '需跟进', na: '不适用', markChecked: '标记已检查', markFollow: '标记需跟进', markNa: '标记不适用', source: '查看来源', sourceUnavailable: '暂无直接来源链接', exportMd: '导出 Markdown', exportJson: '导出 JSON', clear: '清除此报告', clearConfirm: '从此浏览器清除此报告和审阅标记？',
    publicNotice: '这份报告只帮助整理信息，不代表代码正确。请结合代码和项目上下文自行判断。', localNotice: '本地补丁不会上传，但可能没有完整仓库上下文。', noBody: 'PR 没有提供描述。', noFiles: '没有返回变更文件详情。', apiLimit: 'GitHub 未登录公共 API 有共享 IP 请求限额。若请求受限，请稍后重试；本应用不会索要访问令牌。',
    sourceGithub: 'GitHub PR', sourcePatch: '本地补丁', tabReview: '审阅', tabGuide: '工作方式', guideTitle: '先看证据，判断权仍在你手里。', guideIntro: 'Reviewlight 汇总 GitHub 公开信息，并把明显的审阅信号整理成清单。它不会运行改动后的代码，也不会用 AI 猜测代码是否正确。',
    guideOne: '粘贴公开 PR 链接，或导入 .diff / .patch 文件。', guideTwo: '查看改动概览、文件路径、可见的检查结果和关联 Issue。', guideThree: '逐项标记已检查、需跟进或不适用，然后导出笔记。', guidePrivacy: '默认保护隐私', guidePrivacyText: '无需账号、OAuth、后端、分析追踪或云端 AI。公开 PR 模式只读 GitHub 公共 API；本地补丁在浏览器内分析，不会上传。', guideLimits: '它不能替你判断什么', guideLimitsText: '检查通过不等于代码正确。缺少检查、Issue 或补丁内容时会明确标成未知。启发式提示仅根据文件名和文本，不能替代阅读代码。', close: '关闭', history: '审阅记录只保存在此浏览器。', allStates: '审阅状态', loadingTitle: '正在收集公开证据', loadingSubtitle: '从 GitHub 获取 PR 信息、变更文件和可见检查结果。', tryAgain: '重试', invalidFile: '请选择 .diff 或 .patch 文件。', titleDemo: '更快弄清一份 PR 改了什么',
  },
} as const

function readStored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}

function demoReport(): ReviewReport {
  const now = new Date().toISOString()
  const files = [
    { path: 'src/auth/session.ts', status: 'modified', additions: 24, deletions: 8, url: 'https://github.com/example/api/blob/main/src/auth/session.ts', patch: '+ export async function refreshSession() {\n+   return tokenStore.rotate()\n+ }' },
    { path: 'src/auth/session.test.ts', status: 'added', additions: 18, deletions: 0, url: 'https://github.com/example/api/blob/main/src/auth/session.test.ts', patch: '+ it("refreshes an expired session", async () => {})' },
    { path: '.github/workflows/ci.yml', status: 'modified', additions: 4, deletions: 2, url: 'https://github.com/example/api/blob/main/.github/workflows/ci.yml', patch: '+ permissions:\n+   contents: read' },
  ]
  const items: ReviewItem[] = [
    { id: 'd1', severity: 'evidence', title: '3 changed files in this change', detail: 'Start with the file list and compare each change with the PR’s stated purpose.', state: 'todo' },
    { id: 'd2', severity: 'evidence', title: 'Test-related files changed', detail: 'A test/spec path is part of the diff. Check whether it covers the behavior being changed.', source: files[1].url, sourceLabel: files[1].path, state: 'todo' },
    { id: 'd3', severity: 'caution', title: 'Security-sensitive path changed', detail: 'Inspect access control, secret handling, workflow permissions, and boundary checks closely.', source: files[0].url, sourceLabel: files[0].path, state: 'todo' },
    { id: 'd4', severity: 'caution', title: 'GitHub Actions workflow changed', detail: 'Review workflow permissions, triggers, and any use of untrusted event data.', source: files[2].url, sourceLabel: files[2].path, state: 'todo' },
    { id: 'd5', severity: 'evidence', title: 'Unit tests · success', detail: 'Latest reported status: success. A green check is useful evidence, but does not prove the change is correct.', source: 'https://github.com/example/api/actions', sourceLabel: 'Open check details', state: 'todo' },
    { id: 'd6', severity: 'unknown', title: 'No closing issue reference found in the PR description', detail: 'The change may still relate to an issue; check the project context if needed.', state: 'todo' },
  ]
  return { id: 'demo:session-refresh', sourceType: 'github', createdAt: now, repo: 'acme/api', number: 284, title: 'Rotate refresh tokens after session expiry', body: '## What\nRefresh expired sessions with a rotated token.\n\n## Why\nShorten exposure if a refresh token leaks.\n\n## Testing\n- Added coverage for expired sessions\n- CI passes', url: 'https://github.com/example/api/pull/284', baseBranch: 'main', headBranch: 'feature/session-rotation', commitSha: 'a8ef2d1', files, ci: [{ state: 'success', label: 'Unit tests', url: 'https://github.com/example/api/actions' }, { state: 'pending', label: 'CodeQL', url: 'https://github.com/example/api/actions' }], issues: [], items, notices: [], stats: { additions: 46, deletions: 10 } }
}

function severityIcon(severity: Severity) {
  if (severity === 'evidence') return <BadgeCheck size={17} />
  if (severity === 'caution') return <CircleAlert size={17} />
  return <CircleHelp size={17} />
}

function App() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('reviewlight:language') === 'zh' ? 'zh' : 'en')
  const t = copy[language]
  const [report, setReport] = useState<ReviewReport | null>(() => readStored(STORE_REPORT, null))
  const [states, setStates] = useState<Record<string, ReviewState>>(() => readStored(STORE_STATES, {}))
  const [prUrl, setPrUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'review' | 'guide'>('review')
  const [filter, setFilter] = useState<Filter>('all')
  const [fileName, setFileName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => { if (report) localStorage.setItem(STORE_REPORT, JSON.stringify(report)); else localStorage.removeItem(STORE_REPORT) }, [report])
  useEffect(() => { localStorage.setItem(STORE_STATES, JSON.stringify(states)) }, [states])
  useEffect(() => { localStorage.setItem('reviewlight:language', language) }, [language])

  const countByState = useMemo(() => {
    const items = report?.items ?? []
    return { todo: items.filter((item) => (states[item.id] ?? item.state) === 'todo').length, checked: items.filter((item) => (states[item.id] ?? item.state) === 'checked').length }
  }, [report, states])
  const visibleItems = useMemo(() => (report?.items ?? []).filter((item) => filter === 'all' || (filter === 'todo' ? (states[item.id] ?? item.state) !== 'checked' && (states[item.id] ?? item.state) !== 'na' : (states[item.id] ?? item.state) === 'checked')), [report, filter, states])

  const startReview = async () => {
    setLoading(true); setError(''); setActiveTab('review'); setFilter('all')
    try {
      const next = await analyzePublicPr(prUrl)
      setReport(next); setStates(Object.fromEntries(next.items.map((item) => [item.id, 'todo' as const]))); setFileName('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not build the review report.') }
    finally { setLoading(false) }
  }

  const onFile = async (file?: File) => {
    if (!file) return
    if (!/\.(diff|patch)$/i.test(file.name)) { setError(t.invalidFile); return }
    setError('')
    try {
      const parsed = parsePatch(await file.text(), file.name)
      parsed.files = parsed.files.map((item) => ({ ...item, url: undefined }))
      setReport(parsed); setStates(Object.fromEntries(parsed.items.map((item) => [item.id, 'todo' as const])))
      setFileName(file.name); setActiveTab('review'); setFilter('all')
    } catch (err) { setError(err instanceof Error ? err.message : t.invalidFile) }
    if (fileInput.current) fileInput.current.value = ''
  }

  const setItemState = (item: ReviewItem, next: ReviewState) => setStates((previous) => ({ ...previous, [item.id]: next }))
  const clearReport = () => {
    if (!window.confirm(t.clearConfirm)) return
    setReport(null); setStates({}); setFileName(''); setPrUrl(''); setError(''); setActiveTab('review')
  }
  const download = (kind: 'md' | 'json') => {
    if (!report) return
    const content = kind === 'md' ? exportMarkdown(report, states) : JSON.stringify({ ...report, items: report.items.map((item) => ({ ...item, state: states[item.id] ?? item.state })) }, null, 2)
    const blob = new Blob([content], { type: kind === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reviewlight-${report.repo?.replace('/', '-') ?? report.title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}${report.number ? `-pr-${report.number}` : ''}.${kind === 'md' ? 'md' : 'json'}`; a.click(); URL.revokeObjectURL(a.href)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActiveTab('review') }}>
        <div className="brand-icon"><ClipboardCheck size={21} strokeWidth={2.2} /></div>
        <span>reviewlight<span className="brand-dot">.</span></span>
      </a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        <button className={`nav-item ${activeTab === 'review' ? 'selected' : ''}`} onClick={() => setActiveTab('review')}><FileDiff size={17} />{t.tabReview}<span className="nav-arrow">⌘1</span></button>
        <button className={`nav-item ${activeTab === 'guide' ? 'selected' : ''}`} onClick={() => setActiveTab('guide')}><BookOpen size={17} />{t.tabGuide}</button>
      </nav>
      <div className="sidebar-spacer" />
      <div className="privacy-card"><div className="privacy-icon"><LockKeyhole size={15} /></div><div><strong>{t.privacy}</strong><p>{language === 'en' ? 'Your review stays on this device.' : '审阅记录只留在你的设备上。'}</p></div></div>
      <div className="sidebar-bottom">
        <a href="https://github.com" target="_blank" rel="noreferrer"><Github size={16} /> GitHub <ArrowUpRight size={13} /></a>
        <button className="language-switch" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}><Languages size={15} />{language === 'en' ? '简体中文' : 'English'}</button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Reviewlight</span><span className="crumb-divider">/</span><span className="crumb-current">{activeTab === 'review' ? t.tabReview : t.tabGuide}</span></div><div className="top-actions"><div className="read-only"><span className="status-dot" />{language === 'en' ? 'READ-ONLY MODE' : '只读模式'}</div><button className="help-button" onClick={() => setActiveTab('guide')}><Info size={16} /><span>{t.how}</span></button></div></header>
      {activeTab === 'guide' ? <section className="guide-page">
        <div className="guide-kicker"><ShieldCheck size={15} /> REVIEWLIGHT FIELD GUIDE</div>
        <h1>{t.guideTitle}</h1><p className="guide-intro">{t.guideIntro}</p>
        <div className="guide-steps"><div className="step-number">01</div><div><h3>{language === 'en' ? 'Bring the change' : '载入改动'}</h3><p>{t.guideOne}</p></div><div className="step-number">02</div><div><h3>{language === 'en' ? 'Read the evidence' : '查看证据'}</h3><p>{t.guideTwo}</p></div><div className="step-number">03</div><div><h3>{language === 'en' ? 'Keep your notes' : '记录你的判断'}</h3><p>{t.guideThree}</p></div></div>
        <div className="guide-cards"><article><div className="guide-card-icon green"><LockKeyhole size={18} /></div><h3>{t.guidePrivacy}</h3><p>{t.guidePrivacyText}</p></article><article><div className="guide-card-icon amber"><CircleHelp size={18} /></div><h3>{t.guideLimits}</h3><p>{t.guideLimitsText}</p></article></div>
        <button className="primary-button guide-back" onClick={() => setActiveTab('review')}>{t.tabReview}<ArrowRight size={16} /></button>
      </section> : <>
        <section className="welcome-band">
          <div className="welcome-copy"><div className="eyebrow"><span className="eyebrow-line" />{t.eyebrow}</div><h1>{language === 'en' ? <>Review the change,<br /><em>not the noise.</em></> : <>看懂代码改动，<br /><em>少一些信息噪音。</em></>}</h1><p>{t.subtitle}</p></div>
          <div className="welcome-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-center"><ClipboardCheck size={38} strokeWidth={1.4} /></div><div className="orbit-tag tag-top"><Check size={12} /> evidence</div><div className="orbit-tag tag-right"><FileCode2 size={12} /> diff</div><div className="orbit-tag tag-bottom"><ShieldCheck size={12} /> review</div></div>
        </section>
        <section className="input-card" aria-label="Start a PR review">
          <div className="input-label"><Github size={15} /><span>{t.prLabel}</span></div>
          <form className="url-row" onSubmit={(event) => { event.preventDefault(); void startReview() }}><input type="url" value={prUrl} onChange={(event) => setPrUrl(event.target.value)} placeholder={t.placeholder} aria-label={t.prLabel} disabled={loading} /><button className="primary-button" type="submit" disabled={loading || !prUrl.trim()}>{loading ? <><LoaderCircle size={16} className="spin" />{t.loading}</> : <>{t.review}<ArrowRight size={16} /></>}</button></form>
          <div className="input-foot"><span><Globe2 size={13} />{t.pasteHint}</span><button onClick={() => { setReport(demoReport()); setStates({}); setFileName(''); setError(''); setActiveTab('review'); setFilter('all') }}><Sparkles size={13} />{t.demo}</button></div>
          <div className="or-divider"><span>{t.or}</span></div>
          <div className="patch-row"><div className="patch-left"><div className="patch-icon"><FileDiff size={18} /></div><div><strong>{language === 'en' ? 'Local diff or patch' : '本地 diff / patch'}</strong><p>{t.localHint}</p></div></div><button className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={15} />{t.choose}</button><input ref={fileInput} type="file" accept=".diff,.patch,text/plain" className="visually-hidden" onChange={(event) => void onFile(event.target.files?.[0])} /></div>
          {error && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{error}</span><button aria-label={t.close} onClick={() => setError('')}><X size={15} /></button></div>}
        </section>

        {loading ? <div className="loading-panel"><div className="loading-icon"><LoaderCircle size={24} className="spin" /></div><h2>{t.loadingTitle}</h2><p>{t.loadingSubtitle}</p><div className="skeleton-line" /><div className="skeleton-line short" /></div> : report ? <>
          <section className="report-heading"><div><div className="report-source"><span className={`source-badge ${report.sourceType}`} >{report.sourceType === 'github' ? <Github size={12} /> : <HardDrive size={12} />}{report.sourceType === 'github' ? t.sourceGithub : t.sourcePatch}</span>{report.repo && <span className="repo-label">{report.repo} <b>#{report.number}</b></span>}{report.sourceType === 'patch' && fileName && <span className="repo-label">{fileName}</span>}</div><h2>{report.title}</h2><div className="branch-line">{report.headBranch ? <><code>{report.headBranch}</code><ArrowRight size={13} /><code>{report.baseBranch}</code><span className="branch-separator">·</span></> : null}<span>{new Date(report.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN')}</span></div></div><div className="report-tools"><button className="tool-button" onClick={() => download('md')}><ArrowDownToLine size={15} />{t.exportMd}</button><div className="more-menu"><details><summary aria-label="More report actions"><ChevronDown size={16} /></summary><div className="menu-popover"><button onClick={() => download('json')}><FileText size={14} />{t.exportJson}</button><button className="danger-action" onClick={clearReport}><Trash2 size={14} />{t.clear}</button></div></details></div></div></section>
          <section className="stats-grid"><div className="stat-card"><div className="stat-top"><span>{t.statFiles}</span><FileCode2 size={15} /></div><strong>{report.files.length}</strong><small>{language === 'en' ? 'across the diff' : '涉及此 diff'}</small></div><div className="stat-card"><div className="stat-top"><span>{t.statLines}</span><FileDiff size={15} /></div><strong><span className="add-color">+{report.stats.additions}</span><span className="stat-minus">−{report.stats.deletions}</span></strong><small>{language === 'en' ? 'additions & deletions' : '新增与删除'}</small></div><div className="stat-card"><div className="stat-top"><span>{t.statChecks}</span><CheckCheck size={15} /></div><strong>{report.ci.length}</strong><small>{language === 'en' ? 'visible to public API' : '公共 API 可见'}</small></div><div className="stat-card progress-stat"><div className="stat-top"><span>{t.allStates}</span><ClipboardCheck size={15} /></div><strong>{countByState.checked}<span className="stat-total"> / {report.items.length}</span></strong><small>{countByState.todo} {t.remaining}</small><div className="progress-track"><span style={{ width: `${report.items.length ? (countByState.checked / report.items.length) * 100 : 0}%` }} /></div></div></section>
          <div className="report-layout"><div className="main-column">
            <section className="content-card summary-card"><div className="section-title"><div className="title-icon blue"><FileText size={16} /></div><h3>{t.summary}</h3></div>{report.body ? <div className="pr-body">{report.body.split(/\r?\n/).map((line, index) => <span className={/^\s*#{1,6}\s/.test(line) ? 'body-heading' : /^\s*[-*]\s/.test(line) ? 'body-bullet' : ''} key={`${index}:${line}`}>{line.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*]\s/, '• ') || '\u00a0'}</span>)}</div> : <p className="muted-copy">{t.noBody}</p>}{report.url && <a className="source-link" href={report.url} target="_blank" rel="noreferrer"><Link2 size={13} />{language === 'en' ? 'Open pull request on GitHub' : '在 GitHub 打开 Pull Request'}<ArrowUpRight size={13} /></a>}</section>
            <section className="content-card files-card"><div className="section-title"><div className="title-icon violet"><FileCode2 size={16} /></div><h3>{t.files}</h3><span className="count-pill">{report.files.length}</span></div>{report.files.length ? <div className="file-list">{report.files.map((file) => { const patchLines = file.patch?.split('\n') ?? []; return <div className="file-entry" key={file.path}><div className="file-row"><div className="file-status">{file.status === 'added' ? <span className="file-added">A</span> : file.status === 'removed' ? <span className="file-removed">D</span> : file.status === 'renamed' ? <span className="file-renamed">R</span> : <span className="file-modified">M</span>}</div><div className="file-name"><span>{file.path}</span><small>{file.status}</small></div><div className="file-diff"><span>+{file.additions}</span><i /><span>−{file.deletions}</span></div>{file.url && <a className="file-link" href={file.url} target="_blank" rel="noreferrer" aria-label={`${t.source}: ${file.path}`}><ArrowUpRight size={14} /></a>}</div>{file.patch && <details className="patch-viewer"><summary>{language === 'en' ? `Inspect available patch · ${patchLines.length} lines` : `查看可用补丁 · ${patchLines.length} 行`}</summary><pre>{patchLines.slice(0, 400).map((line, index) => <span className={line.startsWith('+') ? 'patch-add' : line.startsWith('-') ? 'patch-delete' : line.startsWith('@@') ? 'patch-hunk' : ''} key={`${index}:${line}`}>{line || ' '}{'\n'}</span>)}{patchLines.length > 400 && <span className="patch-hunk">… {language === 'en' ? 'showing the first 400 lines' : '仅显示前 400 行'}</span>}</pre></details>}</div> })}</div> : <p className="muted-copy">{t.noFiles}</p>}</section>
          </div><aside className="side-column">
            <section className="content-card signal-card"><div className="section-title"><div className="title-icon green"><CheckCheck size={16} /></div><h3>{t.ci}</h3><span className="count-pill">{report.ci.length}</span></div>{report.ci.length ? <div className="signal-list">{report.ci.map((check, index) => <div className="signal-row" key={`${check.label}:${index}`}><span className={`ci-status ${check.state}`}><span /></span><div><strong>{check.label}</strong><small>{check.state}</small></div>{check.url && <a href={check.url} target="_blank" rel="noreferrer" aria-label={t.source}><ArrowUpRight size={13} /></a>}</div>)}</div> : <p className="muted-copy compact">{language === 'en' ? 'No CI status was visible. Treat this as unknown, not as a pass.' : '未发现 CI 状态。请视为未知，不代表检查通过。'}</p>}</section>
            <section className="content-card issue-card"><div className="section-title"><div className="title-icon amber"><CircleHelp size={16} /></div><h3>{t.issues}</h3><span className="count-pill">{report.issues.length}</span></div>{report.issues.length ? report.issues.map((issue) => <a className="issue-row" href={issue.url} target="_blank" rel="noreferrer" key={issue.url}><span className="issue-number">#{issue.url.split('/').pop()}</span><span>{issue.title}</span><ArrowUpRight size={13} /></a>) : <p className="muted-copy compact">{language === 'en' ? 'No closing issue reference was found in the description.' : '描述中未发现关闭 Issue 的引用。'}</p>}</section>
          </aside></div>

          <section className="checklist-section"><div className="checklist-header"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" /> BEFORE YOU APPROVE</div><h2>{t.checklist}</h2><p>{t.publicNotice}</p></div><div className="filter-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{t.all}<span>{report.items.length}</span></button><button className={filter === 'todo' ? 'active' : ''} onClick={() => setFilter('todo')}>{t.open}<span>{countByState.todo}</span></button><button className={filter === 'checked' ? 'active' : ''} onClick={() => setFilter('checked')}>{t.completed}<span>{countByState.checked}</span></button></div></div>
            <div className="checklist-list">{visibleItems.map((item) => { const state = states[item.id] ?? item.state; return <article className={`check-item ${state !== 'todo' ? 'is-done' : ''}`} key={item.id}><div className={`item-mark ${item.severity}`}>{severityIcon(item.severity)}</div><div className="check-content"><div className="check-title-row"><h3>{item.title}</h3><span className={`severity-tag ${item.severity}`}>{item.severity === 'evidence' ? t.evidence : item.severity === 'caution' ? t.caution : t.unknown}</span></div><p>{item.detail}</p>{item.source && <a className="item-source" href={item.source} target="_blank" rel="noreferrer"><Link2 size={12} />{item.sourceLabel ?? t.source}<ArrowUpRight size={12} /></a>}</div><div className="item-actions"><label className="visually-hidden" htmlFor={`state-${item.id}`}>{t.allStates}</label><select id={`state-${item.id}`} value={state} onChange={(event) => setItemState(item, event.target.value as ReviewState)}><option value="todo">{t.todo}</option><option value="checked">{t.checked}</option><option value="follow-up">{t.followUp}</option><option value="na">{t.na}</option></select><ChevronDown className="select-chevron" size={13} /></div></article> })}{visibleItems.length === 0 && <div className="empty-filter"><CheckCheck size={19} /><span>{language === 'en' ? 'Nothing here yet.' : '这里暂时没有内容。'}</span></div>}</div>
          </section>
          {report.notices.length > 0 && <section className="notice-card"><div className="notice-icon"><Info size={15} /></div><div><strong>{language === 'en' ? 'Data limits' : '数据说明'}</strong>{report.notices.map((notice, i) => <p key={i}>{notice}</p>)}</div></section>}
          <footer className="report-footer"><span><ShieldCheck size={14} />{report.sourceType === 'patch' ? t.localNotice : t.publicNotice}</span><button onClick={clearReport}><RotateCcw size={13} />{t.clear}</button></footer>
        </> : <section className="empty-state"><div className="empty-art"><div className="empty-art-paper"><span /><span /><span /><b><Check size={16} /></b></div><div className="empty-art-spark spark-a">✦</div><div className="empty-art-spark spark-b">✧</div></div><p className="eyebrow"><span className="eyebrow-line" />A LITTLE MORE CLARITY</p><h2>{t.titleDemo}</h2><p>{t.noReportHint}</p><button className="text-button" onClick={() => { setReport(demoReport()); setStates({}) }}><Sparkles size={14} />{t.demo}<ArrowRight size={14} /></button></section>}
      </>}
      <footer className="global-footer"><span>Reviewlight · <a href="https://opensource.org/license/mit" target="_blank" rel="noreferrer">MIT</a></span><span><span className="footer-dot" />{language === 'en' ? 'No approval automation' : '不提供自动批准'}</span></footer>
    </main>
  </div>
}

export default App


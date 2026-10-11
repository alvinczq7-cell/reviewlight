# Reviewlight

**An evidence-first checklist for reviewing GitHub pull requests.**

Reviewlight gathers the public information GitHub exposes about a pull request and organizes review signals into a checklist. It helps a human reviewer understand the change before approving it. It does not decide whether code is correct, execute code, comment on a PR, or approve/merge anything.

## What it does

- Read a public GitHub pull request: title and description, changed paths and available diffs, linked issues referenced with closing keywords, and visible CI/check status.
- Import a local `.diff` or `.patch` file. The file is parsed in your browser; patch mode does not make network requests.
- Organize evidence, cautions, and unknowns with source links when available.
- Mark review points as **To review**, **Checked**, **Follow up**, or **Not applicable**.
- Export the report as Markdown or JSON. The current report and review marks are stored in browser local storage and can be cleared.
- Switch between English and Simplified Chinese.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Build a static site with `npm run build`; preview it with `npm run preview`. Run the unit suite with `npm test`.

## Privacy and limits

- No account, OAuth, access token, server, telemetry, or cloud AI.
- Public PR mode makes read-only requests to `api.github.com`. Unauthenticated GitHub API limits are shared by originating IP, so busy networks may see rate-limit errors. Results are cached in the current tab for five minutes.
- Local patch mode reads the selected file in the browser and does not call the network. A patch may omit files or repository context.
- GitHub may omit patch text for binary or large files. When known, the app reports missing data instead of treating it as reviewed.
- Test-path, security-path, configuration, rename, and TODO signals are simple heuristics. They can miss risks and can produce irrelevant prompts.
- A passing CI check is evidence that a check reported success; it is not proof of correctness. No checks or issue references means **unknown**, not “passed” or “no issue exists.”
- PR descriptions and diffs are untrusted input. They are rendered as text; HTML/Markdown from the PR is not executed.
- Rate-limit responses are retried by the reviewer; the app does not rotate IPs or proxy around GitHub limits.

## Deploy to GitHub Pages

The included Actions workflow builds and deploys the static site on pushes to `main` and on manual dispatch. In repository settings, set **Pages → Build and deployment → Source → GitHub Actions**. The Vite build uses relative asset paths so it works under a repository subpath.

## License

MIT. See [LICENSE](./LICENSE).

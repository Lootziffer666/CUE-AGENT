# AI QA Agent

Automated QA pipeline that uses Playwright to capture full-page screenshots and browser console logs, then leverages Anthropic Claude 3.5 Sonnet (vision) to analyze the page for UI/UX bugs, visual issues, and technical errors. Results are saved as structured Markdown reports.

## Prerequisites

- Node.js 18+ (included in the devcontainer)
- Anthropic API Key ([get one here](https://console.anthropic.com/))

## Setup

### Option A: GitHub Codespace (recommended)

1. Open this repo in a GitHub Codespace - everything installs automatically via the devcontainer.
2. Copy `.env.example` to `.env` and add your Anthropic API key.

### Option B: Local Setup

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY
```

## Usage

```bash
# Analyze a specific URL
node qa-agent.js https://example.com

# Use the TARGET_URL from .env
node qa-agent.js

# Show help
node qa-agent.js --help
```

## Output

Reports are saved to `qa-reports/` and include:

- Full-page screenshot (PNG)
- Browser console errors/warnings
- LLM analysis with identified issues and recommendations

## Integrating Into Other Repos

You can add this agent to any of your repositories:

1. Copy the relevant files (`qa-agent.js`, `package.json`, `.env.example`, `.devcontainer/`) into your repo or keep it as a standalone tool.
2. Point it at your deployed app or local dev server URL.
3. Run it as part of your CI pipeline or manually during development.

## License

MIT

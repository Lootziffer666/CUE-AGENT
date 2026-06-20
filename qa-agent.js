#!/usr/bin/env node

/**
 * AI QA Agent
 *
 * Automated QA pipeline that uses Playwright to capture screenshots and console
 * logs, then sends them to Anthropic Claude 3.5 Sonnet (vision) for analysis.
 * Results are saved as Markdown reports in qa-reports/.
 *
 * Usage:
 *   node qa-agent.js <url>
 *   node qa-agent.js              (uses TARGET_URL from .env)
 *   node qa-agent.js --help
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const Anthropic = require("@anthropic-ai/sdk");

// Load environment variables from .env file
require("dotenv").config();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showHelp() {
  console.log(`
AI QA Agent - Automated visual QA using Playwright + Claude Vision

Usage:
  node qa-agent.js <url>        Analyze the given URL
  node qa-agent.js              Use TARGET_URL from .env
  node qa-agent.js --help       Show this help message

Environment Variables:
  ANTHROPIC_API_KEY   (required) Your Anthropic API key
  TARGET_URL          (optional) Default URL to test

Output:
  Reports are saved to qa-reports/ as Markdown files.
`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureReportsDir() {
  const dir = path.join(__dirname, "qa-reports");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Handle --help flag
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  // Determine target URL
  const targetUrl = process.argv[2] || process.env.TARGET_URL;
  if (!targetUrl) {
    console.error(
      "Error: No URL provided. Pass a URL as argument or set TARGET_URL in .env"
    );
    process.exit(1);
  }

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-api03-your-key")) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set or still contains the placeholder value.\n" +
        "Please set a valid key in your .env file or environment."
    );
    process.exit(1);
  }

  const reportsDir = ensureReportsDir();
  const ts = timestamp();
  const screenshotFilename = `screenshot-${ts}.png`;
  const screenshotPath = path.join(reportsDir, screenshotFilename);

  console.log(`[QA Agent] Target URL: ${targetUrl}`);
  console.log("[QA Agent] Launching browser...");

  // -------------------------------------------------------------------------
  // Step 1: Playwright - capture screenshot and console logs
  // -------------------------------------------------------------------------

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const consoleLogs = [];

  // Capture console messages (errors and warnings)
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      consoleLogs.push({ type, text: msg.text() });
    }
  });

  // Capture uncaught page errors
  page.on("pageerror", (error) => {
    consoleLogs.push({ type: "error", text: `[PageError] ${error.message}` });
  });

  try {
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
  } catch (err) {
    console.warn(
      `[QA Agent] Warning: Navigation did not reach networkidle state: ${err.message}`
    );
    // Continue anyway - page may still have loaded partially
  }

  // Wait a bit for any dynamic content to render
  await page.waitForTimeout(2000);

  // Take full-page screenshot
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[QA Agent] Screenshot saved: ${screenshotPath}`);

  await browser.close();

  // -------------------------------------------------------------------------
  // Step 2: Send to Anthropic Claude 3.5 Sonnet for analysis
  // -------------------------------------------------------------------------

  console.log("[QA Agent] Sending to Claude for analysis...");

  const screenshotBase64 = fs.readFileSync(screenshotPath).toString("base64");

  const consoleLogsText =
    consoleLogs.length > 0
      ? consoleLogs.map((l) => `[${l.type.toUpperCase()}] ${l.text}`).join("\n")
      : "No console errors or warnings detected.";

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `Du bist ein erfahrener QA-Experte. Analysiere den folgenden Screenshot und die zugehoerigen Browser-Konsolen-Logs einer Webseite. Identifiziere und beschreibe:

1. UI/UX-Fehler (z.B. falsche Ausrichtung, ueberlappende Elemente, unlesbarer Text)
2. Abgeschnittene oder ueberlaufende Elemente
3. Visuelle Bugs (z.B. fehlende Bilder, kaputtes Layout, falsche Farben)
4. Technische Fehler (basierend auf den Konsolen-Logs)
5. Allgemeine Verbesserungsvorschlaege zur Benutzerfreundlichkeit

Strukturiere deine Analyse klar mit Ueberschriften. Wenn keine Probleme gefunden werden, gib eine kurze positive Bewertung ab.`;

  const userMessage = `Bitte analysiere diese Webseite (URL: ${targetUrl}).

Browser-Konsolen-Logs:
\`\`\`
${consoleLogsText}
\`\`\`

Der Screenshot der Seite ist angehaengt.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: screenshotBase64,
            },
          },
          {
            type: "text",
            text: userMessage,
          },
        ],
      },
    ],
  });

  const analysisText =
    response.content && response.content[0] && response.content[0].text
      ? response.content[0].text
      : "No analysis returned.";

  console.log("[QA Agent] Analysis received.");

  // -------------------------------------------------------------------------
  // Step 3: Generate Markdown report
  // -------------------------------------------------------------------------

  const reportFilename = `report-${ts}.md`;
  const reportPath = path.join(reportsDir, reportFilename);

  const reportContent = `# QA Report

**Timestamp:** ${new Date().toISOString()}
**URL:** ${targetUrl}
**Screenshot:** ${screenshotFilename}

---

## Console Logs

\`\`\`
${consoleLogsText}
\`\`\`

---

## LLM Analysis (Claude 3.5 Sonnet)

${analysisText}

---

*Generated by AI QA Agent*
`;

  fs.writeFileSync(reportPath, reportContent, "utf-8");
  console.log(`[QA Agent] Report saved: ${reportPath}`);
  console.log("[QA Agent] Done.");
}

// Run
main().catch((err) => {
  console.error("[QA Agent] Fatal error:", err.message);
  process.exit(1);
});

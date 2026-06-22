const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = '/home/user/cue-agent-work/promovideo/public/screenshots';
const BASE = 'http://localhost:8787';

async function getToken(code, pin) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({code, pin})
  });
  const data = await res.json();
  return data.token;
}

async function capture(browser, token, viewport, filename, waitMs) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  // Navigate, inject token into localStorage, then reload
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.evaluate((t) => { localStorage.setItem('hgo.token', t); }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs || 5000);

  const filepath = path.join(OUT, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  const sz = Math.round(fs.statSync(filepath).size / 1024);
  console.log(`  OK: ${filename} (${viewport.width}x${viewport.height}) -> ${sz}KB`);
  await ctx.close();
}

(async () => {
  console.log('=== Phase 2: Capture (Playwright + localStorage token) ===');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  // Scene 02: Login screen
  {
    const ctx = await browser.newContext({ viewport: {width:1920,height:1080} });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, 'scene-02-login.png') });
    const sz = Math.round(fs.statSync(path.join(OUT, 'scene-02-login.png')).size/1024);
    console.log(`  OK: scene-02-login.png (1920x1080) -> ${sz}KB`);
    await ctx.close();
  }

  // Get tokens
  const t1 = await getToken('DR-0001', '4711'); console.log('  Token DR-0001: OK');
  const t2 = await getToken('MT-0301', '1234'); console.log('  Token MT-0301: OK');
  const t3 = await getToken('LK-0427', '1234'); console.log('  Token LK-0427: OK');
  const t4 = await getToken('SB-0901', '1234'); console.log('  Token SB-0901: OK');

  // Scene 04: Management Dashboard (1920x1080)
  console.log('\n[Scene 04] Management Leitstand...');
  await capture(browser, t1, {width:1920,height:1080}, 'scene-04-dashboard.png', 6000);

  // Scene 05: Maze Lead Tablet (1024x768)
  console.log('[Scene 05] Maze Lead Tablet...');
  await capture(browser, t2, {width:1024,height:768}, 'scene-05-maze-lead.png', 6000);

  // Scene 06: Scare Actor Phone (390x844)
  console.log('[Scene 06] Scare Actor Phone...');
  await capture(browser, t3, {width:390,height:844}, 'scene-06-scare-actor.png', 6000);

  // Scene 07: Catering Station (1024x768)
  console.log('[Scene 07] Catering Station...');
  await capture(browser, t4, {width:1024,height:768}, 'scene-07-catering.png', 6000);

  await browser.close();

  console.log('\n=== Summary ===');
  fs.readdirSync(OUT).sort().forEach(f => {
    const sz = Math.round(fs.statSync(path.join(OUT,f)).size/1024);
    console.log(`  ${f.padEnd(35)} ${sz}KB`);
  });
})().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
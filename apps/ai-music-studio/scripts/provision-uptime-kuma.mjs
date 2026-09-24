#!/usr/bin/env node
// Bootstrap the isolated Studio monitoring console through its own UI.
import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = process.env.STUDIO_COMPOSE_ENV_FILE;
if (!envPath?.startsWith('/')) throw new Error('Set STUDIO_COMPOSE_ENV_FILE to an absolute production environment file');
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n').filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => line.split(/=(.*)/s).slice(0, 2)));
if (env.COMPOSE_PROJECT_NAME !== 'hg-studio-prod') throw new Error('Monitoring bootstrap is production-scoped');
const passwordPath = join(dirname(envPath), 'monitoring-admin-password');
const password = existsSync(passwordPath) ? readFileSync(passwordPath, 'utf8').trim() : randomBytes(36).toString('base64url');
const base = `http://127.0.0.1:${env.STUDIO_MONITOR_PORT ?? '3212'}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => ['/setup', '/dashboard'].includes(url.pathname), { timeout: 30000 });
  await page.getByPlaceholder('Username').waitFor({ timeout: 30000 });
  if (new URL(page.url()).pathname === '/setup') {
    if (!existsSync(passwordPath)) writeFileSync(passwordPath, `${password}\n`, { mode: 0o600, flag: 'wx' });
    await page.getByPlaceholder('Username').fill('studio-monitor');
    await page.getByPlaceholder('Password', { exact: true }).fill(password);
    await page.getByPlaceholder('Repeat Password').fill(password);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: /Add New Monitor/ }).waitFor({ timeout: 30000 });
  } else if (new URL(page.url()).pathname === '/dashboard') {
    if (!existsSync(passwordPath)) throw new Error('Monitoring admin password file is missing');
    await page.getByPlaceholder('Username').fill('studio-monitor');
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.getByRole('link', { name: /Add New Monitor/ }).waitFor({ timeout: 30000 });
  } else {
    throw new Error(`Unexpected monitoring setup route: ${page.url()}`);
  }
  const monitors = [
    ['Studio web (internal)', 'http://studio-web:3000/'],
    ['Studio API (internal)', 'http://studio-api:8000/api/v1/health/ready'],
    ['Studio Windmill (internal)', 'http://studio-windmill:8000/api/version'],
    ['Studio HTTPS (public)', 'https://studio.hungreegoat.com/api/v1/health/ready'],
  ];
  const compose = join(dirname(fileURLToPath(import.meta.url)), 'compose.sh');
  const existing = new Set(execFileSync('bash', [compose, 'exec', '-T', 'studio-uptime-kuma', 'sqlite3', '/app/data/kuma.db', 'SELECT name FROM monitor;'], { encoding: 'utf8' }).trim().split('\n'));
  for (const [name, url] of monitors) {
    if (existing.has(name)) continue;
    await page.goto(`${base}/add`);
    await page.locator('#name').fill(name);
    await page.locator('#url').fill(url);
    await page.locator('#interval').fill('60');
    await page.locator('#maxRetries').fill('2');
    await page.locator('#timeout').fill('15');
    await page.locator('#monitor-submit-btn').click();
    await page.waitForURL(next => /^\/dashboard\/\d+$/.test(next.pathname), { timeout: 30000 });
    existing.add(name);
  }
  console.log('Studio Uptime Kuma authenticated; four web, API, orchestration, and public HTTPS monitors configured');
} finally {
  await browser.close();
}

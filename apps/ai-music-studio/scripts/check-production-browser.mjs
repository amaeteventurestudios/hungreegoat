#!/usr/bin/env node
// Exercise the production image under its actual origin, without pretending the
// uninstalled public gateway is live. All browser requests are routed to the
// isolated loopback web service; the page still uses the HTTPS production origin.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const envPath = process.env.STUDIO_COMPOSE_ENV_FILE;
if (!envPath?.startsWith('/')) throw new Error('Set STUDIO_COMPOSE_ENV_FILE to the absolute production environment file');
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n').filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => line.split(/=(.*)/s).slice(0, 2)));
if (env.COMPOSE_PROJECT_NAME !== 'hg-studio-prod' || env.STUDIO_PUBLIC_URL !== 'https://studio.hungreegoat.com') throw new Error('Expected the isolated production Studio project and origin');
const owner = JSON.parse(readFileSync(join(dirname(envPath), 'owner.json'), 'utf8'));
const base = env.STUDIO_PUBLIC_URL;
const loopback = `http://127.0.0.1:${env.STUDIO_WEB_PORT}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
let page;
let loggedIn = false;
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const failures = [];
  await context.route(`${base}/**`, async route => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: `${loopback}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch {
      failures.push(`loopback route failed: ${url.pathname}`);
      try { await route.abort(); } catch { /* browser may already be closing */ }
    }
  });
  page = await context.newPage();
  page.on('pageerror', error => failures.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`request: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`); });
  page.on('response', response => { if (response.status() >= 500) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`${base}/login`);
  await page.locator('input[type=email]').fill(owner.email);
  await page.locator('input[type=password]').fill(owner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => url.pathname !== '/login', { timeout: 15000 });
  loggedIn = true;
  for (const path of ['/', '/projects', '/songs/new', '/producer', '/generation', '/compare', '/arrangement', '/tempo', '/stems', '/mastering', '/library', '/settings']) {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    if (response?.status() !== 200) failures.push(`route ${path}: HTTP ${response?.status()}`);
    await page.locator('h1').first().waitFor({ timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    if (new URL(page.url()).pathname === '/login') failures.push(`route ${path}: redirected to login`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/compare', '/mastering']) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor({ timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) failures.push(`mobile ${path}: horizontal overflow ${overflow}px`);
  }
  if (failures.length) throw new Error(`Production-origin browser failures:\n${failures.join('\n')}`);
  console.log('Production-origin browser smoke passed: authenticated shell, 12 desktop routes, three mobile routes; no console, request, server, or overflow failures (loopback-routed, not public TLS)');
} finally {
  if (loggedIn && page) {
    try {
      await page.evaluate(async () => {
        const session = await fetch('/api/v1/auth/session').then(response => response.json());
        await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'x-csrf-token': session.csrf_token } });
      });
    } catch { /* a failed smoke must still close the private browser context */ }
  }
  await browser.close();
}

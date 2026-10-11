/* Real-browser regression checks. Run against a server serving docs/. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.BASE_URL || 'http://localhost:8770/').replace(/\/?$/, '/');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.QA_OUTPUT || path.join(root, '../troy-qa/browser.json'));
const content = JSON.parse(fs.readFileSync(path.join(root, 'content.json')));
const reports = [];
const key = 'troy-learning-v1';
const chromiumExecutable = process.env.CHROMIUM_EXECUTABLE;

async function visible(page, selector) { assert.equal(await page.locator(selector).isVisible(), true, `${selector} should be visible`); }
async function hidden(page, selector) { assert.equal(await page.locator(selector).isVisible(), false, `${selector} should be hidden`); }
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), key); }
async function waitFor(page, fn) { await page.waitForFunction(fn); }
async function closeDialog(page, id) { await page.locator(`${id} .close-dialog`).click(); await hidden(page, id); }
async function nav(page, mode) { await page.locator(`.main-nav [data-mode="${mode}"]`).click(); await visible(page, `#${mode}-view`); }
function watch(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function functional(browser) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = watch(page);
  const checks = [];
  try {
    await page.goto(base);
    await visible(page, '#topic-title');
    assert.equal(await page.locator('#topic-list button').count(), 7);
    for (const topic of content.topics) {
      await page.locator(`#topic-list [data-topic="${topic.id}"]`).click();
      assert.equal(await page.locator('#topic-title').textContent(), topic.title);
      assert.ok((await page.locator('#topic-body').textContent()).length > 80);
      assert.ok(await page.locator('#topic-neighbours button').count() > 0);
      await page.locator('#topic-source').click();
      await visible(page, '#sources-dialog');
      const links = await page.locator('#sources-list h3 a').evaluateAll(elements => elements.map(el => el.href));
      assert.ok(links.length > 0);
      assert.ok(links.every(url => url.startsWith('https://')));
      await closeDialog(page, '#sources-dialog');
    }
    checks.push('7 topics, contextual neighbours, per-topic source dialogs');

    assert.equal(await page.locator('#phase-options button').count(), content.phases.length);
    for (const phase of content.phases) {
      await page.locator(`[data-phase-option="${phase.id}"]`).click();
      assert.equal(await page.locator('#phase-title').textContent(), phase.title);
      assert.equal(await page.locator('#phase-date').textContent(), phase.date);
      assert.ok(await page.locator('svg [data-phase].active').count() > 0);
    }
    checks.push('all seven phase groups select matching titles, dates and vector layers');

    for (const diagram of ['city', 'layers', 'place']) {
      await page.locator(`[data-view="${diagram}"]`).click();
      for (const candidate of ['city', 'layers', 'place']) {
        assert.equal(await page.locator(`[data-diagram="${candidate}"]`).isVisible(), candidate === diagram);
      }
    }
    await page.locator('#zoom-in').click();
    assert.equal(await page.locator('#zoom-label').textContent(), '1.25×');
    await page.locator('#expand-viewer').click();
    await visible(page, '#viewer-dialog');
    await page.keyboard.press('Escape');
    await hidden(page, '#viewer-dialog');
    await page.locator('#reset-viewer').click();
    assert.equal(await page.locator('#zoom-label').textContent(), '1×');
    checks.push('three vector views, zoom, fullscreen and escape restore');

    await nav(page, 'context');
    assert.equal(await page.locator('#context-nodes button').count(), 7);
    await waitFor(page, () => document.querySelectorAll('#context-lines line').length === 10);
    assert.equal(await page.locator('#bridge-list button').count(), 10);
    await hidden(page, '#bridge-answer');
    await hidden(page, '#bridge-explanation');
    await page.locator('#reveal-bridge').click();
    await visible(page, '#bridge-answer');
    await visible(page, '#bridge-explanation');
    for (const topic of content.topics) {
      await page.locator(`[data-node="${topic.id}"]`).click();
      const count = content.connections.filter(c => c.from === topic.id || c.to === topic.id).length;
      assert.equal(await page.locator('#bridge-list button').count(), count);
      await hidden(page, '#bridge-answer');
      assert.equal(await page.evaluate(() => window.atlasHasActiveReview), true);
    }
    await page.locator('#all-connections').click();
    assert.equal(await page.locator('#bridge-list button').count(), 10);
    checks.push('7 graph nodes, 10 links, node filters, explanation hidden until reveal');

    await nav(page, 'learn');
    assert.equal(await page.locator('#total-count').textContent(), '34');
    assert.deepEqual(await state(page), {});
    for (const topic of ['all', ...content.topics.map(t => t.id)]) {
      for (const kind of ['all', 'fact', 'link', 'case']) {
        await page.locator('#study-topic').selectOption(topic);
        await page.locator('#study-kind').selectOption(kind);
        const expected = content.cards.filter(c => (topic === 'all' || c.topic === topic) && (kind === 'all' || c.kind === kind)).length;
        assert.equal(Number(await page.locator('#total-count').textContent()), expected);
        assert.equal(await page.locator('#start-review').isDisabled(), expected === 0);
      }
    }
    await page.locator('#study-topic').selectOption('all');
    await page.locator('#study-kind').selectOption('all');
    await page.locator('#start-review').click();
    await visible(page, '#review-session');
    const question = await page.locator('#card-question').textContent();
    const position = await page.locator('#session-position').textContent();
    await hidden(page, '#card-back');
    await hidden(page, '#rating-buttons');
    assert.deepEqual(await state(page), {});
    await page.locator('#reveal-answer').click();
    await visible(page, '#card-back');
    assert.deepEqual(await state(page), {});
    await page.locator('#card-context button').first().click();
    await visible(page, '#atlas-view');
    await visible(page, '#return-to-study');
    assert.equal(await page.evaluate(() => window.atlasHasActiveReview), true);
    await page.locator('#resume-review').click();
    await visible(page, '#review-session');
    assert.equal(await page.locator('#card-question').textContent(), question);
    assert.equal(await page.locator('#session-position').textContent(), position);
    await visible(page, '#card-back');
    await visible(page, '#rating-buttons');
    assert.deepEqual(await state(page), {});
    await page.locator('[data-grade="good"]').click();
    const saved = await state(page);
    assert.equal(Object.keys(saved).length, 1);
    const rating = Object.values(saved)[0];
    assert.equal(rating.reviews, 1);
    assert.equal(rating.step, 1);
    assert.equal(rating.due - rating.last, 86400000);
    assert.equal(await page.locator('#session-position').textContent(), '2 / 34');
    await hidden(page, '#card-back');
    await page.locator('#end-review').click();
    assert.equal(await page.evaluate(() => window.atlasHasActiveReview), false);
    assert.equal(await page.locator('#seen-count').textContent(), '1');
    await page.reload();
    assert.deepEqual(await state(page), saved);
    assert.equal(await page.locator('#seen-count').textContent(), '1');
    checks.push('34 cards, 32 topic/kind combinations, no premature save, context/resume preserves revealed card, real grade and reload persistence');
    assert.deepEqual(errors, []);
    return checks;
  } finally { await context.close(); }
}

async function update(browser) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = watch(page);
  const release = 'r-0123456789abcdefabcd';
  const candidate = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8').replace(/(<meta name="atlas-version" content=")[^"]+/, `$1${release}`);
  let candidateFetches = 0;
  await context.route(url => url.pathname.endsWith('/version.json'), route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ app: 'troy', version: release, builtAt: new Date().toISOString() }) }));
  await context.route(url => url.pathname.endsWith('/index.html') && url.searchParams.get('__atlas_release') === release, route => {
    candidateFetches++; return route.fulfill({ contentType: 'text/html', body: candidate });
  });
  try {
    await page.goto(base);
    await page.locator('#text-size').selectOption('xlarge');
    await nav(page, 'learn');
    await page.locator('#start-review').click();
    const question = await page.locator('#card-question').textContent();
    await page.locator('#reveal-answer').click();
    await page.locator('#about-button').click();
    await page.locator('#check-update').click();
    await page.waitForFunction(() => !document.querySelector('#check-update').disabled && !document.querySelector('#apply-update').hidden);
    assert.equal(await page.locator('#apply-update').isDisabled(), true);
    assert.equal(await page.locator('#update-now').isDisabled(), true);
    assert.equal(candidateFetches, 0);
    await closeDialog(page, '#about-dialog');
    await page.locator('#card-context button').first().click();
    assert.equal(await page.evaluate(() => window.atlasHasActiveReview), true);
    await page.locator('#about-button').click();
    await page.locator('#check-update').click();
    await page.waitForFunction(() => !document.querySelector('#check-update').disabled);
    assert.equal(await page.locator('#apply-update').isDisabled(), true);
    assert.equal(candidateFetches, 0);
    await closeDialog(page, '#about-dialog');
    await page.locator('#resume-review').click();
    assert.equal(await page.locator('#card-question').textContent(), question);
    await visible(page, '#card-back');
    await page.locator('[data-grade="good"]').click();
    await page.locator('#end-review').click();
    const progress = await state(page);
    await page.locator('#study-topic').selectOption('war');
    await page.locator('#study-kind').selectOption('case');
    const routeBefore = new URL(page.url());
    await page.locator('#about-button').click();
    await page.locator('#check-update').click();
    await page.waitForFunction(() => !document.querySelector('#apply-update').disabled);
    await page.locator('#apply-update').click();
    await page.waitForFunction(release => document.querySelector('meta[name="atlas-version"]').content === release, release);
    await page.waitForFunction(() => document.querySelector('#study-topic').value === 'war' && document.querySelector('#study-kind').value === 'case');
    assert.equal(await page.locator('#text-size').inputValue(), 'xlarge');
    assert.equal(await page.locator('html').getAttribute('data-text-size'), 'xlarge');
    assert.deepEqual(await state(page), progress);
    assert.equal(new URL(page.url()).searchParams.get('mode'), routeBefore.searchParams.get('mode'));
    assert.equal(new URL(page.url()).searchParams.has('__atlas_release'), false);
    assert.ok(candidateFetches >= 2, 'candidate HTML was verified then navigated');
    assert.deepEqual(errors, []);
    return ['new release waits during question and contextual reading; ending session enables update; verified candidate reload retains font, filters, route and saved ratings'];
  } finally { await context.close(); }
}

async function offline(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await context.newPage();
  const requests = [], errors = watch(page);
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  // WebKit's automation offline flag rejects file:// navigation internally.
  // Abort every network request instead; the standalone file must request none.
  await context.route(/^https?:/, route => route.abort('internetdisconnected'));
  try {
    await page.goto(pathToFileURL(path.join(root, 'docs/TROY.html')).href);
    await visible(page, '#topic-title');
    assert.equal(await page.locator('#topic-list button').count(), 7);
    await page.locator('[data-view="layers"]').click();
    await visible(page, '[data-diagram="layers"]');
    await nav(page, 'context');
    await page.locator('#reveal-bridge').click();
    await visible(page, '#bridge-answer');
    await nav(page, 'learn');
    await page.locator('#start-review').click();
    await page.locator('#reveal-answer').click();
    await visible(page, '#card-back');
    await page.locator('[data-grade="again"]').click();
    await page.locator('#end-review').click();
    await page.locator('#about-button').click();
    assert.equal(await page.locator('#check-update').isDisabled(), true);
    assert.match(await page.locator('#update-status').textContent(), /автономный файл/);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    return ['file:// opens with HTTP(S) blocked, vectors/context/recall work, update disabled, zero external requests'];
  } finally { await context.close(); }
}

(async () => {
  assert.equal(content.topics.length, 7);
  assert.equal(content.connections.length, 10);
  assert.equal(content.cards.length, 34);
  for (const engine of ['chromium', 'webkit']) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' && chromiumExecutable && fs.existsSync(chromiumExecutable) ? { executablePath: chromiumExecutable } : {}) });
    try {
      for (const [name, run] of Object.entries({ functional, update, offline })) {
        const started = Date.now();
        try {
          const checks = await run(browser);
          reports.push({ engine, suite: name, passed: true, milliseconds: Date.now() - started, checks });
          process.stdout.write(`PASS ${engine} ${name}\n`);
        } catch (error) {
          reports.push({ engine, suite: name, passed: false, milliseconds: Date.now() - started, error: error.stack });
          process.stdout.write(`FAIL ${engine} ${name}: ${error.message}\n`);
        }
      }
    } finally { await browser.close(); }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ checked: new Date().toISOString(), base, reports }, null, 2) + '\n');
  process.stdout.write(`Result: ${output}\n`);
  if (reports.some(report => !report.passed)) process.exitCode = 1;
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });

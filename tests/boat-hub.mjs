import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }], ['mobile landscape', { width: 844, height: 390 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: name !== 'desktop', isMobile: name !== 'desktop' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:8080/');
    await page.waitForFunction(() => window.__dsh?.hub);
    await page.locator('#welcome-guest').click();
    await page.locator('#tutorial-skip').click();
    await page.locator('#hub').waitFor({state:'visible'});
    await page.evaluate(() => {
      const { hub, progression } = window.__dsh;
      progression.data.cash = 500;
      progression.data.inventory.clownfish = 2;
      progression.save = () => {};
      hub.show();
    });
    for (const [tab, text] of [['market', 'FISH MARKET'], ['economy', 'No verified merchant contract'], ['equipment', 'EQUIPMENT SHOP'], ['workshop', 'WORKSHOP'], ['zones', 'DIVE PREPARATION'], ['missions', 'Catch 5 fish'], ['records', 'No catch records yet'], ['storage', 'CLOWNFISH'], ['collectibles', 'OPEN COLLECTIBLES']]) {
      await page.locator(`[data-tab="${tab}"]`).click();
      await page.locator('#hub-body').getByText(text, { exact: false }).first().waitFor();
    }
    await page.locator('[data-tab="economy"]').click();
    assert.match(await page.locator('#hub-body').textContent(), /DISABLED/);
    await page.locator('[data-tab="market"]').click();
    assert.match(await page.locator('#hub-body').textContent(), /SELL CATCH · 36 CR/);
    await page.locator('[data-action="sell"]').click();
    assert.equal(await page.locator('#hub-cash').textContent(), '536 CR');
    await page.locator('[data-tab="workshop"]').click();
    await page.locator('[data-action="upgrade"][data-id="oxygen"]').click();
    assert.equal(await page.locator('#hub-cash').textContent(), '416 CR');
    assert.match(await page.locator('#hub-body').textContent(), /capacity 125/);
    const fit = await page.locator('#hub-panel').evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    });
    assert.ok(fit);
    assert.deepEqual(errors, []);
    console.log('PASS', name, 'boat market/shop/workshop/dive/missions/records/storage/collectibles');
    await context.close();
  }
} finally { await browser.close(); }

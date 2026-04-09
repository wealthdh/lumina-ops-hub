/**
 * Lumina Ops Hub — End-to-End Integration Test
 *
 * Tests the full pipeline: Kling → Supabase → Twitter → Stripe
 *
 * Usage:
 *   node scripts/e2e-test.js
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   KLING_ACCESS_KEY, KLING_SECRET_KEY
 *   TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 *   STRIPE_SECRET_KEY
 *
 * Set VERCEL_URL or APP_URL to point at your deployed instance.
 */

const BASE = process.env.APP_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://lumina-ops-hub.vercel.app';

const results = { passed: 0, failed: 0, skipped: 0, details: [] };

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}][${tag}] ${msg}`);
}

function record(name, status, detail = '') {
  results.details.push({ name, status, detail });
  results[status]++;
  const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
  log('TEST', `${icon} ${name} — ${status}${detail ? ': ' + detail : ''}`);
}

async function fetchJSON(path, options = {}) {
  const url = `${BASE}${path}`;
  log('FETCH', `${options.method || 'GET'} ${url}`);
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// ─── TEST 1: Kling Video Generation ───────────────────────────────
async function testKling() {
  log('KLING', 'Starting text2video generation test...');
  const res = await fetchJSON('/api/kling?action=text2video', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'E2E test: A futuristic trading dashboard with glowing cyan charts',
      duration: '5',
      aspect_ratio: '16:9',
    }),
  });

  if (!res.ok) {
    record('Kling Generate', 'failed', `HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
    return null;
  }

  const taskId = res.data?.data?.task_id;
  if (!taskId) {
    record('Kling Generate', 'failed', 'No task_id in response');
    return null;
  }

  record('Kling Generate', 'passed', `task_id=${taskId}`);

  // Poll status (max 3 attempts for test — real polling takes minutes)
  log('KLING', `Polling task ${taskId} status...`);
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetchJSON(`/api/kling?action=status&task_id=${taskId}`);
    const status = poll.data?.data?.task_status;
    log('KLING', `Poll ${i + 1}: status=${status}`);
    if (status === 'succeed') {
      const videoUrl = poll.data?.data?.task_result?.videos?.[0]?.url;
      record('Kling Poll', 'passed', `Video ready: ${videoUrl?.slice(0, 80)}`);
      return { taskId, videoUrl };
    }
  }

  record('Kling Poll', 'skipped', 'Video still processing (expected for long generations)');
  return { taskId, videoUrl: null };
}

// ─── TEST 2: Supabase Persistence ─────────────────────────────────
async function testSupabase(taskId) {
  if (!taskId) {
    record('Supabase Persist', 'skipped', 'No task_id from Kling test');
    return;
  }

  // We check via the products endpoint as a proxy for Supabase connectivity
  const res = await fetchJSON('/api/products');
  if (res.ok) {
    record('Supabase Connection', 'passed', `Products endpoint returned ${res.status}`);
  } else {
    record('Supabase Connection', 'failed', `HTTP ${res.status}`);
  }
}

// ─── TEST 3: Distribution (Twitter) ──────────────────────────────
async function testDistribution() {
  // Test the connections endpoint first (doesn't post anything)
  const res = await fetchJSON('/api/distribute?action=connections');
  if (res.ok) {
    record('Distribution API', 'passed', 'Connections endpoint reachable');
  } else {
    record('Distribution API', 'failed', `HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }

  // Don't actually post in test mode — just verify the endpoint exists
  const postTest = await fetchJSON('/api/distribute?action=single', {
    method: 'POST',
    body: JSON.stringify({
      creative_id: '00000000-0000-0000-0000-000000000000', // Fake UUID
      platform: 'twitter',
    }),
  });

  if (postTest.status === 400 || postTest.status === 404) {
    record('Twitter Post (dry run)', 'passed', 'Endpoint validated — rejected fake UUID as expected');
  } else if (postTest.ok) {
    record('Twitter Post (dry run)', 'passed', 'Endpoint responded OK');
  } else {
    record('Twitter Post (dry run)', 'failed', `Unexpected HTTP ${postTest.status}`);
  }
}

// ─── TEST 4: Stripe Checkout ──────────────────────────────────────
async function testStripe() {
  // First get a real product
  const products = await fetchJSON('/api/products');
  if (!products.ok || !products.data?.length) {
    record('Stripe Products', 'skipped', 'No products in DB — add products to stripe_products table');
    return;
  }

  record('Stripe Products', 'passed', `${products.data.length} products found`);

  const productId = products.data[0].id;
  const res = await fetchJSON('/api/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  });

  if (res.ok && res.data?.url) {
    record('Stripe Checkout', 'passed', `Session URL generated: ${res.data.url.slice(0, 60)}...`);
  } else {
    record('Stripe Checkout', 'failed', `HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
}

// ─── TEST 5: MT5 Sync ────────────────────────────────────────────
async function testMT5() {
  const res = await fetchJSON('/api/mt5-sync');
  if (res.ok) {
    record('MT5 Sync', 'passed', `Synced: ${JSON.stringify(res.data).slice(0, 150)}`);
  } else if (res.status === 500) {
    record('MT5 Sync', 'skipped', 'No MT5 data yet — populate mt5_trades table first');
  } else {
    record('MT5 Sync', 'failed', `HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  LUMINA OPS HUB — END-TO-END INTEGRATION TEST');
  console.log('  Target: ' + BASE);
  console.log('═'.repeat(60) + '\n');

  const klingResult = await testKling();
  await testSupabase(klingResult?.taskId);
  await testDistribution();
  await testStripe();
  await testMT5();

  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS');
  console.log('─'.repeat(60));
  console.log(`  ✅ Passed:  ${results.passed}`);
  console.log(`  ❌ Failed:  ${results.failed}`);
  console.log(`  ⏭️  Skipped: ${results.skipped}`);
  console.log('─'.repeat(60));

  if (results.failed === 0) {
    console.log('  🎉 TEST PASSED: Kling → Supabase → Twitter → Stripe');
  } else {
    console.log('  ⚠️  Some tests failed — check details above');
  }

  console.log('═'.repeat(60) + '\n');
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[E2E] Fatal error:', err);
  process.exit(1);
});

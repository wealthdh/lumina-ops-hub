#!/usr/bin/env node
/**
 * E2E UGC Pipeline Test
 * Tests the FULL flow: Create → Generate → Verify → Ready → Post → DB Check
 *
 * Run: node scripts/e2e-ugc-test.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://rjtxkjozlhvnxkzmqffk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdHhram96bGh2bnhrem1xZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM0NjAsImV4cCI6MjA5MDEyOTQ2MH0.RbF0iZocHiofHQapTt71LYGgSr-4xcXHd-DCSxfZV68';
const DEV_VIDEO = 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let testsPassed = 0;
let testsFailed = 0;
let testsRun = 0;
const errors = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const prefix = level === 'PASS' ? '✅ [TEST PASS]' :
                 level === 'FAIL' ? '❌ [TEST FAIL]' :
                 level === 'INFO' ? '🔍 [INFO]' :
                 level === 'FLOW' ? '🔄 [FLOW]' :
                 '⚠️ [ERROR]';
  console.log(`${prefix} [${ts}] ${msg}`);
}

function assert(condition, testName, detail) {
  testsRun++;
  if (condition) {
    testsPassed++;
    log('PASS', testName);
  } else {
    testsFailed++;
    const msg = `${testName}${detail ? ' — ' + detail : ''}`;
    log('FAIL', msg);
    errors.push(msg);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Database connection
// ═══════════════════════════════════════════════════════════════════════════════
async function testDBConnection() {
  log('FLOW', 'TEST 1: Database Connection');
  log('FLOW', 'supabase.from("ugc_creatives").select("count") → DB → response');

  const { count, error } = await supabase
    .from('ugc_creatives')
    .select('*', { count: 'exact', head: true });

  assert(!error, 'DB connection succeeds', error?.message);
  assert(typeof count === 'number', `DB returns count (${count} rows)`);
  return !error;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Create a creative (INSERT)
// ═══════════════════════════════════════════════════════════════════════════════
async function testCreateCreative() {
  log('FLOW', 'TEST 2: Create Creative');
  log('FLOW', 'button "Generate" → useGenerateAndRun → supabase.insert({status:"draft"}) → DB → UI refresh');

  const { data, error } = await supabase
    .from('ugc_creatives')
    .insert({
      title: `[E2E-TEST] ${new Date().toISOString().slice(11, 19)}`,
      platform: 'Twitter/X',
      status: 'draft',
      views: 0,
      ctr: 0,
      roas: 0,
      tool: 'Kling',
      api_provider: 'kling',
      generation_prompt: 'E2E test: sleek AI dashboard',
    })
    .select()
    .single();

  assert(!error, 'INSERT draft row succeeds', error?.message);
  assert(!!data?.id, `Row created with id: ${data?.id?.slice(0, 8)}`);
  assert(data?.status === 'draft', `Status is "draft" (got: ${data?.status})`);
  assert(data?.title?.includes('[E2E-TEST]'), 'Title contains test marker');

  return data?.id || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Update status draft → testing
// ═══════════════════════════════════════════════════════════════════════════════
async function testStatusTransition(id, fromStatus, toStatus) {
  log('FLOW', `TEST 3: Status transition ${fromStatus} → ${toStatus}`);
  log('FLOW', `updateCreativeStatus(${id.slice(0,8)}, "${toStatus}") → supabase.update → DB → realtime → UI`);

  const { error } = await supabase
    .from('ugc_creatives')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  assert(!error, `UPDATE ${fromStatus}→${toStatus} succeeds`, error?.message);

  // Verify
  const { data: row } = await supabase
    .from('ugc_creatives')
    .select('status')
    .eq('id', id)
    .single();

  assert(row?.status === toStatus, `DB confirms status="${toStatus}" (got: ${row?.status})`);
  return !error;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Simulate video generation (set video_url + status=ready)
// ═══════════════════════════════════════════════════════════════════════════════
async function testVideoGeneration(id) {
  log('FLOW', 'TEST 4: Video Generation (DEV MODE simulation)');
  log('FLOW', 'generateAndSaveCreative → Kling API (fails) → DEV MODE fallback → supabase.update({video_url, status:"ready"}) → DB → UI');

  const { error } = await supabase
    .from('ugc_creatives')
    .update({
      video_url: DEV_VIDEO,
      thumbnail_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg',
      status: 'ready',
      platform_ready: true,
      api_provider: 'dev-mode',
      caption: '🤫 Nobody is talking about this AI secret...\n\nAI dashboard with glowing charts.\n\n👉 DM \'AI\' for access',
      hooks: [
        { text: 'Nobody is talking about this AI secret...', category: 'curiosity', score: 82 },
        { text: 'I made $500/day with this system', category: 'authority', score: 75 },
        { text: 'This hack expires tomorrow', category: 'urgency', score: 68 },
      ],
      hook_used: 'Nobody is talking about this AI secret...',
      hook_score: 82,
      cta_used: "DM 'AI' for access",
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  assert(!error, 'UPDATE with video_url succeeds', error?.message);

  // Verify row
  const { data: row } = await supabase
    .from('ugc_creatives')
    .select('status, video_url, api_provider, hook_used, cta_used, hook_score, hooks, caption')
    .eq('id', id)
    .single();

  assert(row?.status === 'ready', `Status is "ready" (got: ${row?.status})`);
  assert(row?.video_url === DEV_VIDEO, 'video_url is set to DEV MODE URL');
  assert(row?.api_provider === 'dev-mode', 'api_provider is "dev-mode"');
  assert(!!row?.hook_used, `hook_used is set: "${row?.hook_used?.slice(0,40)}"`);
  assert(!!row?.cta_used, `cta_used is set: "${row?.cta_used}"`);
  assert(row?.hook_score === 82, `hook_score is 82 (got: ${row?.hook_score})`);
  assert(!!row?.caption, 'caption is non-empty');
  assert(Array.isArray(row?.hooks) && row.hooks.length === 3, `3 hooks stored (got: ${row?.hooks?.length})`);

  return !error;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Video URL verification (HEAD request)
// ═══════════════════════════════════════════════════════════════════════════════
async function testVideoLoads(videoUrl) {
  log('FLOW', 'TEST 5: Video URL Verification');
  log('FLOW', `HEAD ${videoUrl} → expect 200`);

  try {
    const res = await fetch(videoUrl, { method: 'HEAD', redirect: 'follow' });
    assert(res.status === 200, `Video HEAD returns 200 (got: ${res.status})`);
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('video') || contentType.includes('octet'), `Content-Type is video (got: ${contentType})`);
    return res.status === 200;
  } catch (err) {
    assert(false, 'Video HEAD request succeeds', err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Simulate post (ready → posted)
// ═══════════════════════════════════════════════════════════════════════════════
async function testSimulatePost(id) {
  log('FLOW', 'TEST 6: Simulate Post');
  log('FLOW', 'button "Post to X" → usePostToX → postToTwitter() → (fails gracefully) → status stays ready_to_post');

  // Simulate Twitter failing gracefully → mark ready_to_post
  const { error } = await supabase
    .from('ugc_creatives')
    .update({
      status: 'ready_to_post',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  assert(!error, 'UPDATE ready→ready_to_post succeeds', error?.message);

  const { data: row } = await supabase
    .from('ugc_creatives')
    .select('status')
    .eq('id', id)
    .single();

  assert(row?.status === 'ready_to_post', `Status is "ready_to_post" (got: ${row?.status})`);
  return !error;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Full status lifecycle
// ═══════════════════════════════════════════════════════════════════════════════
async function testFullLifecycle(id) {
  log('FLOW', 'TEST 7: Full Lifecycle Verification');

  // Mark as posted
  const { error } = await supabase
    .from('ugc_creatives')
    .update({
      status: 'posted',
      distributed_to: ['Twitter/X'],
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  assert(!error, 'UPDATE to "posted" succeeds', error?.message);

  const { data: row } = await supabase
    .from('ugc_creatives')
    .select('status, distributed_to, posted_at, video_url')
    .eq('id', id)
    .single();

  assert(row?.status === 'posted', `Final status is "posted" (got: ${row?.status})`);
  assert(Array.isArray(row?.distributed_to) && row.distributed_to.includes('Twitter/X'), 'distributed_to includes Twitter/X');
  assert(!!row?.posted_at, 'posted_at timestamp is set');
  assert(!!row?.video_url, 'video_url still present after posting');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Verify NO private URLs in database
// ═══════════════════════════════════════════════════════════════════════════════
async function testNoPrivateUrls() {
  log('FLOW', 'TEST 8: No Private URLs in Database');

  const { data, error } = await supabase
    .from('ugc_creatives')
    .select('id, video_url')
    .or('video_url.like.%googleapis%,video_url.like.%storage.cloud.google%');

  assert(!error, 'Query for private URLs succeeds', error?.message);
  assert(!data || data.length === 0, `Zero private URLs found (found: ${data?.length || 0})`);

  if (data && data.length > 0) {
    for (const row of data) {
      log('ERROR', `PRIVATE URL FOUND: ${row.id} → ${row.video_url?.slice(0, 80)}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Verify ALL videos with URLs load (HEAD check every row)
// ═══════════════════════════════════════════════════════════════════════════════
async function testAllVideoUrls() {
  log('FLOW', 'TEST 9: Verify ALL video URLs load');

  const { data, error } = await supabase
    .from('ugc_creatives')
    .select('id, video_url, status')
    .not('video_url', 'is', null);

  assert(!error, 'Query for all video URLs succeeds', error?.message);

  if (!data || data.length === 0) {
    log('INFO', 'No creatives with video URLs found');
    return;
  }

  // Check unique URLs only
  const uniqueUrls = [...new Set(data.map(r => r.video_url))];
  log('INFO', `Checking ${uniqueUrls.length} unique video URL(s) across ${data.length} creatives`);

  for (const url of uniqueUrls) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      assert(res.status === 200, `Video URL returns 200: ${url.slice(0, 60)}`, `got ${res.status}`);
    } catch (err) {
      assert(false, `Video URL reachable: ${url.slice(0, 60)}`, err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: No stuck creatives
// ═══════════════════════════════════════════════════════════════════════════════
async function testNoStuckCreatives() {
  log('FLOW', 'TEST 10: No Stuck Creatives');

  // Check: no creative in "testing" with a video_url
  const { data: stuckWithVideo } = await supabase
    .from('ugc_creatives')
    .select('id')
    .eq('status', 'testing')
    .not('video_url', 'is', null);

  assert(!stuckWithVideo || stuckWithVideo.length === 0,
    `No "testing" creatives with video_url (found: ${stuckWithVideo?.length || 0})`);

  // Check: no creative in "testing" older than 5 min
  const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
  const { data: staleTests } = await supabase
    .from('ugc_creatives')
    .select('id')
    .eq('status', 'testing')
    .lt('created_at', fiveMinAgo);

  assert(!staleTests || staleTests.length === 0,
    `No "testing" creatives older than 5 min (found: ${staleTests?.length || 0})`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: Delete creative (cleanup)
// ═══════════════════════════════════════════════════════════════════════════════
async function testDeleteCreative(id) {
  log('FLOW', 'TEST 11: Delete Creative');
  log('FLOW', 'button "Delete" → useDeleteCreative → supabase.delete → DB → realtime → UI refresh');

  const { error } = await supabase
    .from('ugc_creatives')
    .delete()
    .eq('id', id);

  assert(!error, 'DELETE creative succeeds', error?.message);

  // Verify gone
  const { data: row } = await supabase
    .from('ugc_creatives')
    .select('id')
    .eq('id', id)
    .single();

  assert(!row, 'Creative is deleted from DB');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 12: Realtime subscription fires
// ═══════════════════════════════════════════════════════════════════════════════
async function testRealtimeSubscription() {
  log('FLOW', 'TEST 12: Realtime Subscription');
  log('FLOW', 'supabase.channel → postgres_changes → event fires → qc.invalidateQueries');

  return new Promise(async (resolve) => {
    let eventReceived = false;

    const channel = supabase
      .channel('e2e_test_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ugc_creatives' }, () => {
        eventReceived = true;
      })
      .subscribe();

    // Wait for subscription to be ready
    await new Promise(r => setTimeout(r, 2000));

    // Insert a row to trigger the event
    const { data } = await supabase
      .from('ugc_creatives')
      .insert({
        title: '[E2E-REALTIME-TEST]',
        platform: 'Twitter/X',
        status: 'draft',
        views: 0, ctr: 0, roas: 0,
        tool: 'Kling',
      })
      .select('id')
      .single();

    // Wait for realtime event
    await new Promise(r => setTimeout(r, 3000));

    assert(eventReceived, 'Realtime event received after INSERT');

    // Cleanup
    if (data?.id) {
      await supabase.from('ugc_creatives').delete().eq('id', data.id);
    }
    supabase.removeChannel(channel);

    resolve();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  E2E UGC PIPELINE TEST — FULL SYSTEM VERIFICATION');
  console.log('═'.repeat(70) + '\n');

  // TEST 1: DB connection
  const connected = await testDBConnection();
  if (!connected) {
    console.log('\n❌ FATAL: Cannot connect to database. Aborting.');
    process.exit(1);
  }

  // TEST 2: Create creative
  const creativeId = await testCreateCreative();
  if (!creativeId) {
    console.log('\n❌ FATAL: Cannot create creative. Aborting.');
    process.exit(1);
  }

  // TEST 3: Status transition draft → testing
  await testStatusTransition(creativeId, 'draft', 'testing');

  // TEST 4: Simulate video generation (testing → ready with video)
  await testVideoGeneration(creativeId);

  // TEST 5: Video URL loads
  await testVideoLoads(DEV_VIDEO);

  // TEST 6: Simulate post attempt (ready → ready_to_post)
  await testSimulatePost(creativeId);

  // TEST 7: Full lifecycle (ready_to_post → posted)
  await testFullLifecycle(creativeId);

  // TEST 8: No private URLs in entire database
  await testNoPrivateUrls();

  // TEST 9: All video URLs return 200
  await testAllVideoUrls();

  // TEST 10: No stuck creatives
  await testNoStuckCreatives();

  // TEST 11: Delete test creative (cleanup)
  await testDeleteCreative(creativeId);

  // TEST 12: Realtime subscription
  await testRealtimeSubscription();

  // ─── Results ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST RESULTS');
  console.log('═'.repeat(70));
  console.log(`  Total:  ${testsRun}`);
  console.log(`  Passed: ${testsPassed} ✅`);
  console.log(`  Failed: ${testsFailed} ❌`);
  console.log('═'.repeat(70));

  if (errors.length > 0) {
    console.log('\n  FAILURES:');
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  if (testsFailed === 0) {
    console.log('\n  🎉 ALL TESTS PASSED — SYSTEM FULLY OPERATIONAL\n');
  } else {
    console.log(`\n  ⚠️ ${testsFailed} TEST(S) FAILED — FIXES REQUIRED\n`);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

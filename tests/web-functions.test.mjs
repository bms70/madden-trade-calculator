// Web v2.0 / v2.1 functions: trade validation, commissioner sessions and the five
// request handlers (accept-trade, commissioner-login, commissioner-session-check,
// review-trade, commissioner-audit-log), with a fake database RPC.
// Run from the repo root: node --experimental-strip-types tests/web-functions.test.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fn = (p) => path.join(here, '..', 'supabase/functions', p);

const validation = await import(fn('_shared/trade-validation.ts'));
const sessions = await import(fn('_shared/commissioner-session.ts'));
const adminSession = await import(fn('_shared/admin-session.ts'));
const handlers = await import(fn('_shared/commissioner-handlers.ts'));
const accept = await import(fn('accept-trade/handler.ts'));

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail); }
}

const SECRET = 'test-secret-not-real';
const LEAGUE = '11111111-1111-4111-8111-111111111111';
const OTHER_LEAGUE = '22222222-2222-4222-8222-222222222222';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRADE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = 1_800_000_000;

function snapshot(overrides = {}) {
  return {
    web_release: 'v2.0',
    ruleset_version: 'v4.4',
    user_team_assets: [{ type: 'PLAYER', name: 'Player A', pos: 'QB', ovr: 80 }],
    cpu_team_assets: [{ type: 'PICK', round: 1 }],
    user_raw_value: 100,
    cpu_raw_value: 90,
    user_adjusted_value: 100,
    cpu_adjusted_value: 92,
    adjusted_gap: 8,
    verdict: 'FAIR',
    evaluation_mode: 'DIRECTIONAL',
    protection_tier: null,
    required_target: null,
    fair_maximum: null,
    trade_intelligence: [],
    suggested_correction: '',
    ...overrides,
  };
}

function leagueBody(overrides = {}) {
  return {
    ...snapshot(),
    mode: 'LEAGUE',
    league_name: 'Sample League',
    submitting_team_id: TEAM_A,
    other_team_id: TEAM_B,
    submitter_name: 'Sam',
    submitter_note: 'Deadline deal',
    ...overrides,
  };
}

function post(body, method = 'POST') {
  return new Request('https://example.test/fn', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

// Fake RPC: records calls, answers from a table of responses by function name.
function fakeRpc(responses) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    const r = responses[name];
    if (typeof r === 'function') return r(args);
    return r ?? { data: null, error: { code: 'XX000', message: 'no fake for ' + name } };
  };
  return { rpc, calls };
}

const quiet = () => {};

async function json(response) { return { status: response.status, body: await response.json() }; }

// ---------------------------------------------------------------------------
// 1. Trade validation
// ---------------------------------------------------------------------------
{
  const v = validation.validateTradePayload;
  check('v2.0/v4.4 accepted', v(snapshot()).valid);
  check('v2.1/v4.4 accepted', v(snapshot({ web_release: 'v2.1' })).valid);
  check('v1.5.0/v4.4 refused from v2.1 (switchover over)', !v(snapshot({ web_release: 'v1.5.0' })).valid);
  check('v2.1 with v4.2 refused', !v(snapshot({ web_release: 'v2.1', ruleset_version: 'v4.2' })).valid);
  check('v1.4.0/v4.2 rejected', !v(snapshot({ web_release: 'v1.4.0', ruleset_version: 'v4.2' })).valid);
  check('v2.0 with v4.2 rejected', v(snapshot({ ruleset_version: 'v4.2' })).message === 'Unsupported Ruleset version.');
  check('7 assets rejected', !v(snapshot({ user_team_assets: Array(7).fill({}) })).valid);
  check('0 assets rejected', !v(snapshot({ cpu_team_assets: [] })).valid);
  check('NaN value rejected', !v(snapshot({ user_raw_value: NaN })).valid);
  check('zero adjusted value rejected', !v(snapshot({ cpu_adjusted_value: 0 })).valid);
  check('bad verdict rejected', !v(snapshot({ verdict: 'GREAT' })).valid);
  check('bad mode rejected', !v(snapshot({ evaluation_mode: 'X' })).valid);
  check('bad protection tier rejected', !v(snapshot({ protection_tier: 'GOLD' })).valid);
  check('CORNERSTONE tier accepted', v(snapshot({ protection_tier: 'CORNERSTONE' })).valid);
  check('long suggested correction rejected', !v(snapshot({ suggested_correction: 'x'.repeat(2001) })).valid);
  check('array payload rejected', !v([]).valid);

  const stored = validation.tradeForStorage(leagueBody());
  check('storage keeps the 16 trade fields only', Object.keys(stored).length === 16 && !('league_name' in stored) && !('mode' in stored));

  const lf = validation.validateLeagueFields;
  check('league fields valid', lf(leagueBody()).valid);
  check('mode must be LEAGUE', !lf(leagueBody({ mode: 'PRACTICE' })).valid);
  check('league name required', !lf(leagueBody({ league_name: '  ' })).valid);
  check('team ids must be uuids', !lf(leagueBody({ other_team_id: 'NYG' })).valid);
  check('same team rejected', lf(leagueBody({ other_team_id: TEAM_A.toUpperCase() })).message === 'Choose two different teams.');
  check('name over 60 rejected', !lf(leagueBody({ submitter_name: 'x'.repeat(61) })).valid);
  check('note over 500 rejected', !lf(leagueBody({ submitter_note: 'x'.repeat(501) })).valid);
  const blankNote = lf(leagueBody({ submitter_note: '   ' }));
  check('blank note becomes null', blankNote.valid && blankNote.fields.submitterNote === null);
  const noNote = lf(leagueBody({ submitter_note: undefined }));
  check('missing note allowed', noNote.valid && noNote.fields.submitterNote === null);
  check('name is trimmed', lf(leagueBody({ submitter_name: '  Sam  ' })).fields.submitterName === 'Sam');
}

// ---------------------------------------------------------------------------
// 2. Commissioner sessions
// ---------------------------------------------------------------------------
{
  const { token, expiresAt } = await sessions.createCommissionerSession(SECRET, LEAGUE, NOW);
  check('expiry is 30 minutes', expiresAt === new Date((NOW + 1800) * 1000).toISOString());

  const ok = await sessions.verifyCommissionerSession(token, SECRET, NOW + 60);
  check('fresh token valid', ok.valid && ok.payload.leagueId === LEAGUE && ok.payload.role === 'COMMISSIONER');

  check('expired token', (await sessions.verifyCommissionerSession(token, SECRET, NOW + 1800)).reason === 'expired');
  check('wrong secret invalid', (await sessions.verifyCommissionerSession(token, 'other', NOW)).reason === 'invalid');
  check('missing token', (await sessions.verifyCommissionerSession('', SECRET, NOW)).reason === 'missing');
  check('garbage token malformed', (await sessions.verifyCommissionerSession('abc', SECRET, NOW)).reason === 'malformed');

  // Tamper: swap the league in the payload, keep the signature.
  const [payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  decoded.leagueId = OTHER_LEAGUE;
  const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url') + '.' + signature;
  check('tampered league rejected', (await sessions.verifyCommissionerSession(forged, SECRET, NOW)).reason === 'invalid');

  // A v1 site-owner Admin token, signed with the same secret, is not a commissioner token.
  const v1Payload = Buffer.from(JSON.stringify({ version: 1, issuedAt: NOW, expiresAt: NOW + 1800 })).toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const v1Sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(v1Payload))).toString('base64url');
  const v1Token = v1Payload + '.' + v1Sig;
  check('v1 Admin token rejected as commissioner', (await sessions.verifyCommissionerSession(v1Token, SECRET, NOW)).reason === 'malformed');

  // And the other way: the old Admin functions must not accept a commissioner token.
  const asAdmin = await adminSession.verifyAdminSession(token, SECRET);
  check('commissioner token rejected by old Admin', !asAdmin.valid);
}

// ---------------------------------------------------------------------------
// 3. accept-trade
// ---------------------------------------------------------------------------
{
  const leagueRow = { league_id: LEAGUE, league_name: 'Sample League', madden_version: '27' };
  const submitted = { trade_id: TRADE_ID, trade_number: 41, accepted_at: '2026-11-22T12:00:00Z' };

  const db = fakeRpc({
    league_lookup: { data: [leagueRow], error: null },
    submit_league_trade: { data: [submitted], error: null },
  });
  const deps = { rpc: db.rpc, log: quiet };

  let r = await json(await accept.handleAcceptTrade(post(leagueBody()), deps));
  check('league trade logged', r.status === 200 && r.body.trade.tradeNumber === 41 && r.body.trade.leagueName === 'Sample League');
  check('lookup used the league name', db.calls[0].name === 'league_lookup' && db.calls[0].args.p_name === 'Sample League');
  const submit = db.calls[1];
  check('submit got league and teams', submit.args.p_league_id === LEAGUE && submit.args.p_submitting_team_id === TEAM_A && submit.args.p_other_team_id === TEAM_B);
  check('submit got name and note', submit.args.p_submitter_name === 'Sam' && submit.args.p_submitter_note === 'Deadline deal');
  check('submitted snapshot has no league fields', !('league_name' in submit.args.p_trade) && Object.keys(submit.args.p_trade).length === 16);

  r = await json(await accept.handleAcceptTrade(post(snapshot({ web_release: 'v1.5.0' })), deps));
  check('v1.5.0 refused, no database call', r.status === 400 && db.calls.length === 2);

  r = await json(await accept.handleAcceptTrade(post(leagueBody({ web_release: 'v2.1' })), deps));
  check('v2.1 league trade logged', r.status === 200 && db.calls[3].args.p_trade.web_release === 'v2.1');

  r = await json(await accept.handleAcceptTrade(post(snapshot()), deps));
  check('v2.0 without league fields rejected', r.status === 400 && r.body.error === 'Only league trades can be logged.');

  r = await json(await accept.handleAcceptTrade(post(snapshot({ web_release: 'v1.4.0', ruleset_version: 'v4.2' })), deps));
  check('v1.4.0 rejected', r.status === 400);

  const missing = fakeRpc({ league_lookup: { data: [], error: null } });
  r = await json(await accept.handleAcceptTrade(post(leagueBody()), { ...deps, rpc: missing.rpc }));
  check('unknown league 404', r.status === 404 && missing.calls.length === 1);

  const badTeam = fakeRpc({
    league_lookup: { data: [leagueRow], error: null },
    submit_league_trade: { data: null, error: { code: '22023', message: 'Both teams must belong to this league.' } },
  });
  r = await json(await accept.handleAcceptTrade(post(leagueBody()), { ...deps, rpc: badTeam.rpc }));
  check('team from another league 400 with database message', r.status === 400 && r.body.error === 'Both teams must belong to this league.');

  const broken = fakeRpc({
    league_lookup: { data: [leagueRow], error: null },
    submit_league_trade: { data: null, error: { code: 'XX000', message: 'internal detail' } },
  });
  r = await json(await accept.handleAcceptTrade(post(leagueBody()), { ...deps, rpc: broken.rpc }));
  check('database failure 500 hides detail', r.status === 500 && !r.body.error.includes('internal'));

  r = await json(await accept.handleAcceptTrade(post('{not json'), deps));
  check('bad JSON 400', r.status === 400);
  const get = await accept.handleAcceptTrade(post(null, 'GET'), deps);
  check('GET 405', get.status === 405);
  const opt = await accept.handleAcceptTrade(post(null, 'OPTIONS'), deps);
  check('OPTIONS preflight with CORS', opt.status === 200 && opt.headers.get('Access-Control-Allow-Origin') === '*');
}

// ---------------------------------------------------------------------------
// 4. commissioner-login
// ---------------------------------------------------------------------------
{
  const loginWith = (row) => fakeRpc({ commissioner_login: { data: [row], error: null } });
  const base = { secret: SECRET, nowSeconds: () => NOW, log: quiet };
  const body = { league_name: ' Sample League ', password: 'pw' };

  let db = loginWith({ status: 'OK', league_id: LEAGUE, league_name: 'Sample League', retry_after_seconds: null });
  let r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, rpc: db.rpc }));
  check('OK returns a session', r.status === 200 && r.body.session.leagueId === LEAGUE && typeof r.body.session.token === 'string');
  check('league name trimmed before lookup', db.calls[0].args.p_league_name === 'Sample League');
  const issued = await sessions.verifyCommissionerSession(r.body.session.token, SECRET, NOW + 1);
  check('issued token is for that league', issued.valid && issued.payload.leagueId === LEAGUE);

  db = loginWith({ status: 'BAD' });
  r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, rpc: db.rpc }));
  check('BAD 401', r.status === 401 && !('session' in r.body));

  db = loginWith({ status: 'LOCKED', retry_after_seconds: 612 });
  r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, rpc: db.rpc }));
  check('LOCKED 429 with retry', r.status === 429 && r.body.retryAfterSeconds === 612);

  db = loginWith({ status: 'NOT_SET' });
  r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, rpc: db.rpc }));
  check('NOT_SET 403', r.status === 403);

  db = loginWith({ status: 'UNKNOWN' });
  r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, rpc: db.rpc }));
  check('UNKNOWN 404', r.status === 404);

  db = loginWith({ status: 'OK', league_id: LEAGUE });
  r = await json(await handlers.handleCommissionerLogin(post({ league_name: 'x', password: '' }), { ...base, rpc: db.rpc }));
  check('empty password 400 without database call', r.status === 400 && db.calls.length === 0);
  r = await json(await handlers.handleCommissionerLogin(post({ league_name: 'x', password: 'p'.repeat(513) }), { ...base, rpc: db.rpc }));
  check('overlong password 400', r.status === 400 && db.calls.length === 0);

  r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, secret: undefined, rpc: db.rpc }));
  check('missing secret 500', r.status === 500 && db.calls.length === 0);

  db = fakeRpc({ commissioner_login: { data: null, error: { code: 'XX000', message: 'x' } } });
  r = await json(await handlers.handleCommissionerLogin(post(body), { ...base, rpc: db.rpc }));
  check('database error 500', r.status === 500);
}

// ---------------------------------------------------------------------------
// 5. session check, review-trade, audit log
// ---------------------------------------------------------------------------
{
  const { token } = await sessions.createCommissionerSession(SECRET, LEAGUE, NOW);
  const base = { secret: SECRET, nowSeconds: () => NOW + 10, log: quiet };

  let r = await json(await handlers.handleCommissionerSessionCheck(post({ token }), { ...base, rpc: fakeRpc({}).rpc }));
  check('session check OK', r.status === 200 && r.body.session.leagueId === LEAGUE);
  r = await json(await handlers.handleCommissionerSessionCheck(post({ token }), { ...base, nowSeconds: () => NOW + 1800, rpc: fakeRpc({}).rpc }));
  check('session check expired 401', r.status === 401 && r.body.reason === 'expired');
  r = await json(await handlers.handleCommissionerSessionCheck(post({ token, league_id: OTHER_LEAGUE }), { ...base, rpc: fakeRpc({}).rpc }));
  check('session for another league 403', r.status === 403);

  const reviewed = { trade_id: TRADE_ID, trade_number: 41, review_status: 'REVIEWED', current_revision: 0 };
  let db = fakeRpc({ review_league_trade: { data: [reviewed], error: null } });
  const review = (body, deps = {}) => handlers.handleReviewTrade(post({ token, trade_id: TRADE_ID, commissioner_name: 'Commish', ...body }), { ...base, rpc: db.rpc, ...deps });

  r = await json(await review({ action: 'review' }));
  check('REVIEW ok (action case-insensitive)', r.status === 200 && r.body.trade.reviewStatus === 'REVIEWED');
  check('review uses the token league, not the body', db.calls[0].args.p_league_id === LEAGUE && db.calls[0].args.p_action === 'REVIEW' && db.calls[0].args.p_trade === null);

  db = fakeRpc({ review_league_trade: { data: [reviewed], error: null } });
  r = await json(await review({ action: 'REVIEW', league_id: OTHER_LEAGUE }));
  check('review naming another league 403, no database call', r.status === 403 && db.calls.length === 0);

  r = await json(await review({ action: 'REVERSE' }));
  check('REVERSE without reason 400', r.status === 400 && db.calls.length === 0);
  r = await json(await review({ action: 'CORRECT', reason: 'Wrong pick' }));
  check('CORRECT without trade 400', r.status === 400 && db.calls.length === 0);
  r = await json(await review({ action: 'CORRECT', reason: 'Wrong pick', trade: snapshot({ web_release: 'v1.5.0' }) }));
  check('CORRECT with v1.5.0 snapshot 400', r.status === 400 && db.calls.length === 0);
  db = fakeRpc({ review_league_trade: { data: [reviewed], error: null } });
  r = await json(await review({ action: 'CORRECT', reason: 'Fix', trade: snapshot({ web_release: 'v2.1' }) }));
  check('CORRECT with v2.1 snapshot accepted', r.status === 200 && db.calls[0].args.p_trade.web_release === 'v2.1');
  r = await json(await review({ action: 'DELETE' }));
  check('unknown action 400', r.status === 400);
  r = await json(await review({ action: 'REVIEW', trade_id: '41' }));
  check('non-uuid trade 400', r.status === 400);
  r = await json(await review({ action: 'REVIEW', commissioner_name: '' }));
  check('missing commissioner name 400', r.status === 400);
  const callsBefore = db.calls.length;
  r = await json(await review({ action: 'REVERSE', reason: 'x'.repeat(501) }));
  check('reason over 500 400', r.status === 400 && db.calls.length === callsBefore);

  db = fakeRpc({ review_league_trade: { data: [{ ...reviewed, current_revision: 1 }], error: null } });
  r = await json(await review({ action: 'CORRECT', reason: 'Wrong pick', trade: { ...snapshot({ verdict: 'UNFAIR' }), league_name: 'leak' } }));
  check('CORRECT ok', r.status === 200 && r.body.trade.currentRevision === 1);
  check('correction snapshot trimmed to trade fields', db.calls[0].args.p_trade.verdict === 'UNFAIR' && !('league_name' in db.calls[0].args.p_trade));

  db = fakeRpc({ review_league_trade: { data: null, error: { code: 'P0002', message: 'Trade not found in this league.' } } });
  r = await json(await review({ action: 'REVIEW' }));
  check('trade in another league 404', r.status === 404 && r.body.error === 'Trade not found in this league.');

  db = fakeRpc({ review_league_trade: { data: null, error: { code: '22023', message: 'This trade has already been reversed.' } } });
  r = await json(await review({ action: 'REVERSE', reason: 'dup' }));
  check('already reversed 400', r.status === 400 && r.body.error === 'This trade has already been reversed.');

  r = await json(await handlers.handleReviewTrade(post({ trade_id: TRADE_ID, action: 'REVIEW', commissioner_name: 'C' }), { ...base, rpc: db.rpc }));
  check('review without token 401', r.status === 401 && r.body.reason === 'missing');

  const events = [{ occurred_at: 't', action: 'TRADE_REVIEWED', trade_number: 41, actor_role: 'COMMISSIONER', actor_name: 'Commish', reason: null, details: null }];
  db = fakeRpc({ league_audit_log: { data: events, error: null } });
  r = await json(await handlers.handleCommissionerAuditLog(post({ token }), { ...base, rpc: db.rpc }));
  check('audit log ok', r.status === 200 && r.body.events.length === 1 && r.body.events[0].actorName === 'Commish');
  check('audit log scoped to token league, default 200', db.calls[0].args.p_league_id === LEAGUE && db.calls[0].args.p_limit === 200);
  r = await json(await handlers.handleCommissionerAuditLog(post({ token, limit: 0 }), { ...base, rpc: db.rpc }));
  check('audit limit 0 rejected', r.status === 400);
  r = await json(await handlers.handleCommissionerAuditLog(post({ token: 'bad' }), { ...base, rpc: db.rpc }));
  check('audit log bad token 401', r.status === 401);
}

// ---------------------------------------------------------------------------
// 6. commissioner-teams (v2.1)
// ---------------------------------------------------------------------------
{
  const { token } = await sessions.createCommissionerSession(SECRET, LEAGUE, NOW);
  const base = { secret: SECRET, nowSeconds: () => NOW + 10, log: quiet };
  const teamRows = [{ team_id: TEAM_A, abbreviation: 'DAL', city_name: 'Dallas', nickname: 'Cowboys', division: 'NFC East', controlled_by: 'USER', owner_label: 'Owner1', updated_at: 't' }];

  let db = fakeRpc({ commissioner_league_teams: { data: teamRows, error: null } });
  let r = await json(await handlers.handleCommissionerTeams(post({ token }), { ...base, rpc: db.rpc }));
  check('teams: LIST is the default action', r.status === 200 && r.body.teams.length === 1 && r.body.teams[0].ownerLabel === 'Owner1' && r.body.teams[0].controlledBy === 'USER');
  check('teams: list uses the token league', db.calls[0].args.p_league_id === LEAGUE);

  r = await json(await handlers.handleCommissionerTeams(post({ action: 'LIST' }), { ...base, rpc: db.rpc }));
  check('teams: no token 401', r.status === 401);
  r = await json(await handlers.handleCommissionerTeams(post({ token, league_id: OTHER_LEAGUE }), { ...base, rpc: db.rpc }));
  check('teams: another league 403', r.status === 403);

  const updated = { team_id: TEAM_A, abbreviation: 'DAL', controlled_by: 'CPU', owner_label: null, changed: true };
  db = fakeRpc({ commissioner_update_team: { data: [updated], error: null } });
  const upd = (o) => handlers.handleCommissionerTeams(post({ token, action: 'update', team_id: TEAM_A, controlled_by: 'cpu', owner_label: '  ', commissioner_name: 'Commish', ...o }), { ...base, rpc: db.rpc });
  r = await json(await upd({}));
  check('teams: UPDATE (any case) ok', r.status === 200 && r.body.team.controlledBy === 'CPU' && r.body.team.changed === true);
  const a = db.calls[0].args;
  check('teams: update args (token league, CPU, blank label -> null, name)', a.p_league_id === LEAGUE && a.p_team_id === TEAM_A && a.p_controlled_by === 'CPU' && a.p_owner_label === null && a.p_commissioner_name === 'Commish');

  db = fakeRpc({ commissioner_update_team: { data: [updated], error: null } });
  r = await json(await upd({ controlled_by: 'Human', owner_label: 'New owner' }));
  check('teams: HUMAN means USER; label kept', db.calls[0].args.p_controlled_by === 'USER' && db.calls[0].args.p_owner_label === 'New owner');

  db = fakeRpc({ commissioner_update_team: { data: [updated], error: null } });
  r = await json(await upd({ controlled_by: 'robot' }));
  check('teams: bad control 400, no call', r.status === 400 && db.calls.length === 0);
  r = await json(await upd({ owner_label: 'x'.repeat(61) }));
  check('teams: long label 400', r.status === 400 && db.calls.length === 0);
  r = await json(await upd({ commissioner_name: '' }));
  check('teams: name required 400', r.status === 400 && db.calls.length === 0);
  r = await json(await upd({ team_id: 'DAL' }));
  check('teams: non-uuid team 400', r.status === 400 && db.calls.length === 0);
  r = await json(await handlers.handleCommissionerTeams(post({ token, action: 'DELETE' }), { ...base, rpc: db.rpc }));
  check('teams: unknown action 400', r.status === 400);

  db = fakeRpc({ commissioner_update_team: { data: null, error: { code: 'P0002', message: 'Team not found in this league.' } } });
  r = await json(await upd({}));
  check('teams: team in another league 404', r.status === 404 && r.body.error === 'Team not found in this league.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// Snallabot import receiver: path and body checks.
// Run from the repo root: node --experimental-strip-types tests/snallabot-import-logic.test.mjs
// Loads supabase/functions/snallabot-import/logic.ts unchanged, using the real
// request paths from the main-league capture (docs/roadmap/v5/capture-2026-11-21/).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const logic = await import(path.join(root, 'supabase/functions/snallabot-import/logic.ts'));
const { parseImportPath, validateBody, sha256Hex, statusForDatabaseError, KNOWN_ROUTE_PATTERN, MAX_BODY_BYTES } = logic;

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail); }
}

const SECRET = 'a'.repeat(48);
const base = `/functions/v1/snallabot-import/${SECRET}`;

// 1. Every captured path parses, with the capture's platform and league
const capture = fs.readFileSync(path.join(root, 'docs/roadmap/v5/capture-2026-11-21/request-paths.txt'), 'utf8')
  .split('\n').filter(Boolean)
  .map(line => line.replace('<receiver>/<secret>', base));
const parsed = capture.map(p => parseImportPath(p));
check('all 40 captured paths parse', parsed.length === 40 && parsed.every(r => r.ok), JSON.stringify(parsed.find(r => !r.ok)));
check('platform is pc', parsed.every(r => r.ok && r.value.platform === 'pc'));
check('league ID is 5481323', parsed.every(r => r.ok && r.value.externalLeagueId === 5481323));
check('secret is passed through unchanged', parsed.every(r => r.ok && r.value.secret === SECRET));
check('every captured route is a known route', parsed.every(r => r.ok && KNOWN_ROUTE_PATTERN.test(r.value.route)));
check('roster route kept whole', parsed[0].ok && parsed[0].value.route === 'team/776994846/roster');
check('weekly route kept whole', parsed.some(r => r.ok && r.value.route === 'week/reg/4/schedules'));

// 2. Path shapes the runtime may use, and bad paths
check('works without /functions/v1 prefix', parseImportPath(`/snallabot-import/${SECRET}/pc/5481323/standings`).ok);
check('trailing slash ignored', parseImportPath(`${base}/pc/5481323/leagueteams/`).ok);
check('wrong function name is 404', parseImportPath(`/functions/v1/other/${SECRET}/pc/5481323/standings`).status === 404);
check('no route is 404', parseImportPath(`${base}/pc/5481323`).status === 404);
check('short secret is 404', parseImportPath(`/functions/v1/snallabot-import/abc/pc/5481323/standings`).status === 404);
check('non-numeric league ID is 400', parseImportPath(`${base}/pc/abc/standings`).status === 400);
check('odd characters in route are 400', parseImportPath(`${base}/pc/5481323/stand%20ings`).status === 400);
check('upper-case platform normalized', parseImportPath(`${base}/PC/5481323/standings`).value?.platform === 'pc');
check('unknown but safe route still parses', parseImportPath(`${base}/pc/5481323/newroute`).ok && !KNOWN_ROUTE_PATTERN.test('newroute'));

// 3. Bodies
const standings = fs.readFileSync(path.join(root, 'docs/roadmap/v5/capture-2026-11-21/standings.json'), 'utf8');
const b = validateBody(standings);
check('captured standings body accepted', b.ok && Array.isArray(b.value.teamStandingInfoList) && b.value.teamStandingInfoList.length === 32);
check('byte length counted', b.ok && b.byteLength === Buffer.byteLength(standings));
check('empty body is 400', validateBody('').status === 400);
check('invalid JSON is 400', validateBody('{nope').status === 400);
check('JSON array is 400', validateBody('[1,2]').status === 400);
check('JSON string is 400', validateBody('"x"').status === 400);
check('oversized body is 413', validateBody('{"a":"' + 'x'.repeat(MAX_BODY_BYTES) + '"}').status === 413);

// 4. Hashing and error mapping
check('sha256 of "abc" matches the standard value',
  (await sha256Hex('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('sha256 is 64 lower-case hex', /^[0-9a-f]{64}$/.test(await sha256Hex(SECRET)));
check('P0002 maps to 404', statusForDatabaseError('P0002') === 404);
check('22023 maps to 403', statusForDatabaseError('22023') === 403);
check('other errors map to 500', statusForDatabaseError('XX000') === 500 && statusForDatabaseError(undefined) === 500);

console.log(`\n${pass} / ${pass + fail} PASS`);
process.exit(fail ? 1 : 0);

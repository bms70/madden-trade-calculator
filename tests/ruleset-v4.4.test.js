// Ruleset v4.4 regression checks.
// Run from the repo root: node tests/ruleset-v4.4.test.js
// Loads valuation.js unchanged into a sandbox that supplies the calculator
// "state" object, the same way calculator-ui.js does in the browser.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'valuation.js'), 'utf8');
const ctx = { state: { A: [], B: [] } };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.api={PICK_VALUES,TIMING,POS,baseValue,pickTiming,allowedTimings,totals,verdict,ovrValue,aging,control,fairnessScore,state};', ctx);
const api = ctx.api;

let id = 0;
const pick = (p, timing = 'Current draft') => ({ id: ++id, type: 'Draft Pick', pick: p, timing });
const player = (o) => ({ id: ++id, type: 'Player', name: '', cap: '', years: '', league: '', current: '', projected: '', ...o });

function run(A, B) {
  api.state.A = A; api.state.B = B;
  const a = api.totals('A'), b = api.totals('B');
  return { A: a, B: b, v: api.verdict(a, b) };
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail); }
}
const near = (x, y) => Math.abs(x - y) < 1e-9;
const V = api.PICK_VALUES;

// 1. First-round curve anchors
check('1.01 = 100', V['1.01'] === 100);
check('1.16 = 80', V['1.16'] === 80);
check('1.17 = 80', V['1.17'] === 80);
check('1.32 = 50', V['1.32'] === 50);
check('Top 7 hold value (1.07 >= 94)', V['1.07'] >= 94);

// 2. Curve is non-increasing from 1.01 to 1.32, then into round 2
const order = Object.keys(V).filter(k => !k.startsWith('Future'));
let mono = true;
for (let i = 1; i < order.length; i++) if (V[order[i]] > V[order[i - 1]]) mono = false;
check('Pick values never increase down the board', mono);
check('Round 2 sits below 1.32', V['Early 2nd'] < V['1.32']);

// 3. Future 1sts follow the new curve (1.05 / 1.13 / 1.24 / 1.14)
check('Future Early = 1.05', V['Future Early 1st'] === V['1.05']);
check('Future Mid = 1.13', V['Future Mid 1st'] === V['1.13']);
check('Future Late = 1.24', V['Future Late 1st'] === V['1.24']);
check('Future Unknown = 1.14', V['Future 1st - Unknown'] === V['1.14']);

// 4. Pick / timing pairing
check('Slot pick is current draft only', JSON.stringify(api.allowedTimings('1.05')) === '["Current draft"]');
check('Future 1st is next year or later', JSON.stringify(api.allowedTimings('Future Early 1st')) === '["Next year","Two years away"]');
check('Round 2-7 tiers allow all timings', api.allowedTimings('Mid 3rd').length === 3);
check('Future 1st set to Current draft is valued as Next year',
  near(api.baseValue(pick('Future Early 1st', 'Current draft')), 97.2 * 0.85));
check('Future 1st with blank timing is valued as Next year',
  near(api.baseValue(pick('Future Mid 1st', '')), 85.7 * 0.85));
check('Future 1st two years away is discounted once',
  near(api.baseValue(pick('Future Late 1st', 'Two years away')), 66 * 0.85 * 0.85));
check('Slot pick set to Two years away is valued as Current draft',
  near(api.baseValue(pick('1.05', 'Two years away')), 97.2));
check('Future Early 1st (next year) is worth less than current 1.05',
  api.baseValue(pick('Future Early 1st', 'Next year')) < api.baseValue(pick('1.05')));
check('Round 2 next year is discounted', near(api.baseValue(pick('Early 2nd', 'Next year')), 30 * 0.85));

// 5. Draft-only protection keyed to pick identity (5% window)
// Acquire 1.01 for 1.02 + 2nd: target 100 * 1.15 = 115, window 115-120.75.
let r = run([pick('1.01')], [pick('1.02'), pick('Early 2nd')]); // 99.7 + 27 = 126.7: above window
check('1.01 premium: above the 5% window is not FAIR', r.v.v !== 'FAIR' && r.v.favored === 'B', JSON.stringify(r.v));
r = run([pick('1.01')], [pick('1.02'), pick('Late 2nd')]); // 99.7 + 19.8 = 119.5: inside
check('1.01 premium: inside window is FAIR', r.v.v === 'FAIR', JSON.stringify(r.v));
// 1.03 for 1.06 + 3rd: target 99 * 1.08 = 106.92, window to 112.27
r = run([pick('1.03')], [pick('1.06'), pick('Late 3rd')]); // 96.2 + 9 = 105.2: short
check('1.03 premium uses 1.08x (short not FAIR, favors acquirer)', r.v.v !== 'FAIR' && r.v.favored === 'A', JSON.stringify(r.v));
r = run([pick('1.03')], [pick('1.06'), pick('Mid 3rd')]); // 96.2 + 11.7 = 107.9: inside
check('1.03 premium uses 1.08x (inside window FAIR)', r.v.v === 'FAIR', JSON.stringify(r.v));
// 1.04 is not a premium slot even though its value is above the old 77 threshold.
r = run([pick('1.04')], [pick('1.05')]);
check('1.04 for 1.05 alone is short of the 1.00x target', r.v.v !== 'FAIR', JSON.stringify(r.v));
r = run([pick('1.04')], [pick('1.05'), pick('7th')]); // 97.2 + 1.8 = 99.0, inside 98.2-103.11
check('1.04 for 1.05 + 7th is near-lateral (1.00x) FAIR', r.v.v === 'FAIR', JSON.stringify(r.v));
r = run([pick('1.04')], [pick('1.20'), pick('Early 3rd')]);
check('1.04 for 1.20 + Early 3rd is a meaningful trade-up, not FAIR', r.v.v !== 'FAIR', JSON.stringify(r.v));

// 6. Mixed premium-asset edge cases still behave
const eliteQB = player({ ovr: 92, age: 24, pos: 'QB', dev: 'X-Factor', cap: 8, years: 3 });
r = run([eliteQB], [pick('1.01')]);
check('Elite QB for one 1.01 is not FAIR (QB protection holds)', r.v.v !== 'FAIR', JSON.stringify({ A: r.A.adj, B: r.B.adj, v: r.v.v }));
r = run([eliteQB], [pick('1.20'), pick('1.25'), pick('Early 2nd'), pick('Mid 2nd')]);
check('Elite QB for a bundle of lesser picks is not FAIR', r.v.v !== 'FAIR', JSON.stringify({ A: r.A.adj, B: r.B.adj, v: r.v.v }));
const rookie = player({ ovr: 78, age: 22, pos: 'WR', dev: 'Star', cap: 2, years: 4, league: 0 });
check('Rookie (Year 0) still valued above zero', api.baseValue(rookie) > 0);

// 7. Positions
check('LT renamed to OT', api.POS.OT === 1.1 && api.POS.LT === undefined);
check('EDGE, CB, WR all 1.20', api.POS.EDGE === 1.2 && api.POS.CB === 1.2 && api.POS.WR === 1.2);

// 8. OVR star curve
check('OVR 90 keeps value 30', near(api.ovrValue(90), 30));
check('OVR 60 is zero', api.ovrValue(60) === 0 && api.ovrValue(55) === 0);
check('OVR 80 below linear (17.7)', Math.abs(api.ovrValue(80) - 17.7) < 0.05);
check('OVR 99 above linear (42.2)', Math.abs(api.ovrValue(99) - 42.2) < 0.05);
check('Marginal OVR value rises with OVR', (api.ovrValue(95) - api.ovrValue(94)) > (api.ovrValue(75) - api.ovrValue(74)));

// 9. Aging decay
const ag = (ovr, age) => api.aging({ ovr, age });
check('Under 80: age 30 untouched', ag(75, 30) === 1);
check('Under 80: age 31 = 0.90', Math.abs(ag(75, 31) - 0.90) < 0.005);
check('Under 80: age 35 = 0.59', Math.abs(ag(75, 35) - 0.59) < 0.005);
check('Under 80 now covers OVR 61-69', ag(65, 33) < 1);
check('80+: age 31 untouched', ag(88, 31) === 1);
check('80+: age 33 = 0.85 (firmer k = 0.08)', Math.abs(ag(88, 33) - 0.852) < 0.002);
check('80+: age 36 = 0.67', Math.abs(ag(88, 36) - 0.670) < 0.002);
check('Aging applies to X-Factor too', api.baseValue(player({ ovr: 90, age: 35, pos: 'QB', dev: 'X-Factor' })) < api.baseValue(player({ ovr: 90, age: 31, pos: 'QB', dev: 'X-Factor' })) * 0.82);

// 10. Contract control integral
const ctl = (years, cap = 1) => api.control({ years, cap, pos: 'WR' });
check('1 year = 1.00', ctl(1) === 1);
check('5 years = 1.34', near(ctl(5), 1.34));
check('Each extra year adds less than the one before', (ctl(3) - ctl(2)) < (ctl(2) - ctl(1)) && (ctl(7) - ctl(6)) < (ctl(6) - ctl(5)));
check('7 years now above 5 years', ctl(7) > ctl(5));
check('Expensive deal (0.80 cap tier) gets no control bonus', ctl(7, 40) === 1);
check('Blank years is neutral', near(api.control({ years: '', cap: 1, pos: 'WR' }), 1));

// 11. Verdicts measured from the FAIR window
// Even path (no eligible player: picks + zero-value player): 5% window.
const filler = () => player({ ovr: 55, age: 25, pos: 'WR', dev: 'Normal' });
r = run([pick('1.10'), filler()], [pick('1.10'), filler()]);
check('Even trade is FAIR with score 100', r.v.v === 'FAIR' && near(r.v.score, 100), JSON.stringify(r.v));
// Directional: Elite QB package P; counter at P (even swap) must now be LEAGUE-BREAKING, not QUESTIONABLE
api.state.A = [eliteQB]; api.state.B = [];
const P = api.totals('A').adj;
function counterAt(x) { // build a counter package of exactly x adjusted value using a fake pick value
  api.PICK_VALUES['__T'] = x;
  const out = run([eliteQB], [pick('__T')]);
  delete api.PICK_VALUES['__T'];
  return out;
}
r = counterAt(P);
check('Elite QB for an even swap is LEAGUE-BREAKING, favoring the QB side', r.v.v === 'LEAGUE-BREAKING' && r.v.favored === 'A', JSON.stringify(r.v));
r = counterAt(P * 1.30);
check('Elite QB at exactly 1.30x target is FAIR', r.v.v === 'FAIR', JSON.stringify(r.v));
r = counterAt(P * 1.30 * 1.05);
check('Elite QB at target x 1.05 is FAIR (inclusive)', r.v.v === 'FAIR', JSON.stringify(r.v));
r = counterAt(P * 1.30 * 1.05 * 1.01);
check('Just over the ceiling is QUESTIONABLE, not LEAGUE-BREAKING', r.v.v === 'QUESTIONABLE' && r.v.favored === 'B', JSON.stringify(r.v));
r = counterAt(P * 1.30 * 0.96);
check('4% short of target is QUESTIONABLE', r.v.v === 'QUESTIONABLE', JSON.stringify(r.v));
r = counterAt(P * 1.30 * 0.90);
check('10% short of target is UNFAIR', r.v.v === 'UNFAIR', JSON.stringify(r.v));
r = counterAt(P * 1.30 * 0.95);
check('Exactly 5% short is UNFAIR (lower bound inclusive)', r.v.v === 'UNFAIR', JSON.stringify(r.v));
r = counterAt(P * 1.30 * 0.85);
check('Exactly 15% short is LEAGUE-BREAKING', r.v.v === 'LEAGUE-BREAKING', JSON.stringify(r.v));

// 12. Fairness Score curve
check('Score 100 at window', api.fairnessScore(0) === 100);
check('Score ~84 at 5% outside', Math.abs(api.fairnessScore(0.05) - 84.0) < 0.1);
check('Score ~21 at 15% outside', Math.abs(api.fairnessScore(0.15) - 21.0) < 0.1);
check('Score never increases with distance', api.fairnessScore(0.2) < api.fairnessScore(0.1));

console.log(`\n${pass} / ${pass + fail} PASS`);
process.exit(fail ? 1 : 0);

# V5_BASELINE_MANIFEST_v4.4

Ruleset v5.0 roadmap, Phase 0. The frozen comparison baseline for all v5 work: **Ruleset v4.4 / Web Release v1.5.0**. Every v5 comparison, replay, shadow run and gate measures against these exact files.

| Item | Value |
|---|---|
| Release | Web Release **v1.5.0** / Ruleset **v4.4** (live since 2026-11-21) |
| Taken from | `main` at **`a0703dda5953e35b50a4b5ec193f0c5438f4569d`** ("Record league access and review decisions in v5 docs", 2026-11-21) |
| Tag | **`ruleset-v4.4-baseline`** (points at `a0703dd`) |
| Code release merge | `2c18370` — Merge Ruleset v4.4 / Web v1.5.0 (#20) |
| Reference docs merge | `82ebc60` — Merge v1.5.0 reference docs (#21) |
| Baseline files changed since `82ebc60` | **None** apart from adding the complete reference (files 2–3, PR #24). `git diff 82ebc60 a0703dd` otherwise touches only README and roadmap docs |
| Recorded | 2026-11-21 (America/Chicago) |

## Governed baseline

Hashes are of the files as stored in git (LF line endings, UTF-8 without BOM for text). The git blob ID is independent of checkout line endings, so it's the easier check on Windows (see Verifying).

| # | File | Role | Bytes | SHA-256 | Git blob | Last changed |
|---|---|---|---|---|---|---|
| 1 | `docs/rules/CANONICAL_RULESET_v4.4.md` | Canonical spec (authority) | 9037 | `7c153b3c31d32c6eb727536edd71e963fbfc2cc92ccee653233941636243dd9b` | `411d07e1932f2c03963fee2b8b7675549966f089` | `9c4d155` |
| 2 | `docs/rules/RULESET_v4.4_COMPLETE_REFERENCE.md` | Complete reference (record) | 15833 | `4e10e9b55d4edd3fdf28fbf764c484b6f1f693e90e80020ebeebad90bb9ac373` | `6064874a9aeef9ba9d93c7d90432d56f645687ea` | `10e34cf` |
| 3 | `docs/rules/Madden League Trade Calculator - Ruleset v4.4 Complete Reference.docx` | Complete reference, Word (record) | 22907 | `cc2bccc7f767209050bddb2d9b1deed7ec736c55b73776afd2554147f299d0f0` | `5114d81a646aed6fd6d844839e3cafd07e563d03` | `10e34cf` |
| 4 | `valuation.js` | Valuation engine (governed code) | 12926 | `cdd1c4f50305963d3ffe7af3db3958b2b5bb45d66ae07085e206934ffed6614e` | `656159c66f5199d74a0605cb8458a68962814e2e` | `9c4d155` |
| 5 | `calculator-ui.js` | Calculator UI and accepted-trade snapshot (`buildTradeSnapshot()`, labels `v1.5.0` / `v4.4`) | 18857 | `7f0052b6e4fd603b5d312e8e4b656ba9bc136491e98dc25bedb4ac8f75d5af17` | `4a21d381ec19a6135e492da4e32edabfb88cdb2a` | `9c4d155` |
| 6 | `reference/Madden League Trade Calculator v4.4.xlsx` | Excel reference implementation | 37691 | `d7e068139db46d1e4328d1f4f9aeefe9c9103368b3ba89da2446f177dc208cef` | `d2d3d9e5d898b19b7749cf3b9e4eee4609a81173` | `c9365c2` |
| 7 | `docs/rules/Madden League Trade Rules and Valuation Guide - Ruleset v4.4.docx` | Member guide | 41195 | `91a28157a5755806bb6f09878c65fc788ac30336b4a86f8c40ef839180439fad` | `6d1da539d13b781b16ab0e7c9d3e6d6e97a0b555` | `c9365c2` |
| 8 | `tests/ruleset-v4.4.test.js` | Ruleset regression | 9844 | `b8113e15dc711813004947d8b99ffcc494474233a04c2c775e4958d94ee7fdbd` | `202478dd2f99207a2d8562156fbb10ae80441cd8` | `9c4d155` |
| 9 | `tests/parity-scenarios-v4.4.json` | Excel/Web parity scenarios (16) | 3309 | `14c1485219cafd377cd54a5bb6e5c3d1683de1478679d8ac67e9e0ad812f2059` | `3ccf714c985e2e35365eb09550cd347e7d2a035b` | `c9365c2` |
| 10 | `supabase/functions/accept-trade/index.ts` | Accept-trade function (accepts v1.4.0/v4.2 and v1.5.0/v4.4) | 6788 | `512628ac46ba1b7ff23ab9001d44a202f578d2f3cd1246eaa9113a0531e54b20` | `0a2999f7d00612ca53b2d986eeca242dca5b57b7` | `6556987` |
| 11 | `supabase/functions/accept-trade/deno.json` | Accept-trade config | 136 | `a9a29da36c2576f755dd868b9f553a02afdf7d7bccf52e97e65c7f68cf36bfef` | `db206e8f4672a6a07efdc38f487de0ecfd3dee52` | `3f80100` |
| 12 | `supabase/functions/accept-trade/.npmrc` | Accept-trade config | 221 | `2cc495d5b8918533470e2666eccfcc0532a2a75699e8ad7c887163c83322ab55` | `48c6388638017e4edf6ef0263b42d4425fbb5adc` | `3f80100` |

## Supporting records

Not governed, but they document the baseline and should stay as they are.

| File | Bytes | SHA-256 |
|---|---|---|
| `docs/releases/RELEASE_NOTES_v1.5.0.md` | 4187 | `a64b09ca51c620011341f97802b81f0769f98538de76257880228aacf9f21ace` |
| `docs/validation/PARITY_REPORT_v1.5.0_RULESET_v4.4.md` | 4074 | `965fb30cfe97c247a83e11d5c9e2acde7c586d67c5e274998eb2040fa4246162` |
| `docs/validation/IMPACT_COMPARISON_v4.2_to_v4.4.md` | 2629 | `d6224fbc5cf72defe25ac3a3162bd6e1281f589a821a78f44f3e50661f6f918e` |

## Verification results

Run on 2026-11-21 at 22:20 America/Chicago against a clean checkout of `a0703dd`, Node v22.23.5.

| Check | Command | Result |
|---|---|---|
| Ruleset regression | `node tests/ruleset-v4.4.test.js` | **64 / 64 PASS**, exit code 0 |
| Web parity replay | Replay of all 16 scenarios in `tests/parity-scenarios-v4.4.json` through the unchanged `valuation.js`, compared with the web figures recorded in `PARITY_REPORT_v1.5.0_RULESET_v4.4.md` (adjusted package values to 4 dp, verdict, Fairness Score to 2 dp) | **16 / 16 PASS** |
| Excel parity | Recorded in the parity report: 16 / 16 PASS in LibreOffice | Not re-run. **Desktop Excel recalculation still pending sign-off** (risk R13) |
| Encoding | Text files are UTF-8 without BOM, LF line endings | OK |

The parity replay script used is in the appendix. It's a one-off check and isn't committed as a test; adding it to `tests/` would be a separate code PR.

## Verifying the baseline

From the repo root, on any later commit:

```bash
# Linux / macOS / Git Bash: compare SHA-256 against the table
sha256sum valuation.js calculator-ui.js docs/rules/CANONICAL_RULESET_v4.4.md

# Any platform, line-ending safe: compare git blob IDs against the table
git ls-files -s valuation.js calculator-ui.js docs/rules tests reference supabase/functions/accept-trade

# Everything governed is unchanged since the baseline if this prints nothing
git diff --stat ruleset-v4.4-baseline -- valuation.js calculator-ui.js docs/rules tests reference supabase/functions/accept-trade
```

Windows PowerShell (`Get-FileHash -Algorithm SHA256 .\valuation.js`) hashes the working copy. If GitHub Desktop checked text files out with CRLF line endings, text-file SHA-256 values won't match the table; use the git blob check or `git diff` above instead. Binary files (`.docx`, `.xlsx`) match either way.

## Rules while v5 is in progress

- Files 1–12 stay byte-for-byte unchanged until the Ruleset v5.0 release PR, except `calculator-ui.js` and `accept-trade`, which major releases (Web v2.0, v3.0, v4.0) will change for the snapshot contract. When that happens, the release PR records the new hashes in an addendum below and confirms that `valuation.js` and the regression and parity results are unchanged.
- `valuation.js` changes only in the Ruleset v5.0 release (Phase 9). The v5 candidate lives in its own engine file.
- Any PR touching a governed file states it in the description and re-runs the regression.

## Addenda

None yet.

## Appendix: parity replay script

```js
// Replays tests/parity-scenarios-v4.4.json through valuation.js (unchanged)
// and compares with the web figures recorded in the v1.5.0 parity report.
// Usage: node parity-replay.js <repo root>
const fs=require('fs'),path=require('path'),vm=require('vm');
const repo=process.argv[2];
const src=fs.readFileSync(path.join(repo,'valuation.js'),'utf8');
const ctx={state:{A:[],B:[]}};vm.createContext(ctx);
vm.runInContext(src+'\nthis.api={totals,verdict,state};',ctx);
const api=ctx.api;
const sc=JSON.parse(fs.readFileSync(path.join(repo,'tests/parity-scenarios-v4.4.json'),'utf8'));
const rep=fs.readFileSync(path.join(repo,'docs/validation/PARITY_REPORT_v1.5.0_RULESET_v4.4.md'),'utf8');
const rows={};
for(const l of rep.split('\n')){const c=l.split('|').map(s=>s.trim());
  if(c.length>8&&/\d+\.\d{4} \/ /.test(c[2])){const [a,b]=c[2].split(' / ').map(Number);rows[c[1]]={a,b,v:c[4],s:Number(c[6])};}}
let id=0,pass=0,fail=0;
const conv=x=>{const {t,...r}=x;const o={id:++id,type:t,name:'',...r};
  if(t==='Player'){for(const k of ['cap','years','league','current','projected'])if(o[k]===undefined)o[k]='';o.ovr=String(o.ovr);o.age=String(o.age);}
  else if(o.timing===undefined)o.timing='Current draft';return o;};
for(const s of sc){api.state.A=s.A.map(conv);api.state.B=s.B.map(conv);
  const A=api.totals('A'),B=api.totals('B'),v=api.verdict(A,B),r=rows[s.n];
  const ok=r&&Math.abs(A.adj-r.a)<5e-5&&Math.abs(B.adj-r.b)<5e-5&&v.v===r.v&&Math.abs(v.score-r.s)<5e-3;
  ok?pass++:fail++;
  console.log((ok?'PASS':'FAIL')+' '+s.n+' | '+A.adj.toFixed(4)+' / '+B.adj.toFixed(4)+' | '+v.v+' | '+v.score.toFixed(2));}
console.log(`\n${pass} / ${sc.length} PASS`);process.exit(fail?1:0);
```

## Addendum: Web Release v2.0 (2026-11-22)

Web v2.0 changes the snapshot contract. It does **not** change valuation. Ten of the twelve baseline files are byte-identical to the tag `ruleset-v4.4-baseline` (`git diff --quiet ruleset-v4.4-baseline -- <file>`): files 1–4, 6–9, 11 and 12, including `valuation.js`.

The two changed baseline files and the new files that carry `accept-trade` logic are recorded here. Hashes are for the files on `release/web-v2.0` when the release PR opened.

| # | File | Change | Bytes | SHA-256 | Git blob |
|---|---|---|---|---|---|
| 5 | `calculator-ui.js` | `web_release` `v2.0` (all other snapshot fields identical to v1.5.0; checked for all 16 parity scenarios); display-only team names; Submit to league; correction mode hooks | 21137 | `bcfeec35f823b9197b8c1360dc0efcf9d77c983b72e68e9e4a6f8bdbd3efb2b3` | `d1a23968ded52a54880c3311d4a29c934ed652e8` |
| 10 | `supabase/functions/accept-trade/index.ts` | Thin wiring; logic moved to the two files below. Accepts v2.0/v4.4 (league) and v1.5.0/v4.4 (switchover); refuses v1.4.0/v4.2 | 722 | `68125ba2a28d76f27adb8fd157ea1f68a48876cfcb05e9613354301505441cb0` | `6da1f4c4fc1eb678a594e226cb430d93ddc0879b` |
| 10a | `supabase/functions/accept-trade/handler.ts` | New: request handling | 3559 | `23265f20c80b7e60d31dc68226f716eedadd550d8eff7ba853a317c2c64598ba` | `6653c3ca026f27420fcc6892bba3bf99f490811a` |
| 10b | `supabase/functions/_shared/trade-validation.ts` | New: the v1.5.0 trade checks, unchanged, plus league fields and the accepted pairs | 7226 | `0479889d4227f582ef7878b19bde5c77053cc723ddfc685af55304b6c21375dc` | `f1dbf4602277b8be8d190ae11f17a7546d2b8c32` |
| 10c | `supabase/functions/_shared/http.ts` | New: shared HTTP helpers | 2212 | `3a5fcebdfad9ffb7c3ad06d17eb0b8958ffd44c2d6a5f82ebedf67b7ed140f77` | `0738172e9f441c9f4cabb1ee301a993cf52ad480` |

About a week after launch, a maintenance update removes `v1.5.0` from `trade-validation.ts` (runbook step 8). Record its new hash here when that update lands.

## Addendum: reference workbook pick-entry fix (2026-11-22)

File 6 changed. Valuation is unchanged: no constant, table value or rule changed. The 16 parity scenarios still match the web engine, 32 / 32 with picks entered as text and as numbers. Details: `docs/validation/PARITY_REPORT_v1.5.0_RULESET_v4.4.md`.

| # | File | Change | Bytes | SHA-256 | Git blob |
|---|---|---|---|---|---|
| 6 | `reference/Madden League Trade Calculator v4.4.xlsx` | Player / Pick cells formatted as Text; 15 formulas accept a pick stored as a number; pick drop-down | 37669 | `b8995a9137d15cf524be750576386bda9fed19c68a709ad00082a40a67d284d5` | `0c2399280a7781a01175a217e137f2a6f051842d` |

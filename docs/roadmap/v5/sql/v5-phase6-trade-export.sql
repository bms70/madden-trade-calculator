-- V5 Phase 6, part 1: export the league's logged trades for a v4.4 replay.
-- Run in the Supabase SQL editor (Explorer). Replace <LEAGUE NAME> with the
-- league name (kept out of this repo). Read only: changes nothing.
-- Result: one row, one cell (trades_json). Copy the cell and send it back.
-- Submitter names are left out; team abbreviations and Human/CPU are kept.
select json_agg(t order by t.trade_number) as trades_json
from (
    select
        tr.trade_number,
        tr.accepted_at,
        tr.web_release,
        tr.ruleset_version,
        tr.review_status,
        tr.is_pre_league,
        tr.current_revision,
        tr.reversal_reason,
        st.abbreviation as submitting_team,
        st.controlled_by as submitting_control,
        ot.abbreviation as other_team,
        ot.controlled_by as other_control,
        tr.user_team_assets,
        tr.cpu_team_assets,
        tr.user_adjusted_value,
        tr.cpu_adjusted_value,
        tr.adjusted_gap,
        tr.verdict,
        tr.evaluation_mode,
        tr.protection_tier,
        tr.suggested_correction,
        tr.posture,
        (select json_agg(json_build_object(
                    'revision', r.revision,
                    'role', r.created_by_role,
                    'reason', r.reason,
                    'verdict', r.verdict,
                    'web_release', r.web_release,
                    'user_team_assets', r.snapshot -> 'user_team_assets',
                    'cpu_team_assets', r.snapshot -> 'cpu_team_assets')
                order by r.revision)
           from public.trade_revisions r
          where r.trade_id = tr.id) as revisions
    from public.trades tr
    join public.leagues l on l.id = tr.league_id
    left join public.league_teams st on st.league_id = tr.league_id and st.id = tr.submitting_team_id
    left join public.league_teams ot on ot.league_id = tr.league_id and ot.id = tr.other_team_id
    where l.name_key = lower('<LEAGUE NAME>')
      and tr.deleted_at is null
) t;

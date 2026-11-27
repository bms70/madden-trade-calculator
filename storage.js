(function () {
  'use strict';

  const config = window.MADDEN_SUPABASE_CONFIG;

  function unavailable(message) {
    console.error(message);

    return Object.freeze({
      isConfigured: false,

      acceptTrade: async function () {
        return {
          ok: false,
          trade: null,
          error: message
        };
      },

      leagueLookup: async function () {
        return {
          ok: false,
          league: null,
          error: message
        };
      },

      leagueTeams: async function () {
        return {
          ok: false,
          teams: [],
          error: message
        };
      },

      submitLeagueTrade: async function () {
        return {
          ok: false,
          trade: null,
          error: message
        };
      },

      leagueHistory: async function () {
        return {
          ok: false,
          data: [],
          error: message
        };
      },

      leagueTradeRevisions: async function () {
        return {
          ok: false,
          revisions: [],
          error: message
        };
      },

      commissionerLogin: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      commissionerSessionCheck: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      reviewTrade: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      commissionerAuditLog: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      commissionerTeams: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      updateTeam: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      leaguePickChoices: async function () {
        return { ok: false, picks: [], currentDraftYear: null, error: message };
      },

      commissionerPicks: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      setPickOwner: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      draftComplete: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      commissionerSnapshots: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      markSnapshotCurrent: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      leaguePostureInputs: async function () {
        return { ok: false, rows: [], error: message };
      },

      commissionerActivity: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      markMoveHandled: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      playerCandidates: async function () {
        return { ok: false, data: null, error: message, status: null };
      },

      linkTradePlayer: async function () {
        return { ok: false, data: null, error: message, status: null };
      }
    });

  }

  if (
    !config ||
    typeof config.url !== 'string' ||
    typeof config.publishableKey !== 'string' ||
    !config.url.startsWith('https://') ||
    !config.publishableKey.startsWith('sb_publishable_')
  ) {
    window.MaddenStorage = unavailable(
      'Supabase browser configuration is missing or invalid.'
    );
    return;
  }

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== 'function'
  ) {
    window.MaddenStorage = unavailable(
      'Supabase browser library is unavailable.'
    );
    return;
  }

  const client = window.supabase.createClient(
    config.url,
    config.publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

  async function acceptTrade(snapshot) {
    try {
      const { data, error } = await client.functions.invoke(
        'accept-trade',
        {
          body: snapshot
        }
      );

      if (error) {
        let message =
          error.message ||
          'Trade could not be logged. No historical record was created.';

        if (
          error.context &&
          typeof error.context.json === 'function'
        ) {
          try {
            const details = await error.context.json();

            if (
              details &&
              typeof details.error === 'string'
            ) {
              message = details.error;
            }
          } catch {
            // Preserve the original function error message.
          }
        }

        console.error('Trade logging failed:', error);

        return {
          ok: false,
          trade: null,
          error: message
        };
      }

      if (
        !data ||
        data.ok !== true ||
        !data.trade ||
        !Number.isInteger(data.trade.tradeNumber)
      ) {
        console.error(
          'Trade logging returned an invalid response:',
          data
        );

        return {
          ok: false,
          trade: null,
          error:
            'Trade logging returned an invalid response. ' +
            'No success was recorded.'
        };
      }

      return {
        ok: true,
        trade: data.trade,
        error: null
      };
    } catch (error) {
      console.error('Trade logging connection failed:', error);

      return {
        ok: false,
        trade: null,
        error:
          'Trade could not be logged. ' +
          'No historical record was created.'
      };
    }
  }

  // --------------------------------------------------------------------------
  // Web v2.0 league mode. Knowing the league name is the access: the read
  // functions take the name, never an id (V5_WEB_V2.0_FUNCTIONS.md).
  // --------------------------------------------------------------------------

  const LEAGUE_UNAVAILABLE = 'League data is unavailable right now.';

  // { ok, league: { id, name, maddenVersion, currentDraftYear } | null }.
  // null = no such league. currentDraftYear null = picks aren't tracked.
  async function leagueLookup(name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: true, league: null, error: null };
    }

    try {
      const { data, error } = await client.rpc('league_lookup', {
        p_name: name.trim()
      });

      if (error) {
        console.error('League lookup failed:', error);
        return { ok: false, league: null, error: LEAGUE_UNAVAILABLE };
      }

      const row = Array.isArray(data) ? data[0] : null;

      if (!row) {
        return { ok: true, league: null, error: null };
      }

      return {
        ok: true,
        league: {
          id: row.league_id,
          name: row.league_name,
          maddenVersion: row.madden_version,
          currentDraftYear: typeof row.current_draft_year === 'number' ? row.current_draft_year : null
        },
        error: null
      };
    } catch (error) {
      console.error('League lookup connection failed:', error);
      return { ok: false, league: null, error: LEAGUE_UNAVAILABLE };
    }
  }

  // { ok, teams: [{ team_id, abbreviation, city_name, nickname, division, controlled_by }] }
  async function leagueTeams(name) {
    try {
      const { data, error } = await client.rpc('league_team_list', {
        p_name: String(name || '').trim()
      });

      if (error) {
        console.error('League team list failed:', error);
        return {
          ok: false,
          teams: [],
          error: 'The team list could not be loaded.'
        };
      }

      return {
        ok: true,
        teams: Array.isArray(data) ? data : [],
        error: null
      };
    } catch (error) {
      console.error('League team list connection failed:', error);
      return {
        ok: false,
        teams: [],
        error: 'The team list could not be loaded.'
      };
    }
  }

  // Web v3.0: the picks two teams own, for the "whose pick" choice. With
  // tradeId (a commissioner correction) the picks that trade moved are listed
  // with the team that gave them. { ok, currentDraftYear, picks: [{ pick_id,
  // draft_year, round, original_team_id, original_abbreviation, owner_team_id,
  // in_this_trade }] }
  async function leaguePickChoices(name, teamA, teamB, tradeId) {
    const failed = { ok: false, picks: [], currentDraftYear: null, error: 'Draft picks could not be loaded.' };
    try {
      const { data, error } = await client.rpc('league_pick_choices', {
        p_name: String(name || '').trim(),
        p_team_a: teamA,
        p_team_b: teamB,
        p_trade_id: tradeId || null
      });

      if (error) {
        console.error('Pick choices failed:', error);
        return failed;
      }

      const rows = Array.isArray(data) ? data : [];
      return {
        ok: true,
        currentDraftYear: rows.length ? rows[0].current_draft_year : null,
        picks: rows,
        error: null
      };
    } catch (error) {
      console.error('Pick choices connection failed:', error);
      return failed;
    }
  }

  // Web v4.0: each team's record from the current export, for the posture
  // FYI. { ok, rows: [{ team_id, abbreviation, wins, losses, ties, season,
  // stage_index, week, received_at, is_current }] }
  async function leaguePostureInputs(name) {
    try {
      const { data, error } = await client.rpc('league_posture_inputs', { p_name: String(name || '').trim() });
      if (error) {
        console.error('Posture inputs failed:', error);
        return { ok: false, rows: [], error: 'Team records could not be loaded.' };
      }
      return { ok: true, rows: Array.isArray(data) ? data : [], error: null };
    } catch (error) {
      console.error('Posture inputs connection failed:', error);
      return { ok: false, rows: [], error: 'Team records could not be loaded.' };
    }
  }

  // The v2.0 submission goes to accept-trade; the response shape is the same
  // as acceptTrade (plus trade.leagueName).
  async function submitLeagueTrade(submission) {
    return acceptTrade(submission);
  }

  // Active trades of one league, newest first. Rows keep the trades column
  // names (as v1.5.0 read them), with id = trade_id, plus review status,
  // submitter and the two team names.
  async function leagueHistory(name) {
    try {
      const { data, error } = await client.rpc('league_trade_history', {
        p_name: String(name || '').trim()
      });

      if (error) {
        console.error('League history retrieval failed:', error);
        return { ok: false, data: [], error: 'Trade History could not be loaded.' };
      }

      const rows = Array.isArray(data) ? data : [];

      return {
        ok: true,
        data: rows.map(row => Object.assign({ id: row.trade_id }, row)),
        error: null
      };
    } catch (error) {
      console.error('League history connection failed:', error);
      return { ok: false, data: [], error: 'Trade History could not be loaded.' };
    }
  }

  // Every revision of one trade (revision 0 = the original submission).
  async function leagueTradeRevisions(name, tradeId) {
    try {
      const { data, error } = await client.rpc('league_trade_revisions', {
        p_name: String(name || '').trim(),
        p_trade_id: tradeId
      });

      if (error) {
        console.error('Trade revision retrieval failed:', error);
        return { ok: false, revisions: [], error: 'The original submission could not be loaded.' };
      }

      return { ok: true, revisions: Array.isArray(data) ? data : [], error: null };
    } catch (error) {
      console.error('Trade revision connection failed:', error);
      return { ok: false, revisions: [], error: 'The original submission could not be loaded.' };
    }
  }

  // --------------------------------------------------------------------------
  // Web v2.0 commissioner functions (V5_WEB_V2.0_FUNCTIONS.md). The session
  // token is passed in by commissioner.js, which keeps it in memory only.
  // Every result is { ok, data, error, status }; status 401 = signed out.
  // --------------------------------------------------------------------------

  async function invokeFunction(name, body, fallback) {
    try {
      const { data, error } = await client.functions.invoke(name, { body });

      if (error) {
        let message = fallback;
        let status = null;
        let details = null;

        if (error.context) {
          status = typeof error.context.status === 'number' ? error.context.status : null;

          if (typeof error.context.json === 'function') {
            try {
              details = await error.context.json();
              if (details && typeof details.error === 'string') message = details.error;
            } catch {
              // Keep the fallback message.
            }
          }
        }

        return { ok: false, data: details, error: message, status };
      }

      if (!data || data.ok !== true) {
        return { ok: false, data: data || null, error: (data && data.error) || fallback, status: 200 };
      }

      return { ok: true, data, error: null, status: 200 };
    } catch (error) {
      console.error(`${name} connection failed:`, error);
      return { ok: false, data: null, error: fallback, status: null };
    }
  }

  // data.session = { token, expiresAt, leagueId, leagueName }
  function commissionerLogin(leagueName, password) {
    return invokeFunction(
      'commissioner-login',
      { league_name: leagueName, password },
      'Sign-in is unavailable right now.'
    );
  }

  // data.session = { leagueId, expiresAt }
  function commissionerSessionCheck(token, leagueId) {
    return invokeFunction(
      'commissioner-session-check',
      { token, league_id: leagueId },
      'Your commissioner session could not be checked.'
    );
  }

  // action REVIEW / CORRECT / REVERSE; trade = v2.0 snapshot for CORRECT.
  // data.trade = { id, tradeNumber, reviewStatus, currentRevision }
  function reviewTrade({ token, leagueId, tradeId, action, commissionerName, reason, trade }) {
    return invokeFunction(
      'review-trade',
      {
        token,
        league_id: leagueId,
        trade_id: tradeId,
        action,
        commissioner_name: commissionerName,
        reason: reason || null,
        trade: trade || null
      },
      'The trade could not be updated.'
    );
  }

  // data.events = [{ occurredAt, action, tradeNumber, actorRole, actorName, reason, details }]
  function commissionerAuditLog(token, leagueId) {
    return invokeFunction(
      'commissioner-audit-log',
      { token, league_id: leagueId },
      'The audit log could not be loaded.'
    );
  }

  // Web v2.1. data.teams = [{ teamId, abbreviation, cityName, nickname,
  // division, controlledBy, ownerLabel, updatedAt }]
  function commissionerTeams(token, leagueId) {
    return invokeFunction(
      'commissioner-teams',
      { token, league_id: leagueId, action: 'LIST' },
      'The team list could not be loaded.'
    );
  }

  // controlledBy 'USER' (human) or 'CPU'. data.team = { teamId, abbreviation,
  // controlledBy, ownerLabel, changed }
  function updateTeam({ token, leagueId, teamId, controlledBy, ownerLabel, commissionerName }) {
    return invokeFunction(
      'commissioner-teams',
      {
        token,
        league_id: leagueId,
        action: 'UPDATE',
        team_id: teamId,
        controlled_by: controlledBy,
        owner_label: ownerLabel || null,
        commissioner_name: commissionerName
      },
      'The team could not be updated.'
    );
  }

  // Web v3.0. data = { currentDraftYear, rolloverDue, latestSeason, picks: [{ pickId,
  // draftYear, round, originalTeamId, originalAbbreviation, ownerTeamId, ownerAbbreviation }] }
  function commissionerPicks(token, leagueId) {
    return invokeFunction(
      'commissioner-picks',
      { token, league_id: leagueId, action: 'LIST' },
      'The draft picks could not be loaded.'
    );
  }

  // data.pick = { pickId, ownerTeamId, ownerAbbreviation, changed }
  function setPickOwner({ token, leagueId, pickId, ownerTeamId, commissionerName }) {
    return invokeFunction(
      'commissioner-picks',
      { token, league_id: leagueId, action: 'SET_OWNER', pick_id: pickId, owner_team_id: ownerTeamId, commissioner_name: commissionerName },
      'The pick could not be updated.'
    );
  }

  // data.draft = { currentDraftYear, picksRetired, picksCreated }
  function draftComplete({ token, leagueId, expectedYear, commissionerName }) {
    return invokeFunction(
      'commissioner-picks',
      { token, league_id: leagueId, action: 'DRAFT_COMPLETE', expected_year: expectedYear, commissioner_name: commissionerName },
      "The draft couldn't be marked complete."
    );
  }

  // data.snapshots = [{ snapshotId, receivedAt, status, season, stageIndex, week,
  // rostersReceived, teamsInLeague, missingRosters, complete, players, freeAgents,
  // historyFailed, isCurrent }]
  function commissionerSnapshots(token, leagueId) {
    return invokeFunction(
      'commissioner-snapshots',
      { token, league_id: leagueId, action: 'LIST' },
      'The exports could not be loaded.'
    );
  }

  // data.snapshot = { snapshotId, season, week, changed }
  function markSnapshotCurrent({ token, leagueId, snapshotId, commissionerName }) {
    return invokeFunction(
      'commissioner-snapshots',
      { token, league_id: leagueId, action: 'MARK_CURRENT', snapshot_id: snapshotId, commissioner_name: commissionerName },
      "The export couldn't be marked current."
    );
  }

  // Web v4.0 League activity. data = { moves: [...], issues: [...] }
  function commissionerActivity(token, leagueId) {
    return invokeFunction('commissioner-activity', { token, league_id: leagueId, action: 'LIST' },
      'League activity could not be loaded.');
  }

  // data.move = { handled, changed }
  function markMoveHandled({ token, leagueId, rosterId, toSnapshotId, handled, note, commissionerName }) {
    return invokeFunction('commissioner-activity', {
      token, league_id: leagueId, action: 'MARK_HANDLED', roster_id: rosterId, to_snapshot_id: toSnapshotId,
      handled, note: note || null, commissioner_name: commissionerName
    }, 'The move could not be updated.');
  }

  // data.players = [{ rosterId, player, pos, ovr, age, team }]
  function playerCandidates({ token, leagueId, tradeId }) {
    return invokeFunction('commissioner-activity', { token, league_id: leagueId, action: 'CANDIDATES', trade_id: tradeId },
      'The players could not be loaded.');
  }

  // data.link = { assetRef, matchStatus, matchedPlayer, rosterId }
  function linkTradePlayer({ token, leagueId, tradeId, assetRef, rosterId, commissionerName }) {
    return invokeFunction('commissioner-activity', {
      token, league_id: leagueId, action: 'LINK_PLAYER', trade_id: tradeId, asset_ref: assetRef,
      roster_id: rosterId, commissioner_name: commissionerName
    }, 'The player could not be linked.');
  }

  window.MaddenStorage = Object.freeze({
    isConfigured: true,
    acceptTrade,
    leagueLookup,
    leagueTeams,
    submitLeagueTrade,
    leagueHistory,
    leagueTradeRevisions,
    commissionerLogin,
    commissionerSessionCheck,
    reviewTrade,
    commissionerAuditLog,
    commissionerTeams,
    updateTeam,
    leaguePickChoices,
    commissionerPicks,
    setPickOwner,
    draftComplete,
    commissionerSnapshots,
    markSnapshotCurrent,
    leaguePostureInputs,
    commissionerActivity,
    markMoveHandled,
    playerCandidates,
    linkTradePlayer
  });
})();
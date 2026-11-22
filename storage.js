(function () {
  'use strict';

  const config = window.MADDEN_SUPABASE_CONFIG;

  function unavailable(message) {
    console.error(message);

    return Object.freeze({
      isConfigured: false,

      getActiveTrades: async function () {
        return {
          ok: false,
          data: [],
          error: message
        };
      },

      acceptTrade: async function () {
        return {
          ok: false,
          trade: null,
          error: message
        };
      },

      adminLogin: async function () {
        return {
          ok: false,
          session: null,
          error: message
        };
      },

      deleteTrade: async function () {
        return {
          ok: false,
          deletion: null,
          error: message
        };
      },

      getAdminAuditLog: async function () {
        return {
          ok: false,
          auditEvents: [],
          deletedTrades: [],
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

  async function getActiveTrades() {
    try {
      const { data, error } = await client
        .from('trades')
        .select('*')
        .order('accepted_at', { ascending: false });

      if (error) {
        console.error('Active Trade retrieval failed:', error);

        return {
          ok: false,
          data: [],
          error: error.message || 'Active Trade retrieval failed.'
        };
      }

      return {
        ok: true,
        data: Array.isArray(data) ? data : [],
        error: null
      };
    } catch (error) {
      console.error('Supabase connection failed:', error);

      return {
        ok: false,
        data: [],
        error: 'Unable to connect to Trade History storage.'
      };
    }
  }

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

async function adminLogin(password){
  if(typeof password!=='string'||password.length===0){
    return {
      ok:false,
      session:null,
      error:'Access denied.'
    };
  }

  try{
    const {data,error}=await client.functions.invoke(
      'admin-login',
      {
        body:{
          password
        }
      }
    );

    if(error){
      let message='Access denied.';

      if(
        error.context&&
        typeof error.context.json==='function'
      ){
        try{
          const details=await error.context.json();

          if(
            details&&
            typeof details.error==='string'
          ){
            message=details.error;
          }
        }catch{
          // Keep the generic access failure.
        }
      }

      return {
        ok:false,
        session:null,
        error:message
      };
    }

    if(
      !data||
      data.ok!==true||
      !data.session||
      typeof data.session.token!=='string'||
      data.session.token.length===0||
      typeof data.session.expiresAt!=='string'
    ){
      console.error(
        'Admin login returned an invalid response.',
        data
      );

      return {
        ok:false,
        session:null,
        error:'Administrative access is unavailable.'
      };
    }

    const expirationTime=Date.parse(
      data.session.expiresAt
    );

    if(
      !Number.isFinite(expirationTime)||
      expirationTime<=Date.now()
    ){
      console.error(
        'Admin login returned an invalid expiration.'
      );

      return {
        ok:false,
        session:null,
        error:'Administrative access is unavailable.'
      };
    }

    return {
      ok:true,
      session:{
        token:data.session.token,
        expiresAt:data.session.expiresAt
      },
      error:null
    };

  }catch(error){
    console.error(
      'Admin login connection failed:',
      error
    );

    return {
      ok:false,
      session:null,
      error:'Administrative access is unavailable.'
    };
  }
}

async function deleteTrade({
  token,
  tradeId,
  administratorName,
  reason
}){
  try{
    const {data,error}=await client.functions.invoke(
      'delete-trade',
      {
        body:{
          token,
          tradeId,
          administratorName,
          reason
        }
      }
    );

    if(error){
      let message='The Trade could not be deleted.';

      if(
        error.context&&
        typeof error.context.json==='function'
      ){
        try{
          const details=await error.context.json();

          if(
            details&&
            typeof details.error==='string'
          ){
            message=details.error;
          }
        }catch{
          // Preserve the generic deletion failure.
        }
      }

      console.error(
        'Protected Trade deletion failed:',
        error
      );

      return {
        ok:false,
        deletion:null,
        error:message
      };
    }

    if(
      !data||
      data.ok!==true||
      !data.deletion||
      typeof data.deletion.tradeId!=='string'||
      !Number.isInteger(data.deletion.tradeNumber)||
      typeof data.deletion.deletedAt!=='string'||
      typeof data.deletion.auditEventId!=='string'||
      typeof data.deletion.auditOccurredAt!=='string'
    ){
      console.error(
        'Trade deletion returned an invalid response:',
        data
      );

      return {
        ok:false,
        deletion:null,
        error:'The Trade deletion result was invalid.'
      };
    }

    return {
      ok:true,
      deletion:data.deletion,
      error:null
    };

  }catch(error){
    console.error(
      'Trade deletion connection failed:',
      error
    );

    return {
      ok:false,
      deletion:null,
      error:'The Trade could not be deleted.'
    };
  }
}

async function getAdminAuditLog(token){
  try{
    const {data,error}=await client.functions.invoke(
      'admin-audit-log',
      {
        body:{
          token
        }
      }
    );

    if(error){
      let message='Audit Log could not be loaded.';

      if(
        error.context&&
        typeof error.context.json==='function'
      ){
        try{
          const details=await error.context.json();

          if(
            details&&
            typeof details.error==='string'
          ){
            message=details.error;
          }
        }catch{
          // Preserve the generic Audit Log failure.
        }
      }

      console.error(
        'Protected Audit Log retrieval failed:',
        error
      );

      return {
        ok:false,
        auditEvents:[],
        deletedTrades:[],
        error:message
      };
    }

    if(
      !data||
      data.ok!==true||
      !Array.isArray(data.auditEvents)||
      !Array.isArray(data.deletedTrades)
    ){
      console.error(
        'Audit Log returned an invalid response:',
        data
      );

      return {
        ok:false,
        auditEvents:[],
        deletedTrades:[],
        error:'Audit Log returned an invalid response.'
      };
    }

    return {
      ok:true,
      auditEvents:data.auditEvents,
      deletedTrades:data.deletedTrades,
      error:null
    };

  }catch(error){
    console.error(
      'Audit Log connection failed:',
      error
    );

    return {
      ok:false,
      auditEvents:[],
      deletedTrades:[],
      error:'Audit Log could not be loaded.'
    };
  }
}

  // --------------------------------------------------------------------------
  // Web v2.0 league mode. Knowing the league name is the access: the read
  // functions take the name, never an id (V5_WEB_V2.0_FUNCTIONS.md).
  // --------------------------------------------------------------------------

  const LEAGUE_UNAVAILABLE = 'League data is unavailable right now.';

  // { ok, league: { id, name, maddenVersion } | null }. null = no such league.
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
          maddenVersion: row.madden_version
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

  // The v2.0 submission goes to accept-trade; the response shape is the same
  // as acceptTrade (plus trade.leagueName).
  async function submitLeagueTrade(submission) {
    return acceptTrade(submission);
  }

  // Active trades of one league, newest first. Rows keep the trades column
  // names (as getActiveTrades does), with id = trade_id, plus review status,
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

  window.MaddenStorage = Object.freeze({
    isConfigured: true,
    getActiveTrades,
    acceptTrade,
    adminLogin,
    deleteTrade,
    getAdminAuditLog,
    leagueLookup,
    leagueTeams,
    submitLeagueTrade,
    leagueHistory,
    leagueTradeRevisions
  });
})();
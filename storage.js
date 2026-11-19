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

  window.MaddenStorage = Object.freeze({
    isConfigured: true,
    getActiveTrades,
    acceptTrade
  });
})();
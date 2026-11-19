(function () {
  'use strict';

  const config = window.MADDEN_SUPABASE_CONFIG;

  if (
    !config ||
    typeof config.url !== 'string' ||
    typeof config.publishableKey !== 'string' ||
    !config.url.startsWith('https://') ||
    !config.publishableKey.startsWith('sb_publishable_')
  ) {
    console.error('Supabase browser configuration is missing or invalid.');
    window.MaddenStorage = Object.freeze({
      isConfigured: false,
      getActiveTrades: async function () {
        return {
          ok: false,
          data: [],
          error: 'Storage is not configured.'
        };
      }
    });
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase browser library did not load.');
    window.MaddenStorage = Object.freeze({
      isConfigured: false,
      getActiveTrades: async function () {
        return {
          ok: false,
          data: [],
          error: 'Storage library is unavailable.'
        };
      }
    });
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

  window.MaddenStorage = Object.freeze({
    isConfigured: true,
    getActiveTrades
  });
})();
// Edge Function para retornar configuração do OneSignal
// NOTA: Esta função não é mais necessária pois o appId está hardcoded no frontend
// Mantida apenas para compatibilidade

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AppId correto do OneSignal
const ONESIGNAL_APP_ID = 'd8e46df0-d54d-459f-b79d-6e0a36bffdb8';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Retorna o appId (pode ser expandido no futuro com mais configs)
    return new Response(
      JSON.stringify({ 
        appId: ONESIGNAL_APP_ID,
        success: true 
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        } 
      }
    );
  } catch (error) {
    console.error('Error in onesignal-config:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        success: false 
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        } 
      }
    );
  }
});
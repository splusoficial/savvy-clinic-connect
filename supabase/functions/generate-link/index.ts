import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lista de domínios permitidos
const allowedOrigins = new Set<string>([
  'https://go.secretariaplus.com.br',
  'https://savvy-clinic-connect.lovable.app', // pode remover depois de migrar totalmente
  'http://localhost:5173',
  'http://localhost:4173',
]);

// Utilitário simples
function jsonResponse(body: any, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
}

Deno.serve(async (req) => {
  // CORS dinâmico baseado na origem
  const origin = req.headers.get('origin') || '';
  const dynamicCorsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: dynamicCorsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Parâmetros existentes (mantidos para compatibilidade)
    const email = url.searchParams.get('email');
    const name = url.searchParams.get('name') || undefined;
    const wh_id = url.searchParams.get('wh_id') || undefined;
    const inst = url.searchParams.get('inst') || undefined;
    const redirectTo = url.searchParams.get('redirect_to') || undefined;
    const mode = url.searchParams.get('mode') || 'redirect'; // 'redirect' | 'json'

    // Novos parâmetros para o fluxo de instalação
    const flow = url.searchParams.get('flow'); // 'create-install' | 'exchange-install'
    const code = url.searchParams.get('code') || undefined;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return jsonResponse({ error: 'Servidor sem configuração do Supabase' }, 500, dynamicCorsHeaders);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Fluxo para criar o código de instalação
    if (flow === 'create-install') {
      if (!email) {
        return jsonResponse({ error: 'email é obrigatório' }, 400, dynamicCorsHeaders);
      }

      // Garante que o usuário exista e obtemos seu id
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });

      if (linkError || !linkData?.user) {
        console.error('generateLink error (create-install)', linkError);
        return jsonResponse({ error: linkError?.message || 'Falha ao preparar usuário' }, 500, dynamicCorsHeaders);
      }

      const user = linkData.user;
      const codeToUse = crypto.randomUUID();

      // Upsert perfil público (tabela users) — opcional, mas mantém os metadados sincronizados
      const upsertPayload = {
        id: user.id,
        email,
        name: name ?? (user.user_metadata?.name as string | undefined) ?? null,
        wh_id: wh_id ?? null,
        inst: inst ?? null,
      } as const;

      const { error: upsertError } = await admin.from('users').upsert(upsertPayload, { onConflict: 'id' });
      if (upsertError) {
        console.error('users upsert error (create-install)', upsertError);
      }

      // Cria registro do código de instalação (one-time)
      const metadata: Record<string, unknown> = {};
      if (name) metadata.name = name;
      if (wh_id) metadata.wh_id = wh_id;
      if (inst) metadata.inst = inst;

      const { error: insertError } = await admin
        .from('auth_install_codes')
        .insert({
          code: codeToUse,
          user_id: user.id,
          email,
          metadata: Object.keys(metadata).length ? metadata : null,
        });

      if (insertError) {
        console.error('auth_install_codes insert error', insertError);
        return jsonResponse({ error: 'Falha ao gerar código de instalação' }, 500, dynamicCorsHeaders);
      }

      // Retorna o code para o cliente fixar na URL antes de instalar
      return jsonResponse({ ok: true, code: codeToUse, email }, 200, dynamicCorsHeaders);
    }

    // 2) Fluxo para trocar o código por um email_otp (para login direto no PWA)
    if (flow === 'exchange-install') {
      if (!code) {
        return jsonResponse({ error: 'code é obrigatório' }, 400, dynamicCorsHeaders);
      }

      // Busca o registro do código
      const { data: rows, error: codeErr } = await admin
        .from('auth_install_codes')
        .select('code, email, user_id, created_at, expires_at, used_at')
        .eq('code', code)
        .limit(1);

      if (codeErr) {
        console.error('select auth_install_codes error', codeErr);
        return jsonResponse({ error: 'Erro ao validar código' }, 500, dynamicCorsHeaders);
      }

      const row = rows?.[0];
      if (!row) {
        return jsonResponse({ error: 'Código inválido' }, 400, dynamicCorsHeaders);
      }
      if (row.used_at) {
        return jsonResponse({ error: 'Código já utilizado' }, 400, dynamicCorsHeaders);
      }
      if (row.expires_at && new Date(row.expires_at) <= new Date()) {
        return jsonResponse({ error: 'Código expirado' }, 400, dynamicCorsHeaders);
      }

      // Gera um novo magic link e usa o email_otp retornado para login direto
      const { data: linkData2, error: linkError2 } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: row.email,
        options: { redirectTo },
      });

      const emailOtp = (linkData2?.properties as any)?.email_otp as string | undefined;
      if (linkError2 || !linkData2?.user || !emailOtp) {
        console.error('generateLink error (exchange-install)', linkError2, 'email_otp:', !!emailOtp);
        return jsonResponse({ error: linkError2?.message || 'Falha ao gerar OTP' }, 500, dynamicCorsHeaders);
      }

      // Marca o código como utilizado
      const { error: usedErr } = await admin
        .from('auth_install_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code', code);

      if (usedErr) {
        console.error('auth_install_codes update used_at error', usedErr);
        // Ainda retornamos o OTP, mas logamos o erro
      }

      return jsonResponse({
        ok: true,
        email: row.email,
        email_otp: emailOtp,
      }, 200, dynamicCorsHeaders);
    }

    // 3) Comportamento original (mantido): gerar link e redirecionar ou retornar JSON
    if (!email) {
      return jsonResponse({ error: 'email é obrigatório' }, 400, dynamicCorsHeaders);
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    const actionLink = linkData?.properties?.action_link as string | undefined;
    if (linkError || !linkData?.user || !actionLink) {
      console.error('generateLink error', linkError);
      return jsonResponse({ error: linkError?.message || 'Falha ao gerar magic link' }, 500, dynamicCorsHeaders);
    }

    const user = linkData.user;

    const upsertPayload = {
      id: user.id,
      email,
      name: name ?? (user.user_metadata?.name as string | undefined) ?? null,
      wh_id: wh_id ?? null,
      inst: inst ?? null,
    } as const;

    const { error: upsertError } = await admin.from('users').upsert(upsertPayload, { onConflict: 'id' });
    if (upsertError) {
      console.error('users upsert error', upsertError);
    }

    if (mode === 'json') {
      const emailOtp = (linkData?.properties as any)?.email_otp as string | undefined;
      return jsonResponse({
        ok: true,
        email,
        user_id: user.id,
        action_link: actionLink,
        email_otp: emailOtp ?? null,
        created: !!user?.created_at,
      }, 200, dynamicCorsHeaders);
    }

    return new Response(null, {
      status: 302,
      headers: { Location: actionLink, ...dynamicCorsHeaders },
    });
  } catch (e) {
    console.error('Unhandled error', e);
    return jsonResponse({ error: 'Erro inesperado' }, 500, dynamicCorsHeaders);
  }
});
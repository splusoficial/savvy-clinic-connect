import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lista de domínios permitidos
const allowedOrigins = new Set<string>([
  'https://go.secretariaplus.com.br',
  'https://savvy-clinic-connect.lovable.app',
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

    // Parâmetros existentes
    const email = url.searchParams.get('email');
    const name = url.searchParams.get('name') || undefined;
    const wh_id = url.searchParams.get('wh_id') || undefined;
    const inst = url.searchParams.get('inst') || undefined;
    const redirectTo = url.searchParams.get('redirect_to') || undefined;
    const mode = url.searchParams.get('mode') || 'redirect';

    // Parâmetros do fluxo de instalação
    const flow = url.searchParams.get('flow');
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

      // Garante que o usuário exista
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

      // NOVO: Primeiro, verifica se já existe um código válido e reutilizável para este usuário
      const { data: existingCodes, error: searchError } = await admin
        .from('auth_install_codes')
        .select('code, created_at, expires_at, used_at, use_count, device_info')
        .eq('user_id', user.id)
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!searchError && existingCodes && existingCodes.length > 0) {
        const existingCode = existingCodes[0];
        
        // Verifica se o código ainda é válido para reutilização
        const now = new Date();
        const createdAt = new Date(existingCode.created_at);
        const expiresAt = existingCode.expires_at ? new Date(existingCode.expires_at) : null;
        const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        
        // Reutiliza o código se:
        // - Foi criado há menos de 7 dias
        // - Não expirou (ou não tem data de expiração)
        // - Foi usado menos de 10 vezes (para permitir múltiplas reinstalações)
        const useCount = existingCode.use_count || 0;
        const canReuse = ageInDays < 7 && 
                        (!expiresAt || expiresAt > now) && 
                        useCount < 10;

        if (canReuse) {
          console.log('[create-install] Reutilizando código existente:', existingCode.code);
          
          // Atualiza metadata se houver novos dados
          const metadata: Record<string, unknown> = {};
          if (name) metadata.name = name;
          if (wh_id) metadata.wh_id = wh_id;
          if (inst) metadata.inst = inst;

          // Atualiza o registro para refletir a tentativa de reinstalação
          await admin
            .from('auth_install_codes')
            .update({
              metadata: Object.keys(metadata).length ? metadata : null,
              last_used_at: new Date().toISOString(),
              device_info: { 
                ...((existingCode.device_info as any) || {}),
                reinstall_attempt: true,
                reinstall_at: new Date().toISOString()
              }
            })
            .eq('code', existingCode.code);

          return jsonResponse({ 
            ok: true, 
            code: existingCode.code, 
            email,
            reused: true 
          }, 200, dynamicCorsHeaders);
        }
      }

      // Se não pode reutilizar, cria um novo código
      const codeToUse = crypto.randomUUID();

      // Upsert perfil público
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

      // Cria novo registro do código
      const metadata: Record<string, unknown> = {};
      if (name) metadata.name = name;
      if (wh_id) metadata.wh_id = wh_id;
      if (inst) metadata.inst = inst;

      // Define expiração mais longa (30 dias ao invés de 30 minutos)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: insertError } = await admin
        .from('auth_install_codes')
        .insert({
          code: codeToUse,
          user_id: user.id,
          email,
          metadata: Object.keys(metadata).length ? metadata : null,
          expires_at: expiresAt.toISOString(),
          max_uses: 10, // Permite até 10 usos
          use_count: 0,
        });

      if (insertError) {
        console.error('auth_install_codes insert error', insertError);
        return jsonResponse({ error: 'Falha ao gerar código de instalação' }, 500, dynamicCorsHeaders);
      }

      return jsonResponse({ 
        ok: true, 
        code: codeToUse, 
        email,
        reused: false 
      }, 200, dynamicCorsHeaders);
    }

    // 2) Fluxo para trocar o código por um email_otp
    if (flow === 'exchange-install') {
      if (!code) {
        return jsonResponse({ error: 'code é obrigatório' }, 400, dynamicCorsHeaders);
      }

      // Busca o registro do código
      const { data: rows, error: codeErr } = await admin
        .from('auth_install_codes')
        .select('code, email, user_id, created_at, expires_at, used_at, use_count, max_uses')
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

      // MODIFICADO: Permite múltiplos usos do mesmo código
      const useCount = row.use_count || 0;
      const maxUses = row.max_uses || 1;
      
      // Verifica se excedeu o limite de usos
      if (useCount >= maxUses) {
        console.log(`[exchange-install] Código ${code} excedeu limite de usos: ${useCount}/${maxUses}`);
        // Ainda permite se foi usado há menos de 7 dias
        const lastUsed = row.used_at ? new Date(row.used_at) : null;
        const now = new Date();
        if (lastUsed) {
          const daysSinceLastUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastUse > 7) {
            return jsonResponse({ error: 'Código expirado. Por favor, solicite um novo link.' }, 400, dynamicCorsHeaders);
          }
        }
      }

      // Verifica expiração
      if (row.expires_at && new Date(row.expires_at) <= new Date()) {
        return jsonResponse({ error: 'Código expirado' }, 400, dynamicCorsHeaders);
      }

      // Gera novo magic link para o email
      const { data: linkData2, error: linkError2 } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: row.email,
        options: { redirectTo },
      });

      const emailOtp = (linkData2?.properties as any)?.email_otp as string | undefined;
      if (linkError2 || !linkData2?.user || !emailOtp) {
        console.error('generateLink error (exchange-install)', linkError2);
        return jsonResponse({ error: linkError2?.message || 'Falha ao gerar OTP' }, 500, dynamicCorsHeaders);
      }

      // Atualiza o contador de uso (mas não bloqueia futuras utilizações)
      const { error: updateErr } = await admin
        .from('auth_install_codes')
        .update({ 
          used_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
          use_count: useCount + 1,
          devices_info: admin.sql`
            COALESCE(devices_info, '[]'::jsonb) || 
            ${JSON.stringify([{
              used_at: new Date().toISOString(),
              user_agent: req.headers.get('user-agent') || 'unknown',
              ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
            }])}::jsonb
          `
        })
        .eq('code', code);

      if (updateErr) {
        console.error('auth_install_codes update error', updateErr);
        // Não falha a operação, apenas loga o erro
      }

      console.log(`[exchange-install] Código ${code} usado com sucesso (uso ${useCount + 1}/${maxUses})`);

      return jsonResponse({
        ok: true,
        email: row.email,
        email_otp: emailOtp,
        use_count: useCount + 1,
        max_uses: maxUses
      }, 200, dynamicCorsHeaders);
    }

    // 3) Comportamento original (para compatibilidade)
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
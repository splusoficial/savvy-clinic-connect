
-- Extensão para gen_random_uuid (normalmente já está ativa, mas garantimos)
create extension if not exists pgcrypto;

-- Tabela para armazenar códigos de instalação (one-time), sem FK para auth.users
create table if not exists public.auth_install_codes (
  code uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at timestamptz
);

-- Habilita RLS (por padrão, bloqueia tudo para o cliente)
alter table public.auth_install_codes enable row level security;

-- Índices úteis
create index if not exists auth_install_codes_expires_idx on public.auth_install_codes (expires_at);
create index if not exists auth_install_codes_email_idx on public.auth_install_codes (email);

-- Validação com trigger: garante que expires_at não fique no passado
create or replace function public.ensure_auth_install_code_not_expired()
returns trigger as $$
begin
  if NEW.expires_at <= now() then
    NEW.expires_at := now() + interval '30 minutes';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_auth_install_codes_expiration on public.auth_install_codes;
create trigger trg_auth_install_codes_expiration
before insert on public.auth_install_codes
for each row
execute procedure public.ensure_auth_install_code_not_expired();

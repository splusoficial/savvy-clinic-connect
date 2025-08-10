
-- 1) Tabela de usuários de app (vinculada a auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text not null unique,
  wh_id text,
  inst text,
  created_at timestamptz not null default now()
);

-- 2) Habilitar RLS
alter table public.users enable row level security;

-- 3) Políticas RLS (cada usuário só enxerga e altera seu próprio registro)
create policy "Users can view own profile"
on public.users
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Inserção própria (caso algum fluxo cliente precise criar o próprio registro)
create policy "Users can insert own profile"
on public.users
for insert
to authenticated
with check (auth.uid() = id);

-- 4) Índice auxiliar por wh_id (para buscas administrativas/integrações)
create index if not exists users_wh_id_idx on public.users (wh_id);

-- Create table to link OneSignal player IDs to authenticated users
create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  onesignal_player_id text not null,
  platform text,
  device_os text,
  browser text,
  subscribed boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (onesignal_player_id)
);

-- Helpful index
create index if not exists idx_user_push_subscriptions_user_id on public.user_push_subscriptions(user_id);

-- Enable RLS
alter table public.user_push_subscriptions enable row level security;

-- Recreate policies safely
drop policy if exists "Users can view their own push subscriptions" on public.user_push_subscriptions;
drop policy if exists "Users can insert their own push subscriptions" on public.user_push_subscriptions;
drop policy if exists "Users can update their own push subscriptions" on public.user_push_subscriptions;
drop policy if exists "Users can delete their own push subscriptions" on public.user_push_subscriptions;

create policy "Users can view their own push subscriptions"
  on public.user_push_subscriptions
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own push subscriptions"
  on public.user_push_subscriptions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own push subscriptions"
  on public.user_push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on public.user_push_subscriptions
  for delete
  using (auth.uid() = user_id);

-- Standard updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Recreate trigger safely
drop trigger if exists trg_user_push_subscriptions_updated_at on public.user_push_subscriptions;
create trigger trg_user_push_subscriptions_updated_at
before update on public.user_push_subscriptions
for each row execute function public.update_updated_at_column();
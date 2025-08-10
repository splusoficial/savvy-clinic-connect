-- Harden ensure_auth_install_code_not_expired search_path per linter
create or replace function public.ensure_auth_install_code_not_expired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.expires_at <= now() then
    NEW.expires_at := now() + interval '30 minutes';
  end if;
  return NEW;
end;
$$;
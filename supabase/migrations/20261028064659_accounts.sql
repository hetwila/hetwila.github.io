-- Account data is independent of the Git-managed encyclopedia, stories and forum.
create schema if not exists account_private;
revoke all on schema account_private from public, anon, authenticated;
grant usage on schema account_private to authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

create type public.account_group as enum ('guest', 'admin');
create table public.account_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 50),
  user_group public.account_group not null default 'guest',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from anon, authenticated;
grant select on public.account_profiles to authenticated;
grant update (nickname) on public.account_profiles to authenticated;
grant all on public.account_profiles to service_role;
create index account_profiles_created_idx on public.account_profiles (created_at desc, id);

create function account_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.account_profiles where id = (select auth.uid()) and user_group = 'admin');
$$;
revoke all on function account_private.is_admin() from public;
grant execute on function account_private.is_admin() to authenticated;
create policy profiles_read on public.account_profiles for select to authenticated
  using (id = (select auth.uid()) or (select account_private.is_admin()));
create policy profiles_edit_self on public.account_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function account_private.invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; code text := ''; bytes bytea;
begin
  bytes := extensions.gen_random_bytes(6);
  for i in 0..5 loop code := code || substr(alphabet, get_byte(bytes, i) % 36 + 1, 1); end loop;
  return code;
end;
$$;
revoke all on function account_private.invite_code() from public;
grant execute on function account_private.invite_code() to authenticated, service_role;
create table public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default account_private.invite_code() check (code ~ '^[A-Z0-9]{6}$'),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until > valid_from)
);
create index account_invitations_created_idx on public.account_invitations (created_at desc, id);
create index account_invitations_creator_idx on public.account_invitations (created_by);
create index account_invitations_user_idx on public.account_invitations (used_by);
alter table public.account_invitations enable row level security;
revoke all on public.account_invitations from anon, authenticated;
grant select on public.account_invitations to authenticated;
grant insert (code, valid_from, valid_until, note) on public.account_invitations to authenticated;
grant update (code, valid_from, valid_until, note) on public.account_invitations to authenticated;
grant all on public.account_invitations to service_role;
create policy invitations_admin_read on public.account_invitations for select to authenticated
  using ((select account_private.is_admin()));
create policy invitations_admin_create on public.account_invitations for insert to authenticated
  with check ((select account_private.is_admin()));
create policy invitations_admin_edit on public.account_invitations for update to authenticated
  using ((select account_private.is_admin()) and deleted_at is null)
  with check ((select account_private.is_admin()) and deleted_at is null);

create function account_private.touch_account_row() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
create trigger touch_profile before update on public.account_profiles for each row execute function account_private.touch_account_row();
create function account_private.guard_invitation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.used_at is not null and (new.code is distinct from old.code or new.used_at is distinct from old.used_at) then
    raise exception 'A redeemed invitation cannot be reissued' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp(); return new;
end;
$$;
create trigger guard_invitation before update on public.account_invitations for each row execute function account_private.guard_invitation();

-- Retain deleted codes so a consumed code can never be issued again.
create function account_private.delete_invitation(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not account_private.is_admin() then raise insufficient_privilege; end if;
  update public.account_invitations set deleted_at = clock_timestamp() where id = target and deleted_at is null;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function account_private.delete_invitation(uuid) from public;
grant execute on function account_private.delete_invitation(uuid) to authenticated;
create function public.account_delete_invitation(target uuid) returns void
language sql security invoker set search_path = '' as $$ select account_private.delete_invitation(target); $$;
revoke all on function public.account_delete_invitation(uuid) from public, anon;
grant execute on function public.account_delete_invitation(uuid) to authenticated;

-- Only the CAPTCHA-verified Edge Function can mint these short-lived tickets.
create table account_private.registration_tickets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 50),
  invitation_id uuid not null references public.account_invitations(id),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);
alter table account_private.registration_tickets enable row level security;
grant all on account_private.registration_tickets to service_role;
create index registration_tickets_invite_idx on account_private.registration_tickets(invitation_id);
create index registration_tickets_expiry_idx on account_private.registration_tickets(expires_at);
create function public.account_prepare_registration(p_email text, p_nickname text, p_code text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare ticket uuid; invitation uuid;
begin
  delete from account_private.registration_tickets where expires_at < now();
  select id into invitation from public.account_invitations
    where code = p_code and used_at is null and deleted_at is null
    and valid_from <= clock_timestamp() and valid_until > clock_timestamp();
  if invitation is null then raise exception 'Invalid invitation' using errcode = '22023'; end if;
  insert into account_private.registration_tickets(email,nickname,invitation_id)
    values (lower(btrim(p_email)),btrim(p_nickname),invitation) returning id into ticket;
  return ticket;
end;
$$;
revoke all on function public.account_prepare_registration(text,text,text) from public, anon, authenticated;
grant execute on function public.account_prepare_registration(text,text,text) to service_role;

create function account_private.finish_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ticket account_private.registration_tickets; registration_metadata jsonb;
begin
  -- GoTrue writes app_metadata after INSERT in the same transaction. This
  -- deferred constraint trigger reads the final row before that transaction commits.
  select raw_app_meta_data into registration_metadata from auth.users where id = new.id;
  delete from account_private.registration_tickets
    where id::text = registration_metadata->>'registration_ticket'
      and email = lower(new.email) and expires_at > clock_timestamp()
    returning * into ticket;
  if ticket.id is null then raise exception 'Registration requires a verified invitation'; end if;
  update public.account_invitations set used_at = clock_timestamp(), used_by = new.id
    where id = ticket.invitation_id and used_at is null and deleted_at is null
      and valid_from <= clock_timestamp() and valid_until > clock_timestamp();
  if not found then raise exception 'Invitation expired or already redeemed'; end if;
  insert into public.account_profiles(id,email,nickname,user_group)
    values (new.id, new.email, ticket.nickname, 'guest');
  return new;
end;
$$;
revoke all on function account_private.finish_registration() from public;
create constraint trigger account_registration after insert on auth.users
  deferrable initially deferred for each row execute function account_private.finish_registration();

-- Preserve existing accounts; privilege elevation is a separate operator action.
insert into public.account_profiles(id,email,nickname)
  select id, email, left(coalesce(nullif(btrim(raw_user_meta_data->>'nickname'),''),'用户'),50)
  from auth.users where email is not null on conflict (id) do nothing;
create function account_private.sync_account_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin update public.account_profiles set email = new.email where id = new.id; return new; end;
$$;
revoke all on function account_private.sync_account_email() from public;
create trigger sync_account_email after update of email on auth.users for each row execute function account_private.sync_account_email();
revoke all on function account_private.touch_account_row() from public;
revoke all on function account_private.guard_invitation() from public;

-- Public image reads, writes only through the authenticated image-checking function.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('account-avatars','account-avatars',true,524288,array['image/png'])
 on conflict (id) do update set public=true,file_size_limit=524288,allowed_mime_types=array['image/png'];
-- No browser INSERT/UPDATE/DELETE policy is granted for avatars.
-- Also constrain any broad Storage policies that may already exist in the project.
create policy account_avatars_no_direct_insert on storage.objects as restrictive
  for insert to anon, authenticated with check (bucket_id <> 'account-avatars');
create policy account_avatars_no_direct_update on storage.objects as restrictive
  for update to anon, authenticated using (bucket_id <> 'account-avatars') with check (bucket_id <> 'account-avatars');
create policy account_avatars_no_direct_delete on storage.objects as restrictive
  for delete to anon, authenticated using (bucket_id <> 'account-avatars');

-- Private manuscripts never enter the Git-managed public content collections.
-- Real account UUIDs authorize access; forum nicknames remain fictional text.
create table public.content_submission_permissions (
  user_group public.account_group primary key,
  can_submit boolean not null default false
);
insert into public.content_submission_permissions values ('admin', true), ('guest', false);
alter table public.content_submission_permissions enable row level security;
revoke all on public.content_submission_permissions from public, anon, authenticated;
grant select on public.content_submission_permissions to authenticated;
grant all on public.content_submission_permissions to service_role;
create policy submission_permissions_read on public.content_submission_permissions for select to authenticated using (true);

create function public.content_can_submit() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.account_profiles p
    join public.content_submission_permissions g on g.user_group = p.user_group and g.can_submit
    where p.id = (select auth.uid())
  );
$$;
revoke all on function public.content_can_submit() from public, anon;
grant execute on function public.content_can_submit() to authenticated;

create function public.content_account_groups() returns setof public.account_group
language sql stable security invoker set search_path = '' as $$
  select unnest(enum_range(null::public.account_group));
$$;
revoke all on function public.content_account_groups() from public, anon;
grant execute on function public.content_account_groups() to authenticated;

-- Validate the bounded, ordered forum payload even when the UI is bypassed.
create function account_private.valid_content_posts(posts jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare post jsonb; position integer := 0;
begin
  if jsonb_typeof(posts) <> 'array' or jsonb_array_length(posts) > 1000 then return false; end if;
  for post in select value from jsonb_array_elements(posts) loop
    position := position + 1;
    if jsonb_typeof(post) <> 'object'
      or (select count(*) from jsonb_object_keys(post)) <> 4
      or jsonb_typeof(post->'floor') is distinct from 'number'
      or post->>'floor' <> position::text
      or jsonb_typeof(post->'author') is distinct from 'string'
      or char_length(btrim(post->>'author')) not between 1 and 50
      or jsonb_typeof(post->'body') is distinct from 'string'
      or char_length(btrim(post->>'body')) not between 1 and 200000
      or jsonb_typeof(post->'isOriginalPoster') is distinct from 'boolean'
      or (post->>'isOriginalPoster')::boolean is distinct from (post->>'author' = posts->0->>'author')
    then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function account_private.valid_content_posts(jsonb) from public, anon;
grant execute on function account_private.valid_content_posts(jsonb) to authenticated, service_role;

create table public.private_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('wiki', 'story', 'forum')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 80),
  author_name text not null default '' check (char_length(author_name) <= 50),
  body_markdown text not null default '' check (char_length(body_markdown) <= 500000),
  forum_posts jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid default auth.uid() references public.account_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  access_version bigint not null default 1,
  check (octet_length(forum_posts::text) <= 2000000 and account_private.valid_content_posts(forum_posts)),
  check ((kind = 'forum' and body_markdown = '' and jsonb_array_length(forum_posts) >= 1)
    or (kind <> 'forum' and forum_posts = '[]'::jsonb and char_length(btrim(body_markdown)) >= 1))
);
create index private_documents_created_idx on public.private_documents(created_at desc, id);
create index private_documents_creator_idx on public.private_documents(created_by);
alter table public.private_documents enable row level security;
revoke all on public.private_documents from public, anon, authenticated;
grant select, delete on public.private_documents to authenticated;
grant insert(kind, title, description, category, author_name, body_markdown, forum_posts, status) on public.private_documents to authenticated;
grant update(title, description, category, author_name, body_markdown, forum_posts, status) on public.private_documents to authenticated;
grant all on public.private_documents to service_role;
create trigger touch_private_document before update of title, description, category, author_name, body_markdown, forum_posts, status on public.private_documents
  for each row execute function account_private.touch_account_row();

create table public.content_user_grants (
  document_id uuid not null references public.private_documents(id) on delete cascade,
  user_id uuid not null references public.account_profiles(id) on delete cascade,
  primary key(document_id, user_id)
);
create index content_user_grants_reader_idx on public.content_user_grants(user_id, document_id);
create table public.content_group_grants (
  document_id uuid not null references public.private_documents(id) on delete cascade,
  user_group public.account_group not null,
  primary key(document_id, user_group)
);
create index content_group_grants_reader_idx on public.content_group_grants(user_group, document_id);
alter table public.content_user_grants enable row level security;
alter table public.content_group_grants enable row level security;
revoke all on public.content_user_grants, public.content_group_grants from public, anon, authenticated;
grant select on public.content_user_grants, public.content_group_grants to authenticated;
grant all on public.content_user_grants, public.content_group_grants to service_role;
create policy content_users_admin_read on public.content_user_grants for select to authenticated using ((select account_private.is_admin()));
create policy content_groups_admin_read on public.content_group_grants for select to authenticated using ((select account_private.is_admin()));

-- Only the caller's IDs are returned. This private helper avoids recursive RLS
-- and does not disclose another reader's grants or profile.
create function account_private.content_granted_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select g.document_id from public.content_user_grants g
    join public.account_profiles p on p.id = g.user_id where p.id = (select auth.uid())
  union
  select g.document_id from public.content_group_grants g
    join public.account_profiles p on p.user_group = g.user_group where p.id = (select auth.uid());
$$;
revoke all on function account_private.content_granted_ids() from public, anon;
grant execute on function account_private.content_granted_ids() to authenticated;

create policy private_documents_read on public.private_documents for select to authenticated using (
  (select account_private.is_admin())
  or (created_by = (select auth.uid()) and status = 'draft' and (select public.content_can_submit()))
  or (status = 'published' and id in (select account_private.content_granted_ids()))
);
create policy private_documents_create on public.private_documents for insert to authenticated with check (
  created_by = (select auth.uid()) and (select public.content_can_submit())
  and (status = 'draft' or (select account_private.is_admin()))
);
create policy private_documents_edit on public.private_documents for update to authenticated
  using ((select account_private.is_admin()) or (created_by = (select auth.uid()) and status = 'draft' and (select public.content_can_submit())))
  with check ((select account_private.is_admin()) or (created_by = (select auth.uid()) and status = 'draft' and (select public.content_can_submit())));
create policy private_documents_delete on public.private_documents for delete to authenticated
  using ((select account_private.is_admin()) or (created_by = (select auth.uid()) and status = 'draft' and (select public.content_can_submit())));

-- Replace both ACL sets in one transaction. A stale form cannot overwrite a
-- newer administrator's decision. No browser gets direct ACL write grants.
create function account_private.set_content_access(p_document_id uuid, p_users uuid[], p_groups public.account_group[], p_expected_version bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare current_version bigint;
begin
  if auth.uid() is null or not account_private.is_admin() then raise insufficient_privilege; end if;
  if p_users is null or p_groups is null or cardinality(p_users) > 1000
    or array_position(p_users, null) is not null or array_position(p_groups, null) is not null then
    raise exception 'Invalid access list' using errcode = '22023';
  end if;
  select access_version into current_version from public.private_documents where id = p_document_id for update;
  if not found then raise exception 'Document unavailable' using errcode = 'P0002'; end if;
  if p_expected_version is distinct from current_version then raise exception 'Access list changed; reload before saving' using errcode = '40001'; end if;
  delete from public.content_user_grants where document_id = p_document_id;
  delete from public.content_group_grants where document_id = p_document_id;
  insert into public.content_user_grants select p_document_id, u from (select distinct unnest(p_users) as u) users;
  insert into public.content_group_grants select p_document_id, g from (select distinct unnest(p_groups) as g) groups;
  update public.private_documents set access_version = access_version + 1 where id = p_document_id;
  return current_version + 1;
end;
$$;
revoke all on function account_private.set_content_access(uuid, uuid[], public.account_group[], bigint) from public, anon;
grant execute on function account_private.set_content_access(uuid, uuid[], public.account_group[], bigint) to authenticated;
create function public.content_set_access(p_document_id uuid, p_users uuid[], p_groups public.account_group[], p_expected_version bigint) returns bigint
language sql security invoker set search_path = '' as $$
  select account_private.set_content_access(p_document_id, p_users, p_groups, p_expected_version);
$$;
revoke all on function public.content_set_access(uuid, uuid[], public.account_group[], bigint) from public, anon;
grant execute on function public.content_set_access(uuid, uuid[], public.account_group[], bigint) to authenticated;

-- This is the ONLY anonymous projection: opaque URL paths, no document join,
-- title, status, author, body, timestamps or ACLs. Pages builds need no secret.
create table public.private_content_routes (
  path text primary key check (path ~ '^/private/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
alter table public.private_content_routes enable row level security;
revoke all on public.private_content_routes from public, anon, authenticated;
grant select on public.private_content_routes to anon, authenticated;
grant all on public.private_content_routes to service_role;
create policy private_routes_read on public.private_content_routes for select to anon, authenticated using (true);
create function account_private.register_content_route() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.private_content_routes(path) values ('/private/' || new.id::text) on conflict do nothing;
  return new;
end;
$$;
revoke all on function account_private.register_content_route() from public, anon, authenticated;
create trigger register_private_route after insert on public.private_documents
  for each row execute function account_private.register_content_route();
-- Keep route tombstones after deletion so old bookmarks still get a neutral
-- unavailable page, not a Pages 404. Query parameters paginate private forums.

-- A section exists independently of a Git-managed article. Only published
-- stories are registered by the operator's synchronization script.
create table public.comment_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  posting_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.comment_articles (
  article_uid text primary key check (article_uid like 'story:%'),
  section_id uuid not null unique references public.comment_sections(id),
  title text not null,
  path text not null check (path like '/stories/%'),
  comments_enabled boolean not null default true
);
create table public.comment_group_permissions (
  user_group public.account_group primary key,
  can_post boolean not null default false
);
insert into public.comment_group_permissions values ('guest', true), ('admin', true);

-- A narrow, trigger-maintained public projection; never expose account emails
-- or relax the existing account_profiles policies to render author bylines.
create table public.comment_authors (
  id uuid primary key references public.account_profiles(id) on delete cascade,
  nickname text not null,
  avatar_path text
);
create table public.article_comments (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.comment_sections(id),
  author_id uuid default auth.uid() references public.comment_authors(id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index article_comments_section_created_idx on public.article_comments(section_id, created_at, id);
create index article_comments_author_idx on public.article_comments(author_id);
create index comment_sections_created_idx on public.comment_sections(created_at desc, id);

alter table public.comment_sections enable row level security;
alter table public.comment_articles enable row level security;
alter table public.comment_group_permissions enable row level security;
alter table public.comment_authors enable row level security;
alter table public.article_comments enable row level security;
revoke all on public.comment_sections, public.comment_articles, public.comment_group_permissions,
  public.comment_authors, public.article_comments from public, anon, authenticated;
grant all on public.comment_sections, public.comment_articles, public.comment_group_permissions,
  public.comment_authors, public.article_comments to service_role;
grant select on public.comment_sections, public.comment_articles, public.comment_authors, public.article_comments to anon, authenticated;
grant select on public.comment_group_permissions to authenticated;
grant insert(title) on public.comment_sections to authenticated;
grant update(posting_enabled) on public.comment_sections to authenticated;
grant update(comments_enabled) on public.comment_articles to authenticated;
grant insert(section_id, body) on public.article_comments to authenticated;
grant update(body) on public.article_comments to authenticated;
grant delete on public.article_comments to authenticated;

create policy comment_sections_read on public.comment_sections for select to anon, authenticated using (true);
create policy comment_sections_create on public.comment_sections for insert to authenticated
  with check ((select account_private.is_admin()));
create policy comment_sections_manage on public.comment_sections for update to authenticated
  using ((select account_private.is_admin())) with check ((select account_private.is_admin()));
create policy comment_articles_read on public.comment_articles for select to anon, authenticated using (true);
create policy comment_articles_manage on public.comment_articles for update to authenticated
  using ((select account_private.is_admin())) with check ((select account_private.is_admin()));
create policy comment_group_permissions_read on public.comment_group_permissions for select to authenticated using (true);
create policy article_comments_read on public.article_comments for select to anon, authenticated using (true);
create policy comment_authors_read on public.comment_authors for select to anon, authenticated
  using (exists(select 1 from public.article_comments c where c.author_id = comment_authors.id));

create function account_private.can_comment(p_section_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.account_profiles p
    join public.comment_group_permissions g on g.user_group = p.user_group and g.can_post
    cross join public.comment_sections s
    left join public.comment_articles a on a.section_id = s.id
    where p.id = (select auth.uid()) and s.id = p_section_id and s.posting_enabled
      and coalesce(a.comments_enabled, true)
  );
$$;
revoke all on function account_private.can_comment(uuid) from public, anon, authenticated;
grant execute on function account_private.can_comment(uuid) to authenticated;
create function public.comment_can_post(p_section_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select account_private.can_comment(p_section_id); $$;
revoke all on function public.comment_can_post(uuid) from public, anon, authenticated;
grant execute on function public.comment_can_post(uuid) to authenticated;

create policy article_comments_create on public.article_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and account_private.can_comment(section_id));
-- Closing submissions does not remove the author's ability to correct/delete
-- an existing comment. Administrators may delete, but cannot rewrite others.
create policy article_comments_edit_self on public.article_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy article_comments_delete on public.article_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select account_private.is_admin()));

create function account_private.prepare_comment_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is null then raise insufficient_privilege; end if;
  insert into public.comment_authors(id, nickname, avatar_path)
    select id, nickname, avatar_path from public.account_profiles where id = new.author_id
    on conflict(id) do update set nickname = excluded.nickname, avatar_path = excluded.avatar_path;
  return new;
end;
$$;
create function account_private.sync_comment_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.comment_authors set nickname = new.nickname, avatar_path = new.avatar_path where id = new.id;
  return new;
end;
$$;
revoke all on function account_private.prepare_comment_author(), account_private.sync_comment_author() from public, anon, authenticated;
create trigger prepare_comment_author before insert on public.article_comments
  for each row execute function account_private.prepare_comment_author();
create trigger sync_comment_author after update of nickname, avatar_path on public.account_profiles
  for each row execute function account_private.sync_comment_author();
create trigger touch_comment before update of body on public.article_comments
  for each row execute function account_private.touch_account_row();
create trigger touch_comment_section before update on public.comment_sections
  for each row execute function account_private.touch_account_row();

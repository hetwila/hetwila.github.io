-- Ratings describe the work; they do not change its existing reading grants.
alter table public.private_documents
  add column age_rating text not null default 'general'
  constraint private_documents_age_rating_check check (age_rating in ('general', 'r18'));
grant insert(age_rating), update(age_rating) on public.private_documents to authenticated;

-- A rating change must also invalidate an editor's optimistic version check.
drop trigger touch_private_document on public.private_documents;
create trigger touch_private_document before update of title, description, category, author_name, body_markdown, forum_posts, status, age_rating on public.private_documents
  for each row execute function account_private.touch_account_row();

-- Existing self-only UPDATE RLS also applies to this preference, including admins.
alter table public.account_profiles
  add column show_sensitive_content boolean not null default false;
grant update(show_sensitive_content) on public.account_profiles to authenticated;

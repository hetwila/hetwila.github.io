-- Editor snapshots are private files, independent of published/private manuscripts.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('editor-drafts', 'editor-drafts', false, 4194304, array['application/json']);

create function account_private.can_manage_editor_snapshot(object_name text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select (select account_private.is_admin())
    and split_part(object_name, '/', 1) = (select auth.uid())::text
    and object_name ~ '^[0-9a-f-]{36}/[0-9]{13}-[^/\\]{1,100}-[0-9a-f-]{36}\.json$'
    and length(object_name) <= 240;
$$;
revoke all on function account_private.can_manage_editor_snapshot(text) from public;
grant execute on function account_private.can_manage_editor_snapshot(text) to authenticated;

-- Restrictive boundaries also hold if the project has unrelated broad policies.
create policy editor_snapshot_boundary on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'editor-drafts' or account_private.can_manage_editor_snapshot(name))
  with check (bucket_id <> 'editor-drafts' or account_private.can_manage_editor_snapshot(name));
create policy editor_snapshot_no_anonymous on storage.objects as restrictive for all to anon
  using (bucket_id <> 'editor-drafts') with check (bucket_id <> 'editor-drafts');
create policy editor_snapshot_read on storage.objects for select to authenticated
  using (bucket_id = 'editor-drafts' and account_private.can_manage_editor_snapshot(name));
create policy editor_snapshot_create on storage.objects for insert to authenticated
  with check (bucket_id = 'editor-drafts' and account_private.can_manage_editor_snapshot(name));
create policy editor_snapshot_delete on storage.objects for delete to authenticated
  using (bucket_id = 'editor-drafts' and account_private.can_manage_editor_snapshot(name));
-- Every save has a new name. Existing snapshots cannot be silently overwritten.
create policy editor_snapshot_no_overwrite on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'editor-drafts') with check (bucket_id <> 'editor-drafts');

import { randomUUID } from 'node:crypto'
import type { SourceDocument } from './content.ts'
import { documentPath } from './content.ts'

/** Synchronize public story identities without resetting moderation switches or deleting discussions. */
export function commentRegistrySQL(documents: SourceDocument[]) {
  const records = documents.filter(d => d.metadata.entityType === 'story').map(({ metadata }) => ({
    article_uid: metadata.uid, section_id: randomUUID(), title: metadata.title, path: documentPath(metadata),
  }))
  const literal = JSON.stringify(records).replaceAll("'", "''")
  return `
    with source as (
      select * from jsonb_to_recordset('${literal}'::jsonb) as s(article_uid text, section_id uuid, title text, path text)
    ), new_sections as (
      insert into public.comment_sections(id, title)
        select s.section_id, s.title from source s
        where not exists(select 1 from public.comment_articles a where a.article_uid = s.article_uid)
      returning id
    )
    insert into public.comment_articles(article_uid, section_id, title, path)
      select s.article_uid, coalesce(a.section_id, n.id), s.title, s.path from source s
      left join public.comment_articles a on a.article_uid = s.article_uid
      left join new_sections n on n.id = s.section_id
    on conflict(article_uid) do update set title = excluded.title, path = excluded.path;
  `
}

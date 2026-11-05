import { z } from 'zod'
import { parseForumBody } from './forum-body.ts'

export const privateKinds = { wiki: '百科', story: '故事', forum: '论坛帖子' } as const
export type PrivateKind = keyof typeof privateKinds
export const privateIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
export interface PrivateForumPost { floor: number; author: string; body: string; isOriginalPoster: boolean }
export interface PrivateDocument {
  id: string; kind: PrivateKind; title: string; description: string; category: string; author_name: string
  body_markdown: string; forum_posts: PrivateForumPost[]; status: 'draft' | 'published'
  created_by: string | null; created_at: string; updated_at: string; access_version: number
}
export type PrivateDocumentSummary = Omit<PrivateDocument, 'body_markdown' | 'forum_posts'>
export const privateSummaryColumns = 'id,kind,title,description,category,author_name,status,created_by,created_at,updated_at,access_version'
export const privateDocumentSchema = z.object({
  kind: z.enum(['wiki', 'story', 'forum']),
  title: z.string().trim().min(1, '请填写标题。').max(200, '标题最多200字。'),
  description: z.string().max(2000, '简介最多2000字。'),
  category: z.string().max(80, '分类最多80字。'),
  author_name: z.string().max(50, '署名最多50字。'),
  body_markdown: z.string().max(500000, '正文最多500000字。'),
  forum_posts: z.array(z.object({ floor: z.number().int().positive(), author: z.string().trim().min(1, '请填写楼层昵称。').max(50), body: z.string().trim().min(1, '楼层正文不能为空。').max(200000), isOriginalPoster: z.boolean() })).max(1000),
  status: z.enum(['draft', 'published']),
}).superRefine((value, ctx) => {
  if (value.kind === 'forum') {
    if (!value.forum_posts.length || value.body_markdown) ctx.addIssue({ code: 'custom', path: ['forum_posts'], message: '论坛帖子至少包含一层，正文请写入楼层。' })
    if (new TextEncoder().encode(JSON.stringify(value.forum_posts)).length > 1900000) ctx.addIssue({ code: 'custom', path: ['forum_posts'], message: '帖子内容过长，请拆为多个主题。' })
    value.forum_posts.forEach((post, i) => {
      if (post.floor !== i + 1 || post.isOriginalPoster !== (post.author === value.forum_posts[0]?.author)) ctx.addIssue({ code: 'custom', path: ['forum_posts'], message: '请保留连续楼号与正确的楼主标记。' })
      try { parseForumBody(post.body) } catch { ctx.addIssue({ code: 'custom', path: ['forum_posts'], message: `第${post.floor}楼同人文标记不完整；请使用成对的边界、二级篇名和三级章节标题。` }) }
    })
  } else if (!value.body_markdown.trim() || value.forum_posts.length) ctx.addIssue({ code: 'custom', path: ['body_markdown'], message: '请填写文章正文。' })
})

export function privateContentPath(id: string) {
  if (!privateIdPattern.test(id)) throw new Error('无效的内容 ID。')
  return `/private/${id}`
}
export function privateForumPath(base: string, page = 1, onlyAuthor = false, floor?: number) {
  const url = new URL(base, 'https://hetwila.github.io')
  if (page > 1) url.searchParams.set('page', String(page)); else url.searchParams.delete('page')
  if (onlyAuthor) url.searchParams.set('author', '1'); else url.searchParams.delete('author')
  return url.pathname + url.search + (floor ? `#post-${floor}` : '')
}

import type { ForumThreadMetadata, ForumPostMetadata } from './forum-schema.ts'
export type { ForumThreadMetadata } from './forum-schema.ts'

// Shared by rendering, static routes and exports; no validation library is
// loaded into the browser just to compute a page or floor link.
export const FORUM_PAGE_SIZE = 20

export type ForumPost = ForumPostMetadata & { path: string, bodyMarkdown: string }
export type ForumThreadRecord = ForumThreadMetadata & {
  path: string
  author: string
  postCount: number
  replyCount: number
  participantCount: number
  authorPostCount: number
  pageCount: number
  authorPageCount: number
  lastPost: { floor: number, author: string, path: string }
  markdownUrl: string
  jsonUrl: string
  originalMarkdownUrl: string
  originalSha256: string
}
export type ForumThreadExport = ForumThreadRecord & { pages: string[], posts: ForumPost[] }

export function forumPagePath(routeKey: string, page = 1, onlyAuthor = false) {
  return `/forum/threads/${routeKey}/${onlyAuthor ? 'author/' : ''}page/${page}`
}

export function forumPostPath(routeKey: string, floor: number) {
  return `${forumPagePath(routeKey, Math.ceil(floor / FORUM_PAGE_SIZE))}#post-${floor}`
}

export function forumRoutes(thread: Pick<ForumThreadRecord, 'routeKey' | 'pageCount' | 'authorPageCount'>) {
  return [false, true].flatMap(onlyAuthor => Array.from(
    { length: onlyAuthor ? thread.authorPageCount : thread.pageCount },
    (_, i) => forumPagePath(thread.routeKey, i + 1, onlyAuthor),
  ))
}

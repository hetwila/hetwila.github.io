export const COMMENT_PAGE_SIZE = 20
export const COMMENT_MAX_LENGTH = 10000
export const commentSectionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export interface CommentArticle { article_uid: string; section_id: string; title: string; path: string; comments_enabled: boolean }
export interface CommentSectionInfo { id: string; title: string; posting_enabled: boolean; created_at: string; updated_at: string; article: CommentArticle | null }
export interface ArticleComment {
  id: string; section_id: string; author_id: string | null; body: string; created_at: string; updated_at: string
  author: { nickname: string; avatar_path: string | null } | null
}

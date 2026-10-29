import type { Page } from '@playwright/test'
import type { ArticleComment, CommentSectionInfo } from '../../../shared/comment'
import { accountFixture, userId } from './accounts'
export const sectionId = 'ad87ee25-f48b-4813-b02f-3176a0128931'
export const standaloneId = '1fd844e3-a8ad-467f-b38b-2ff3f0d691d4'
export const otherId = 'af1da144-ec46-4491-bc1e-d22d546174b8'
export const richComment = '# 评论中的标题\n\n**很喜欢这段故事。**\n\n> 一段引用\n\n- [x] 阅读完成\n\n| 角色 | 感想 |\n| --- | --- |\n| 诺菲莉亚 | 值得回味 |\n\n```text\n' + 'long-code-'.repeat(50) + '\n```\n\n![示意图](https://media.example.test/comment.svg)\n\n<style>body{display:none}</style>\n<script>window.commentXss=true</script>\n\n[危险链接](javascript:alert%281%29)'

export async function commentFixture(page: Page, group?: 'guest' | 'admin', count = 2) {
  const account = await accountFixture(page, group)
  const time = '2026-10-29T01:00:00.000Z'
  const sections: CommentSectionInfo[] = [
    { id: sectionId, title: '第一次选择', posting_enabled: true, created_at: time, updated_at: time, article: { article_uid: 'story:第一次选择', section_id: sectionId, title: '第一次选择', path: '/stories/第一次选择', comments_enabled: true } },
    { id: standaloneId, title: '独立测试讨论', posting_enabled: true, created_at: time, updated_at: time, article: null },
  ]
  const comments: ArticleComment[] = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(), section_id: sectionId, author_id: i === 0 ? userId : otherId, body: i === 0 ? richComment : `另一位读者的评论 ${i}`,
    author: { nickname: i === 0 ? '测试读者' : '其他读者', avatar_path: null }, created_at: new Date(Date.parse(time) + i * 1000).toISOString(), updated_at: new Date(Date.parse(time) + i * 1000).toISOString(),
  }))
  const state = { failReads: false }
  const requests: { method: string; path: string; body: any }[] = []
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range' }
  await page.route('https://media.example.test/comment.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900"><rect width="1400" height="900" fill="#356b56"/></svg>' }))
  await page.route('https://account.example.test/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)!, method = request.method()
    if (!['comment_sections', 'comment_articles', 'article_comments', 'comment_can_post'].includes(table)) return route.fallback()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = request.postData() ? request.postDataJSON() : undefined
    requests.push({ method, path: table, body })
    const send = (json: unknown, status = 200, extra = {}) => route.fulfill({ status, json, headers: { ...headers, ...extra } })
    const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '')
    const range = <T>(rows: T[]) => {
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 20)
      return send(rows.slice(offset, offset + limit), 200, { 'content-range': `${offset}-${Math.min(offset + limit, rows.length) - 1}/${rows.length}` })
    }
    const allowed = (id: string) => { const s = sections.find(s => s.id === id); return Boolean(group && s?.posting_enabled && (s.article?.comments_enabled ?? true)) }
    if (table === 'comment_can_post') return send(allowed(body.p_section_id))
    if (table === 'comment_articles') {
      const article = sections.find(s => s.article?.article_uid === eq('article_uid'))?.article
      if (method === 'PATCH') {
        if (group !== 'admin' || !article) return send({ message: 'forbidden' }, 403)
        Object.assign(article, body)
      }
      return send(article || null)
    }
    if (table === 'comment_sections') {
      if (method === 'GET' && state.failReads) return send({ message: 'fixture read failure' }, 400)
      if (method === 'POST') {
        if (group !== 'admin') return send({ message: 'forbidden' }, 403)
        const section = { id: crypto.randomUUID(), title: body.title, posting_enabled: true, created_at: time, updated_at: time, article: null }
        sections.unshift(section); return send(section, 201)
      }
      const section = sections.find(s => s.id === eq('id'))
      if (method === 'PATCH') {
        if (group !== 'admin' || !section) return send({ message: 'forbidden' }, 403)
        Object.assign(section, body); return send(section)
      }
      return eq('id') ? send(section || null) : range(sections)
    }
    if (method === 'GET') return range(comments.filter(c => c.section_id === eq('section_id')))
    if (method === 'POST') {
      if (!allowed(body.section_id)) return send({ message: 'Posting is closed' }, 403)
      const comment = { id: crypto.randomUUID(), section_id: body.section_id, author_id: userId, author: { nickname: account.profile.nickname, avatar_path: null }, body: body.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      comments.push(comment); return send(comment, 201)
    }
    const index = comments.findIndex(c => c.id === eq('id')), comment = comments[index]
    if (!comment || !group || (comment.author_id !== userId && (method !== 'DELETE' || group !== 'admin'))) return send({ message: 'Not found' }, 406)
    if (method === 'PATCH') {
      if (eq('updated_at') && comment.updated_at !== eq('updated_at')) return send({ message: 'Conflict' }, 406)
      comment.body = body.body; comment.updated_at = new Date().toISOString(); return send(comment)
    }
    comments.splice(index, 1); return send({ id: comment.id })
  })
  return { sections, comments, requests, state }
}

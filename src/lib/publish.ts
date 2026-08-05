import {
  applyContentBlocks,
  getFileSha,
  getRepoFile,
  GitHubError,
  putRepoBinary,
  putRepoFile,
} from './github'
import type { Env } from './types'

const CONTENT_PAGES: Array<{ path: string; label: string }> = [
  { path: 'index.html', label: 'Home' },
  { path: 'pages/about/index.html', label: 'About' },
  { path: 'pages/projects/index.html', label: 'Projects' },
  { path: 'pages/tools/index.html', label: 'Tools' },
  { path: 'pages/legal/index.html', label: 'Legal' },
]

export async function publishWebsiteContent(
  env: Env,
  websiteId: string,
  actorEmail: string,
): Promise<{
  files: Array<{ path: string; commitSha: string; updated: boolean }>
  blocks: number
}> {
  const { results } = await env.DB.prepare(
    `SELECT id, value FROM content_blocks WHERE website_id = ? AND published = 1`,
  )
    .bind(websiteId)
    .all<{ id: string; value: string }>()

  const blocks = (results || []).map((r) => ({ id: r.id, value: r.value }))
  const files: Array<{ path: string; commitSha: string; updated: boolean }> = []

  for (const page of CONTENT_PAGES) {
    let file
    try {
      file = await getRepoFile(env, page.path)
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) continue
      throw err
    }

    if (!file.content.includes('data-bn-content=')) {
      files.push({ path: page.path, commitSha: '', updated: false })
      continue
    }

    const next = await applyContentBlocks(file.content, blocks)
    if (next === file.content) {
      files.push({ path: page.path, commitSha: '', updated: false })
      continue
    }

    const result = await putRepoFile(
      env,
      page.path,
      next,
      `Publish site content (${page.label}) via Blacnova Dashboard (${actorEmail})`,
      file.sha,
    )
    files.push({ path: page.path, commitSha: result.commitSha, updated: true })
  }

  await env.DB.prepare(
    `UPDATE websites SET updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(websiteId)
    .run()

  return { files, blocks: blocks.length }
}

export async function publishMediaToGitHub(
  env: Env,
  fileName: string,
  bytes: ArrayBuffer,
  contentType: string,
  actorEmail: string,
): Promise<{ path: string; commitSha: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
  const path = `ui/img/${safeName}`
  const sha = await getFileSha(env, path)
  const result = await putRepoBinary(
    env,
    path,
    bytes,
    `Upload media ${safeName} via Blacnova Dashboard (${actorEmail})`,
    contentType,
    sha,
  )
  return { path, commitSha: result.commitSha }
}

export async function ensureCmsScriptInHtml(html: string): Promise<string> {
  if (html.includes('ui/js/bn-cms.js')) return html
  if (!html.includes('</head>')) return html
  return html.replace(
    '</head>',
    '    <script src="/ui/js/bn-cms.js" defer></script>\n</head>',
  )
}

import type { Env } from './types'

const API = 'https://api.github.com'

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function requireToken(env: Env): string {
  if (!env.GITHUB_TOKEN) {
    throw new GitHubError('GITHUB_TOKEN is not configured on the Worker', 500)
  }
  return env.GITHUB_TOKEN
}

function repo(env: Env): string {
  return env.GITHUB_REPO || 'nicholasxdavis/BlacnovaWebsite'
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'blacnova-api',
  }
}

export interface RepoFile {
  path: string
  sha: string
  content: string
}

export async function getRepoFile(env: Env, path: string, branch = 'main'): Promise<RepoFile> {
  const token = requireToken(env)
  const url = `${API}/repos/${repo(env)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) {
    const body = await res.text()
    throw new GitHubError(`Failed to read ${path}: ${body}`, res.status)
  }
  const data = (await res.json()) as {
    sha: string
    path: string
    encoding: string
    content: string
  }
  if (data.encoding !== 'base64') {
    throw new GitHubError(`Unexpected encoding for ${path}`, 500)
  }
  const content = base64ToUtf8(data.content.replace(/\n/g, ''))
  return { path: data.path, sha: data.sha, content }
}

export async function putRepoFile(
  env: Env,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch = 'main',
): Promise<{ commitSha: string }> {
  const token = requireToken(env)
  const url = `${API}/repos/${repo(env)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
  const body: Record<string, unknown> = {
    message,
    content: utf8ToBase64(content),
    branch,
  }
  if (sha) body.sha = sha

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new GitHubError(`Failed to write ${path}: ${text}`, res.status)
  }
  const data = (await res.json()) as { commit?: { sha?: string } }
  return { commitSha: data.commit?.sha || '' }
}

export async function putRepoBinary(
  env: Env,
  path: string,
  bytes: ArrayBuffer,
  message: string,
  _contentType: string,
  sha?: string,
  branch = 'main',
): Promise<{ commitSha: string }> {
  const token = requireToken(env)
  const url = `${API}/repos/${repo(env)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
  const body: Record<string, unknown> = {
    message,
    content: bufferToBase64(bytes),
    branch,
  }
  if (sha) body.sha = sha

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new GitHubError(`Failed to write binary ${path}: ${text}`, res.status)
  }
  const data = (await res.json()) as { commit?: { sha?: string } }
  return { commitSha: data.commit?.sha || '' }
}

function utf8ToBase64(str: string): string {
  return bufferToBase64(new TextEncoder().encode(str).buffer)
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function getFileSha(env: Env, path: string, branch = 'main'): Promise<string | undefined> {
  try {
    const file = await getRepoFile(env, path, branch)
    return file.sha
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return undefined
    throw err
  }
}

/** Apply published CMS text into HTML via HTMLRewriter. */
export async function applyContentBlocks(
  html: string,
  blocks: Array<{ id: string; value: string }>,
): Promise<string> {
  const map = new Map(blocks.map((b) => [b.id, b.value]))

  class Handler {
    element(element: Element) {
      const id = element.getAttribute('data-bn-content')
      if (!id || !map.has(id)) return
      element.setInnerContent(map.get(id)!, { html: false })
    }
  }

  const rewritten = new HTMLRewriter().on('[data-bn-content]', new Handler()).transform(
    new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } }),
  )
  return rewritten.text()
}

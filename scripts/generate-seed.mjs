/**
 * Seeds D1 with Blacnova website + nic@blacnova.net account.
 * Run: npx wrangler d1 execute blacnova-db --remote --file=./migrations/0002_seed.sql
 * after generating the SQL via: node scripts/generate-seed.mjs
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ITERATIONS = 100_000

function toHex(bytes) {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `${toHex(salt)}:${toHex(bits)}`
}

function esc(s) {
  return String(s).replace(/'/g, "''")
}

const websiteId = 'site_blacnova'
const userId = 'user_nic'
const modules = JSON.stringify([
  'overview',
  'content',
  'media',
  'pages',
  'maintenance',
  'submissions',
  'analytics',
  'settings',
])

const content = [
  ['c_home_headline', 'home', 'Home', 'Hero', 'Headline', 'heading', 'Elevate Your Digital Presence', 1, 1],
  ['c_home_sub', 'home', 'Home', 'Hero', 'Supporting text', 'textarea', 'Cutting-edge development solutions tailored to your business needs in Las Cruces, New Mexico', 1, 2],
  ['c_home_cta', 'home', 'Home', 'Hero', 'Primary call to action', 'text', 'Start Your Project', 1, 3],
  ['c_home_cta2', 'home', 'Home', 'Hero', 'Secondary call to action', 'text', 'Our Services', 1, 4],
  ['c_clients_title', 'home', 'Home', 'Clients', 'Section title', 'heading', "Businesses We've Worked With", 1, 5],
  ['c_services_eyebrow', 'home', 'Home', 'Services', 'Eyebrow', 'text', 'Our Services', 1, 6],
  ['c_services_title', 'home', 'Home', 'Services', 'Section title', 'heading', 'Digital Solutions', 1, 7],
  ['c_services_desc', 'home', 'Home', 'Services', 'Description', 'textarea', 'We provide a wide range of digital services to help your business grow. Our team of experts is dedicated to delivering high-quality solutions tailored to your unique needs.', 1, 8],
  ['c_local_title', 'home', 'Home', 'Local', 'Section title', 'heading', 'Proudly Serving Las Cruces', 1, 9],
  ['c_about_intro', 'about', 'About', 'Intro', 'Page intro', 'textarea', 'Blacnova Development builds modern websites and digital tools for businesses in Las Cruces and beyond.', 1, 10],
  ['c_quote_title', 'home', 'Home', 'Quote', 'Section title', 'heading', 'Get a Quote', 1, 11],
]

const pages = [
  ['home', 'Home', '/', 'published'],
  ['about', 'About', '/pages/about/', 'published'],
  ['projects', 'Projects', '/pages/projects/', 'published'],
  ['tools', 'Tools', '/pages/tools/', 'published'],
  ['legal', 'Legal', '/pages/legal/', 'published'],
]

const media = [
  ['m_hero', 'hero.png', 'image', '—', 'Home · Hero'],
  ['m_one', 'one.png', 'image', '—', 'Home · Mockup'],
  ['m_three', 'three.png', 'image', '—', 'Home · Mobile'],
  ['m_logo', 'bn.png', 'image', '—', 'Brand'],
]

const submissions = [
  ['sub_1', 'Jordan Miles', 'jordan@example.com', '(575) 555-0142', 'Website redesign', 'Looking for a full redesign of our restaurant site this fall.', 'Quote form', 'new', null, '2026-08-04T15:20:00.000Z'],
  ['sub_2', 'Alex Rivera', 'alex@mesillavalley.co', null, 'SEO help', 'Can you audit our local SEO and Google Business profile?', 'Contact form', 'in_progress', 'Scheduled discovery call.', '2026-08-03T11:05:00.000Z'],
  ['sub_3', 'Sam Ortiz', 'sam@ziabuilding.com', '(575) 555-0199', 'Maintenance plan', 'Interested in ongoing updates and hosting support.', 'Quote form', 'read', null, '2026-08-01T09:40:00.000Z'],
]

const analytics = [
  ['2026-07-06', 820, 2104, 4],
  ['2026-07-13', 905, 2288, 6],
  ['2026-07-20', 874, 2190, 5],
  ['2026-07-27', 1012, 2540, 8],
  ['2026-08-03', 1088, 2712, 7],
]

const passwordHash = await hashPassword('2900')

const lines = []
lines.push('-- Seed Blacnova owner account + www.blacnova.net')
lines.push(`DELETE FROM support_tickets;`)
lines.push(`DELETE FROM analytics_points;`)
lines.push(`DELETE FROM submissions;`)
lines.push(`DELETE FROM media_items;`)
lines.push(`DELETE FROM maintenance;`)
lines.push(`DELETE FROM pages;`)
lines.push(`DELETE FROM content_blocks;`)
lines.push(`DELETE FROM users;`)
lines.push(`DELETE FROM websites;`)

lines.push(`INSERT INTO websites (id, name, domain, status, modules, github_repo) VALUES (
  '${websiteId}',
  'Blacnova Development',
  'www.blacnova.net',
  'live',
  '${esc(modules)}',
  'nicholasxdavis/BlacnovaWebsite'
);`)

lines.push(`INSERT INTO users (id, email, name, role, password_hash, website_id) VALUES (
  '${userId}',
  'nic@blacnova.net',
  'Nic Davis',
  'owner',
  '${esc(passwordHash)}',
  '${websiteId}'
);`)

for (const [cid, pageId, pageName, section, label, type, value, published, sort] of content) {
  lines.push(`INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    '${cid}', '${websiteId}', '${pageId}', '${esc(pageName)}', '${esc(section)}', '${esc(label)}', '${type}', '${esc(value)}', ${published}, ${sort}
  );`)
}

for (const [pid, title, slug, status] of pages) {
  lines.push(`INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (
    '${pid}', '${websiteId}', '${esc(title)}', '${esc(slug)}', '${status}', '2026-08-05'
  );`)
}

for (const [mid, name, type, size, usedOn] of media) {
  lines.push(`INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at) VALUES (
    '${mid}', '${websiteId}', '${esc(name)}', '${type}', '${size}', '${esc(usedOn)}', '2026-08-05'
  );`)
}

lines.push(`INSERT INTO maintenance (website_id, enabled, title, message, expected_return) VALUES (
  '${websiteId}',
  0,
  'We''ll be right back',
  'Blacnova Development is temporarily offline for improvements. Please check back soon or email nic@blacnova.net.',
  ''
);`)

for (const [sid, name, email, phone, subject, message, source, status, notes, created] of submissions) {
  lines.push(`INSERT INTO submissions (id, website_id, name, email, phone, subject, message, source, status, notes, created_at) VALUES (
    '${sid}', '${websiteId}', '${esc(name)}', '${esc(email)}', ${phone ? `'${esc(phone)}'` : 'NULL'}, '${esc(subject)}', '${esc(message)}', '${esc(source)}', '${status}', ${notes ? `'${esc(notes)}'` : 'NULL'}, '${created}'
  );`)
}

analytics.forEach(([date, visitors, pageviews, subs], i) => {
  lines.push(`INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions) VALUES (
    'an_${i + 1}', '${websiteId}', '${date}', ${visitors}, ${pageviews}, ${subs}
  );`)
})

const out = resolve(__dirname, '../migrations/0002_seed.sql')
writeFileSync(out, lines.join('\n') + '\n')
console.log('Wrote', out)
console.log('Password hash ready for nic@blacnova.net')

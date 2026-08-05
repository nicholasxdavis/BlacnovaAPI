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
  ['c_svc_web_title', 'home', 'Home', 'Services', 'Web Development title', 'text', 'Web Development', 1, 9],
  ['c_svc_web_desc', 'home', 'Home', 'Services', 'Web Development description', 'textarea', 'We build responsive, high-performing websites that are secure, scalable, and tailored to your brand. From simple landing pages to complex web applications, our solutions drive user engagement.', 1, 10],
  ['c_svc_seo_title', 'home', 'Home', 'Services', 'SEO title', 'text', 'SEO Optimization', 1, 11],
  ['c_svc_seo_desc', 'home', 'Home', 'Services', 'SEO description', 'textarea', 'Increase your online visibility and rank higher on search engines. We use proven strategies for on-page, off-page, and technical SEO to attract organic traffic and generate qualified leads.', 1, 12],
  ['c_svc_cloud_title', 'home', 'Home', 'Services', 'Cloud title', 'text', 'Cloud Solutions', 1, 13],
  ['c_svc_cloud_desc', 'home', 'Home', 'Services', 'Cloud description', 'textarea', 'Leverage the power of the cloud with our expert services. We offer cloud migration, infrastructure management, and custom cloud-native application development to enhance your business agility.', 1, 14],
  ['c_svc_ecom_title', 'home', 'Home', 'Services', 'E-Commerce title', 'text', 'E-Commerce', 1, 15],
  ['c_svc_ecom_desc', 'home', 'Home', 'Services', 'E-Commerce description', 'textarea', 'Launch and grow your online store with our end-to-end e-commerce solutions. We build secure, user-friendly platforms with seamless payment gateway integration and inventory management.', 1, 16],
  ['c_svc_api_title', 'home', 'Home', 'Services', 'API title', 'text', 'API Integration', 1, 17],
  ['c_svc_api_desc', 'home', 'Home', 'Services', 'API description', 'textarea', 'Connect your software systems and automate workflows with our custom API integration services. We ensure seamless data flow between your applications to improve efficiency and productivity.', 1, 18],
  ['c_webdev_eyebrow', 'home', 'Home', 'Web CTA', 'Eyebrow', 'text', 'Web Development', 1, 19],
  ['c_webdev_title', 'home', 'Home', 'Web CTA', 'Title', 'heading', 'Custom Websites Built for Your Business', 1, 20],
  ['c_webdev_desc', 'home', 'Home', 'Web CTA', 'Description', 'textarea', 'From landing pages to full-scale web apps, we design and develop fast, responsive sites that look sharp and convert visitors into customers.', 1, 21],
  ['c_webdev_cta', 'home', 'Home', 'Web CTA', 'Button label', 'text', 'Start Your Project', 1, 22],
  ['c_quote_eyebrow', 'home', 'Home', 'Quote', 'Eyebrow', 'text', "Let's Talk", 1, 23],
  ['c_quote_title', 'home', 'Home', 'Quote', 'Section title', 'heading', 'Get a Quote', 1, 24],
  ['c_quote_desc', 'home', 'Home', 'Quote', 'Description', 'textarea', "Fill out the form below and we'll get back to you with a personalized quote and project plan.", 1, 25],
  ['c_projects_eyebrow', 'home', 'Home', 'Projects CTA', 'Eyebrow', 'text', 'Featured Projects', 1, 26],
  ['c_projects_title', 'home', 'Home', 'Projects CTA', 'Title', 'heading', 'Client Website Showcase', 1, 27],
  ['c_projects_desc', 'home', 'Home', 'Projects CTA', 'Description', 'textarea', 'Check out our latest projects. We work closely with our clients to deliver modern, responsive, and high-performing websites that meet all their goals.', 1, 28],
  ['c_projects_cta', 'home', 'Home', 'Projects CTA', 'Button label', 'text', 'View Client Projects', 1, 29],
  ['c_local_eyebrow', 'home', 'Home', 'Local', 'Eyebrow', 'text', 'Our Roots', 1, 30],
  ['c_local_title', 'home', 'Home', 'Local', 'Section title', 'heading', 'Proudly Serving Las Cruces', 1, 31],
  ['c_local_desc', 'home', 'Home', 'Local', 'Description', 'textarea', "As a locally owned business, we're committed to helping our community thrive through technology.", 1, 32],
  ['c_local_card1_title', 'home', 'Home', 'Local', 'Card 1 title', 'text', 'Community Focused', 1, 33],
  ['c_local_card1_desc', 'home', 'Home', 'Local', 'Card 1 description', 'textarea', "We reinvest in local businesses and support the growth of the Mesilla Valley's digital economy.", 1, 34],
  ['c_local_card2_title', 'home', 'Home', 'Local', 'Card 2 title', 'text', 'Local Expertise', 1, 35],
  ['c_local_card2_desc', 'home', 'Home', 'Local', 'Card 2 description', 'textarea', 'Our team understands the unique needs and challenges of businesses in Southern New Mexico.', 1, 36],
  ['c_local_card3_title', 'home', 'Home', 'Local', 'Card 3 title', 'text', 'Personal Service', 1, 37],
  ['c_local_card3_desc', 'home', 'Home', 'Local', 'Card 3 description', 'textarea', 'Unlike national agencies, we offer face-to-face consultations and personalized support.', 1, 38],
  ['c_footer_tagline', 'home', 'Home', 'Footer', 'Tagline', 'text', 'Founded in Las Cruces, New Mexico.', 1, 39],
  ['c_about_eyebrow', 'about', 'About', 'Intro', 'Eyebrow', 'text', 'How We Work', 1, 40],
  ['c_about_title', 'about', 'About', 'Intro', 'Page title', 'heading', 'What We Stand For', 1, 41],
  ['c_about_intro', 'about', 'About', 'Intro', 'Page intro', 'textarea', 'Blacnova Development builds modern websites and digital tools for businesses in Las Cruces and beyond.', 1, 42],
  ['c_about_offer_eyebrow', 'about', 'About', 'Services', 'Eyebrow', 'text', 'What We Offer', 1, 43],
  ['c_about_offer_title', 'about', 'About', 'Services', 'Section title', 'heading', 'Services Built Around Your Goals', 1, 44],
  ['c_about_offer_desc', 'about', 'About', 'Services', 'Description', 'textarea', "From concept to launch and beyond, here's what we can help with.", 1, 45],
  ['c_about_local_eyebrow', 'about', 'About', 'Local', 'Eyebrow', 'text', 'Las Cruces', 1, 46],
  ['c_about_local_title', 'about', 'About', 'Local', 'Section title', 'heading', 'Rooted in the Mesilla Valley', 1, 47],
  ['c_about_local_desc', 'about', 'About', 'Local', 'Description', 'textarea', "We're proud to support shops, events, and organizations across Southern New Mexico with websites and tools that help local businesses show up online with confidence.", 1, 48],
  ['c_proj_page_title', 'projects', 'Projects', 'Hero', 'Page title', 'heading', 'Client Projects', 1, 49],
  ['c_proj_page_desc', 'projects', 'Projects', 'Hero', 'Description', 'textarea', 'A look at websites and digital products we have shipped for businesses across Southern New Mexico.', 1, 50],
]

const pages = [
  ['home', 'Home', '/', 'published'],
  ['about', 'About', '/pages/about/', 'published'],
  ['projects', 'Projects', '/pages/projects/', 'published'],
  ['tools', 'Tools', '/pages/tools/', 'published'],
  ['legal', 'Legal', '/pages/legal/', 'published'],
]

const media = [
  ['m_hero', 'hero.png', 'image', '—', 'Home · Hero', 'https://www.blacnova.net/ui/img/hero.png'],
  ['m_one', 'one.png', 'image', '—', 'Home · Mockup', 'https://www.blacnova.net/ui/img/one.png'],
  ['m_three', 'three.png', 'image', '—', 'Home · Mobile', 'https://www.blacnova.net/ui/img/three.png'],
  ['m_logo', 'bn.png', 'image', '—', 'Brand', 'https://www.blacnova.net/ui/img/bn.png'],
  ['m_logo_white', 'logo_white.png', 'image', '—', 'Brand', 'https://www.blacnova.net/ui/img/logo_white.png'],
  ['m_bn_orange', 'bn_orange.png', 'image', '—', 'Brand', 'https://www.blacnova.net/ui/img/bn_orange.png'],
  ['m_zia_symbol', 'zia-symbol.png', 'image', '—', 'Home · Local', 'https://www.blacnova.net/ui/img/zia-symbol.png'],
  ['m_farm', 'farm.png', 'image', '—', 'Home · Client logos', 'https://www.blacnova.net/ui/img/farm.png'],
  ['m_chios', 'chios.png', 'image', '—', 'Home · Client logos', 'https://www.blacnova.net/ui/img/chios.png'],
  ['m_zia', 'zia.png', 'image', '—', 'Home · Client logos', 'https://www.blacnova.net/ui/img/zia.png'],
  ['m_wildwest', 'wildwest.png', 'image', '—', 'Home · Client logos', 'https://www.blacnova.net/ui/img/wildwest.png'],
  ['m_source', 'source.png', 'image', '—', 'Home · Client logos', 'https://www.blacnova.net/ui/img/source.png'],
  ['m_src1', 'src1.png', 'image', '—', 'Projects · Showcase', 'https://www.blacnova.net/ui/img/src1.png'],
  ['m_src2', 'src2.png', 'image', '—', 'Projects · Showcase', 'https://www.blacnova.net/ui/img/src2.png'],
  ['m_src3', 'src3.png', 'image', '—', 'Projects · Showcase', 'https://www.blacnova.net/ui/img/src3.png'],
  ['m_src4', 'src4.png', 'image', '—', 'Projects · Showcase', 'https://www.blacnova.net/ui/img/src4.png'],
  ['m_src5', 'src5.png', 'image', '—', 'Projects · Showcase', 'https://www.blacnova.net/ui/img/src5.png'],
  ['m_src6', 'src6.png', 'image', '—', 'Projects · Showcase', 'https://www.blacnova.net/ui/img/src6.png'],
  ['m_dash', 'dash.png', 'image', '—', 'Marketing', 'https://www.blacnova.net/ui/img/dash.png'],
  ['m_social_cta', 'social_cta.png', 'image', '—', 'Marketing', 'https://www.blacnova.net/ui/img/social_cta.png'],
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

for (const [mid, name, type, size, usedOn, url] of media) {
  lines.push(`INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at, url) VALUES (
    '${mid}', '${websiteId}', '${esc(name)}', '${type}', '${size}', '${esc(usedOn)}', '2026-08-05', '${esc(url)}'
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

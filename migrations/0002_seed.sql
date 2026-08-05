-- Seed Blacnova owner account + www.blacnova.net
DELETE FROM support_tickets;
DELETE FROM analytics_points;
DELETE FROM submissions;
DELETE FROM media_items;
DELETE FROM maintenance;
DELETE FROM pages;
DELETE FROM content_blocks;
DELETE FROM users;
DELETE FROM websites;
INSERT INTO websites (id, name, domain, status, modules, github_repo) VALUES (
  'site_blacnova',
  'Blacnova Development',
  'www.blacnova.net',
  'live',
  '["overview","content","media","pages","maintenance","submissions","analytics","settings"]',
  'nicholasxdavis/BlacnovaWebsite'
);
INSERT INTO users (id, email, name, role, password_hash, website_id) VALUES (
  'user_nic',
  'nic@blacnova.net',
  'Nic Davis',
  'owner',
  '3b5500564a41ca6d1c01ad24a5ca0064:b1f4cef718787619adb559bd809eb7282b8abedc026ae057e81cb540e7d6f3d7',
  'site_blacnova'
);
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_home_headline', 'site_blacnova', 'home', 'Home', 'Hero', 'Headline', 'heading', 'Elevate Your Digital Presence', 1, 1
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_home_sub', 'site_blacnova', 'home', 'Home', 'Hero', 'Supporting text', 'textarea', 'Cutting-edge development solutions tailored to your business needs in Las Cruces, New Mexico', 1, 2
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_home_cta', 'site_blacnova', 'home', 'Home', 'Hero', 'Primary call to action', 'text', 'Start Your Project', 1, 3
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_home_cta2', 'site_blacnova', 'home', 'Home', 'Hero', 'Secondary call to action', 'text', 'Our Services', 1, 4
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_clients_title', 'site_blacnova', 'home', 'Home', 'Clients', 'Section title', 'heading', 'Businesses We''ve Worked With', 1, 5
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_services_eyebrow', 'site_blacnova', 'home', 'Home', 'Services', 'Eyebrow', 'text', 'Our Services', 1, 6
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_services_title', 'site_blacnova', 'home', 'Home', 'Services', 'Section title', 'heading', 'Digital Solutions', 1, 7
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_services_desc', 'site_blacnova', 'home', 'Home', 'Services', 'Description', 'textarea', 'We provide a wide range of digital services to help your business grow. Our team of experts is dedicated to delivering high-quality solutions tailored to your unique needs.', 1, 8
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_local_title', 'site_blacnova', 'home', 'Home', 'Local', 'Section title', 'heading', 'Proudly Serving Las Cruces', 1, 9
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_about_intro', 'site_blacnova', 'about', 'About', 'Intro', 'Page intro', 'textarea', 'Blacnova Development builds modern websites and digital tools for businesses in Las Cruces and beyond.', 1, 10
  );
INSERT INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES (
    'c_quote_title', 'site_blacnova', 'home', 'Home', 'Quote', 'Section title', 'heading', 'Get a Quote', 1, 11
  );
INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (
    'home', 'site_blacnova', 'Home', '/', 'published', '2026-08-05'
  );
INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (
    'about', 'site_blacnova', 'About', '/pages/about/', 'published', '2026-08-05'
  );
INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (
    'projects', 'site_blacnova', 'Projects', '/pages/projects/', 'published', '2026-08-05'
  );
INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (
    'tools', 'site_blacnova', 'Tools', '/pages/tools/', 'published', '2026-08-05'
  );
INSERT INTO pages (id, website_id, title, slug, status, updated_at) VALUES (
    'legal', 'site_blacnova', 'Legal', '/pages/legal/', 'published', '2026-08-05'
  );
INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at) VALUES (
    'm_hero', 'site_blacnova', 'hero.png', 'image', '—', 'Home · Hero', '2026-08-05'
  );
INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at) VALUES (
    'm_one', 'site_blacnova', 'one.png', 'image', '—', 'Home · Mockup', '2026-08-05'
  );
INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at) VALUES (
    'm_three', 'site_blacnova', 'three.png', 'image', '—', 'Home · Mobile', '2026-08-05'
  );
INSERT INTO media_items (id, website_id, name, type, size, used_on, updated_at) VALUES (
    'm_logo', 'site_blacnova', 'bn.png', 'image', '—', 'Brand', '2026-08-05'
  );
INSERT INTO maintenance (website_id, enabled, title, message, expected_return) VALUES (
  'site_blacnova',
  0,
  'We''ll be right back',
  'Blacnova Development is temporarily offline for improvements. Please check back soon or email nic@blacnova.net.',
  ''
);
INSERT INTO submissions (id, website_id, name, email, phone, subject, message, source, status, notes, created_at) VALUES (
    'sub_1', 'site_blacnova', 'Jordan Miles', 'jordan@example.com', '(575) 555-0142', 'Website redesign', 'Looking for a full redesign of our restaurant site this fall.', 'Quote form', 'new', NULL, '2026-08-04T15:20:00.000Z'
  );
INSERT INTO submissions (id, website_id, name, email, phone, subject, message, source, status, notes, created_at) VALUES (
    'sub_2', 'site_blacnova', 'Alex Rivera', 'alex@mesillavalley.co', NULL, 'SEO help', 'Can you audit our local SEO and Google Business profile?', 'Contact form', 'in_progress', 'Scheduled discovery call.', '2026-08-03T11:05:00.000Z'
  );
INSERT INTO submissions (id, website_id, name, email, phone, subject, message, source, status, notes, created_at) VALUES (
    'sub_3', 'site_blacnova', 'Sam Ortiz', 'sam@ziabuilding.com', '(575) 555-0199', 'Maintenance plan', 'Interested in ongoing updates and hosting support.', 'Quote form', 'read', NULL, '2026-08-01T09:40:00.000Z'
  );
INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions) VALUES (
    'an_1', 'site_blacnova', '2026-07-06', 820, 2104, 4
  );
INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions) VALUES (
    'an_2', 'site_blacnova', '2026-07-13', 905, 2288, 6
  );
INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions) VALUES (
    'an_3', 'site_blacnova', '2026-07-20', 874, 2190, 5
  );
INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions) VALUES (
    'an_4', 'site_blacnova', '2026-07-27', 1012, 2540, 8
  );
INSERT INTO analytics_points (id, website_id, date, visitors, pageviews, submissions) VALUES (
    'an_5', 'site_blacnova', '2026-08-03', 1088, 2712, 7
  );

-- Expand Blacnova portal content + media library (idempotent upserts)
-- Does not touch users/passwords/websites.

INSERT OR IGNORE INTO content_blocks (id, website_id, page_id, page_name, section, label, type, value, published, sort_order) VALUES
('c_svc_web_title', 'site_blacnova', 'home', 'Home', 'Services', 'Web Development title', 'text', 'Web Development', 1, 9),
('c_svc_web_desc', 'site_blacnova', 'home', 'Home', 'Services', 'Web Development description', 'textarea', 'We build responsive, high-performing websites that are secure, scalable, and tailored to your brand. From simple landing pages to complex web applications, our solutions drive user engagement.', 1, 10),
('c_svc_seo_title', 'site_blacnova', 'home', 'Home', 'Services', 'SEO title', 'text', 'SEO Optimization', 1, 11),
('c_svc_seo_desc', 'site_blacnova', 'home', 'Home', 'Services', 'SEO description', 'textarea', 'Increase your online visibility and rank higher on search engines. We use proven strategies for on-page, off-page, and technical SEO to attract organic traffic and generate qualified leads.', 1, 12),
('c_svc_cloud_title', 'site_blacnova', 'home', 'Home', 'Services', 'Cloud title', 'text', 'Cloud Solutions', 1, 13),
('c_svc_cloud_desc', 'site_blacnova', 'home', 'Home', 'Services', 'Cloud description', 'textarea', 'Leverage the power of the cloud with our expert services. We offer cloud migration, infrastructure management, and custom cloud-native application development to enhance your business agility.', 1, 14),
('c_svc_ecom_title', 'site_blacnova', 'home', 'Home', 'Services', 'E-Commerce title', 'text', 'E-Commerce', 1, 15),
('c_svc_ecom_desc', 'site_blacnova', 'home', 'Home', 'Services', 'E-Commerce description', 'textarea', 'Launch and grow your online store with our end-to-end e-commerce solutions. We build secure, user-friendly platforms with seamless payment gateway integration and inventory management.', 1, 16),
('c_svc_api_title', 'site_blacnova', 'home', 'Home', 'Services', 'API title', 'text', 'API Integration', 1, 17),
('c_svc_api_desc', 'site_blacnova', 'home', 'Home', 'Services', 'API description', 'textarea', 'Connect your software systems and automate workflows with our custom API integration services. We ensure seamless data flow between your applications to improve efficiency and productivity.', 1, 18),
('c_webdev_eyebrow', 'site_blacnova', 'home', 'Home', 'Web CTA', 'Eyebrow', 'text', 'Web Development', 1, 19),
('c_webdev_title', 'site_blacnova', 'home', 'Home', 'Web CTA', 'Title', 'heading', 'Custom Websites Built for Your Business', 1, 20),
('c_webdev_desc', 'site_blacnova', 'home', 'Home', 'Web CTA', 'Description', 'textarea', 'From landing pages to full-scale web apps, we design and develop fast, responsive sites that look sharp and convert visitors into customers.', 1, 21),
('c_webdev_cta', 'site_blacnova', 'home', 'Home', 'Web CTA', 'Button label', 'text', 'Start Your Project', 1, 22),
('c_quote_eyebrow', 'site_blacnova', 'home', 'Home', 'Quote', 'Eyebrow', 'text', 'Let''s Talk', 1, 23),
('c_quote_desc', 'site_blacnova', 'home', 'Home', 'Quote', 'Description', 'textarea', 'Fill out the form below and we''ll get back to you with a personalized quote and project plan.', 1, 25),
('c_projects_eyebrow', 'site_blacnova', 'home', 'Home', 'Projects CTA', 'Eyebrow', 'text', 'Featured Projects', 1, 26),
('c_projects_title', 'site_blacnova', 'home', 'Home', 'Projects CTA', 'Title', 'heading', 'Client Website Showcase', 1, 27),
('c_projects_desc', 'site_blacnova', 'home', 'Home', 'Projects CTA', 'Description', 'textarea', 'Check out our latest projects. We work closely with our clients to deliver modern, responsive, and high-performing websites that meet all their goals.', 1, 28),
('c_projects_cta', 'site_blacnova', 'home', 'Home', 'Projects CTA', 'Button label', 'text', 'View Client Projects', 1, 29),
('c_local_eyebrow', 'site_blacnova', 'home', 'Home', 'Local', 'Eyebrow', 'text', 'Our Roots', 1, 30),
('c_local_desc', 'site_blacnova', 'home', 'Home', 'Local', 'Description', 'textarea', 'As a locally owned business, we''re committed to helping our community thrive through technology.', 1, 32),
('c_local_card1_title', 'site_blacnova', 'home', 'Home', 'Local', 'Card 1 title', 'text', 'Community Focused', 1, 33),
('c_local_card1_desc', 'site_blacnova', 'home', 'Home', 'Local', 'Card 1 description', 'textarea', 'We reinvest in local businesses and support the growth of the Mesilla Valley''s digital economy.', 1, 34),
('c_local_card2_title', 'site_blacnova', 'home', 'Home', 'Local', 'Card 2 title', 'text', 'Local Expertise', 1, 35),
('c_local_card2_desc', 'site_blacnova', 'home', 'Home', 'Local', 'Card 2 description', 'textarea', 'Our team understands the unique needs and challenges of businesses in Southern New Mexico.', 1, 36),
('c_local_card3_title', 'site_blacnova', 'home', 'Home', 'Local', 'Card 3 title', 'text', 'Personal Service', 1, 37),
('c_local_card3_desc', 'site_blacnova', 'home', 'Home', 'Local', 'Card 3 description', 'textarea', 'Unlike national agencies, we offer face-to-face consultations and personalized support.', 1, 38),
('c_footer_tagline', 'site_blacnova', 'home', 'Home', 'Footer', 'Tagline', 'text', 'Founded in Las Cruces, New Mexico.', 1, 39),
('c_about_eyebrow', 'site_blacnova', 'about', 'About', 'Intro', 'Eyebrow', 'text', 'How We Work', 1, 40),
('c_about_title', 'site_blacnova', 'about', 'About', 'Intro', 'Page title', 'heading', 'What We Stand For', 1, 41),
('c_about_offer_eyebrow', 'site_blacnova', 'about', 'About', 'Services', 'Eyebrow', 'text', 'What We Offer', 1, 43),
('c_about_offer_title', 'site_blacnova', 'about', 'About', 'Services', 'Section title', 'heading', 'Services Built Around Your Goals', 1, 44),
('c_about_offer_desc', 'site_blacnova', 'about', 'About', 'Services', 'Description', 'textarea', 'From concept to launch and beyond, here''s what we can help with.', 1, 45),
('c_about_local_eyebrow', 'site_blacnova', 'about', 'About', 'Local', 'Eyebrow', 'text', 'Las Cruces', 1, 46),
('c_about_local_title', 'site_blacnova', 'about', 'About', 'Local', 'Section title', 'heading', 'Rooted in the Mesilla Valley', 1, 47),
('c_about_local_desc', 'site_blacnova', 'about', 'About', 'Local', 'Description', 'textarea', 'We''re proud to support shops, events, and organizations across Southern New Mexico with websites and tools that help local businesses show up online with confidence.', 1, 48),
('c_proj_page_title', 'site_blacnova', 'projects', 'Projects', 'Hero', 'Page title', 'heading', 'Client Projects', 1, 49),
('c_proj_page_desc', 'site_blacnova', 'projects', 'Projects', 'Hero', 'Description', 'textarea', 'A look at websites and digital products we have shipped for businesses across Southern New Mexico.', 1, 50);

UPDATE content_blocks SET sort_order = 24 WHERE id = 'c_quote_title' AND website_id = 'site_blacnova';
UPDATE content_blocks SET sort_order = 31 WHERE id = 'c_local_title' AND website_id = 'site_blacnova';
UPDATE content_blocks SET sort_order = 42 WHERE id = 'c_about_intro' AND website_id = 'site_blacnova';

INSERT OR IGNORE INTO media_items (id, website_id, name, type, size, used_on, updated_at, url) VALUES
('m_logo_white', 'site_blacnova', 'logo_white.png', 'image', '—', 'Brand', '2026-08-05', 'https://www.blacnova.net/ui/img/logo_white.png'),
('m_bn_orange', 'site_blacnova', 'bn_orange.png', 'image', '—', 'Brand', '2026-08-05', 'https://www.blacnova.net/ui/img/bn_orange.png'),
('m_zia_symbol', 'site_blacnova', 'zia-symbol.png', 'image', '—', 'Home · Local', '2026-08-05', 'https://www.blacnova.net/ui/img/zia-symbol.png'),
('m_farm', 'site_blacnova', 'farm.png', 'image', '—', 'Home · Client logos', '2026-08-05', 'https://www.blacnova.net/ui/img/farm.png'),
('m_chios', 'site_blacnova', 'chios.png', 'image', '—', 'Home · Client logos', '2026-08-05', 'https://www.blacnova.net/ui/img/chios.png'),
('m_zia', 'site_blacnova', 'zia.png', 'image', '—', 'Home · Client logos', '2026-08-05', 'https://www.blacnova.net/ui/img/zia.png'),
('m_wildwest', 'site_blacnova', 'wildwest.png', 'image', '—', 'Home · Client logos', '2026-08-05', 'https://www.blacnova.net/ui/img/wildwest.png'),
('m_source', 'site_blacnova', 'source.png', 'image', '—', 'Home · Client logos', '2026-08-05', 'https://www.blacnova.net/ui/img/source.png'),
('m_src1', 'site_blacnova', 'src1.png', 'image', '—', 'Projects · Showcase', '2026-08-05', 'https://www.blacnova.net/ui/img/src1.png'),
('m_src2', 'site_blacnova', 'src2.png', 'image', '—', 'Projects · Showcase', '2026-08-05', 'https://www.blacnova.net/ui/img/src2.png'),
('m_src3', 'site_blacnova', 'src3.png', 'image', '—', 'Projects · Showcase', '2026-08-05', 'https://www.blacnova.net/ui/img/src3.png'),
('m_src4', 'site_blacnova', 'src4.png', 'image', '—', 'Projects · Showcase', '2026-08-05', 'https://www.blacnova.net/ui/img/src4.png'),
('m_src5', 'site_blacnova', 'src5.png', 'image', '—', 'Projects · Showcase', '2026-08-05', 'https://www.blacnova.net/ui/img/src5.png'),
('m_src6', 'site_blacnova', 'src6.png', 'image', '—', 'Projects · Showcase', '2026-08-05', 'https://www.blacnova.net/ui/img/src6.png'),
('m_dash', 'site_blacnova', 'dash.png', 'image', '—', 'Marketing', '2026-08-05', 'https://www.blacnova.net/ui/img/dash.png'),
('m_social_cta', 'site_blacnova', 'social_cta.png', 'image', '—', 'Marketing', '2026-08-05', 'https://www.blacnova.net/ui/img/social_cta.png');

UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/hero.png', used_on = 'Home · Hero' WHERE id = 'm_hero';
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/one.png', used_on = 'Home · Mockup' WHERE id = 'm_one';
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/three.png', used_on = 'Home · Mobile' WHERE id = 'm_three';
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/bn.png', used_on = 'Brand' WHERE id = 'm_logo';

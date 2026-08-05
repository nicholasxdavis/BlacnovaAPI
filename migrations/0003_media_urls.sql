ALTER TABLE media_items ADD COLUMN url TEXT;
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/hero.png' WHERE id = 'm_hero';
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/one.png' WHERE id = 'm_one';
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/three.png' WHERE id = 'm_three';
UPDATE media_items SET url = 'https://www.blacnova.net/ui/img/bn.png' WHERE id = 'm_logo';

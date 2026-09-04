-- Phase 7: enrich High–Low versioned guide and config copy.

UPDATE public.game_versions
SET guide_i18n = jsonb_build_object(
  'en', 'Roll three six-sided dice. Total 3–10 is Low; 11–18 is High. Any triple loses both sides. Choose High or Low for Total Return x2 when correct and non-triple. Settlement is server-authoritative; visuals only reveal the result.',
  'lo', 'ລູກເຕົ່າ 6 ໜ້າ ສາມລູກ. ລວມ 3–10 ແມ່ນຕ່ຳ; 11–18 ແມ່ນສູງ. ເລກຊ້ຳສາມໜ້າແພ້ທັງສອງດ້ານ. ເລືອກສູງ ຫຼື ຕ່ຳ ເພື່ອ Total Return x2 ເມື່ອຖືກ ແລະ ບໍ່ແມ່ນ triple. ຜົນຕັດສິນທີ່ເຊີບເວີ; ພາບເປີດເຜີຍຜົນເທົ່ານັ້ນ.'
),
config = jsonb_build_object(
  'low_range', jsonb_build_array(3, 10),
  'high_range', jsonb_build_array(11, 18),
  'multiplier', 2,
  'triples_lose', true,
  'dice_count', 3,
  'die_faces', 6
)
WHERE game_id = 'high-low' AND version = 1;

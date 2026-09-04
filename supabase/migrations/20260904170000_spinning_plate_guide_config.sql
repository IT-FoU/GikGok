-- Phase 8: enrich Spinning Plate versioned guide and slot config.

UPDATE public.game_versions
SET guide_i18n = jsonb_build_object(
  'en', 'Twelve slots under a fixed top pointer. Select exactly one slot; only an exact land wins. Returns: slots 1–4 x2, 5–7 x3, 8–9 x4, 10 x5, 11 x7, 12 x10. Icons: Clover, Diamond, Heart, Spade, Bell, Cherry, Lucky Clover, Star, Lucky 7, Crown, Diamond King, Jackpot. Settlement is server-authoritative; visuals only reveal.',
  'lo', 'ມີ 12 ຊ່ອງ ແລະ ໂຕຊີ້ຄົງທີ່ເທິງສຸດ. ເລືອກ 1 ຊ່ອງ — ຕ້ອງຕົກກົງກັນເທົ່ານັ້ນຈຶ່ງຊະນະ. ຜົນຕອບແທນ: 1–4 x2, 5–7 x3, 8–9 x4, 10 x5, 11 x7, 12 x10. ຜົນຕັດສິນທີ່ເຊີບເວີ; ພາບເປີດເຜີຍຜົນເທົ່ານັ້ນ.'
),
config = jsonb_build_object(
  'slots', 12,
  'multipliers', jsonb_build_object(
    '1', 2, '2', 2, '3', 2, '4', 2,
    '5', 3, '6', 3, '7', 3,
    '8', 4, '9', 4,
    '10', 5, '11', 7, '12', 10
  ),
  'icons', jsonb_build_array(
    'Clover','Diamond','Heart','Spade','Bell','Cherry',
    'Lucky Clover','Star','Lucky 7','Crown','Diamond King','Jackpot'
  )
)
WHERE game_id = 'spinning-plate' AND version = 1;

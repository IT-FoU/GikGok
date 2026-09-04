-- Phase 6: enrich Fish–Prawn–Crab versioned guide copy (Lao + English).

UPDATE public.game_versions
SET guide_i18n = jsonb_build_object(
  'en', 'Three dice use Fish, Prawn, Crab, Gourd, Rooster, and Deer. Single Symbol: choose one — if it appears on at least one die, Total Return is x2. Special Pair: choose two different symbols — both must appear across the three dice for Total Return x10. Settlement is server-authoritative; visuals only reveal the result.',
  'lo', 'ລູກເຕົ່າສາມລູກໃຊ້ສັນຍາລັກ ປາ, ກຸ້ງ, ປູ, ນ້ຳເຕົ້າ, ໄກ່ແຮງ, ກວາງ. Single Symbol: ເລືອກ 1 — ຖ້າອອກຢ່າງນ້ອຍ 1 ໜ້າ Total Return x2. Special Pair: ເລືອກ 2 ສັນຍາລັກຕ່າງກັນ — ຕ້ອງອອກທັງສອງເພື່ອ x10. ຜົນເກມຕັດສິນທີ່ເຊີບເວີ; ພາບເປີດເຜີຍຜົນເທົ່ານັ້ນ.'
),
config = jsonb_build_object(
  'symbols', jsonb_build_array('fish','prawn','crab','gourd','rooster','deer'),
  'single_symbol_multiplier', 2,
  'special_pair_multiplier', 10,
  'dice_count', 3
)
WHERE game_id = 'fish-prawn-crab' AND version = 1;

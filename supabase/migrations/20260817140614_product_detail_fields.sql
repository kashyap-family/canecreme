-- Add product detail fields displayed in product.html accordions.
-- Additive only: no existing product, checkout, inventory, or order logic changes.

alter table if exists public.products
  add column if not exists ingredients text,
  add column if not exists allergens text,
  add column if not exists nutritional_info text,
  add column if not exists storage_info text,
  add column if not exists shelf_life text;

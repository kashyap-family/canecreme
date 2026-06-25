# CaneCreme Backend Plan

This is the working backend plan for making `canecreme.co` a complete e-commerce operation, not just a beautiful storefront.

## Current Backend Status

The site already has a Supabase-backed foundation:

- Products are stored in Supabase and displayed on the shop/product pages.
- Checkout creates Supabase orders and order items before payment.
- Razorpay live key ID is present on the frontend; the secret must stay only in Supabase Edge Function secrets.
- COD and prepaid order confirmation functions exist.
- RapidShyp order creation exists and is called after paid/COD confirmation.
- Admin panel can manage products and view/update orders.
- Returning-customer checkout lookup exists by phone number.

This is enough for controlled early sales, but it is not yet a mature e-commerce backend.

## What A Full E-Commerce Backend Needs

1. Product catalog
   - Products, categories, pricing, images, delivery zone, active/hidden status.
   - SKU for each sellable item.
   - Low-stock threshold so the admin dashboard can warn before stock runs out.

2. Inventory management
   - Current stock.
   - Reserved stock for orders started but not completed.
   - Stock deduction after successful payment or COD confirmation.
   - Inventory movement history: stock added, sold, returned, manually adjusted.

3. Order management
   - Order list, detail view, status changes, customer details, item details.
   - Status lifecycle: new, processing, shipped, delivered, cancelled.
   - Internal admin notes.
   - Human-readable order numbers, not only UUIDs.

4. Payment tracking
   - Razorpay order ID and payment ID stored against each order.
   - Payment event log for created, paid, failed, refunded, webhook events.
   - Razorpay signature verification for every online payment.
   - Razorpay webhook endpoint so payment status can be corrected even if the customer closes the browser.

5. Shipping and fulfilment
   - RapidShyp order creation.
   - AWB/tracking number storage.
   - Shipment event log for pushed, shipped, in transit, delivered, failed, returned.
   - Manual retry from admin if shipping push fails.

6. Admin security
   - Replace shared frontend password with real Supabase Auth admin login.
   - Keep all admin writes behind Edge Functions.
   - Do not allow browser-side product insert/update/delete using the public key.
   - Activity log for admin actions.

7. Customer communication
   - Order confirmation message.
   - Payment success/failure message.
   - Shipment/tracking message.
   - Delivery/cancellation/refund message.
   - For India, WhatsApp is probably more useful than email at first.

8. Reporting
   - Daily orders and revenue.
   - COD vs prepaid split.
   - Bestselling products.
   - Pending fulfilment.
   - Low-stock products.
   - Failed payment/shipping attempts.

9. Compliance and reliability
   - Privacy policy and return/refund policy aligned with real backend behavior.
   - No secrets in GitHub/static files.
   - Database backups and export process.
   - Error logs for Edge Functions.

## Recommended Build Phases

### Phase 1: Stabilize The Current Launch Backend

- Add missing backend tables/columns for SKU, low stock, reserved stock, payment events, shipment events, inventory movements, and admin activity logs.
- Add `RAZORPAY_KEY_SECRET` in Supabase Edge Function secrets.
- Wire frontend checkout to `create-razorpay-order` so Razorpay signature verification is always used.
- Store Razorpay order IDs and payment events.
- Deduct inventory only after payment/COD confirmation.
- Store order item snapshots permanently so old orders never lose product names.

### Phase 2: Make Admin Operational

- Replace shared password with real admin login.
- Move product create/edit/delete into Edge Functions.
- Add inventory adjustment screen.
- Add low-stock dashboard.
- Add order filters by payment/order/shipping status.
- Add internal notes on orders.

### Phase 3: Automate Payments And Shipping

- Add Razorpay webhook Edge Function.
- Add RapidShyp webhook/status sync if available.
- Store AWB/tracking IDs.
- Add admin retry buttons for failed payment/shipping sync.
- Send WhatsApp templates or email updates.

### Phase 4: Business Dashboard

- Add daily sales summary.
- Add bestseller and inventory reports.
- Add CSV export for orders.
- Add payment reconciliation report.

## First Technical Step Added

Migration created:

`supabase/migrations/20260625073752_ecommerce_backend_foundation.sql`

It is additive and designed not to break the current storefront. It adds:

- Product SKU/category/delivery/stock metadata.
- Order payment/shipping/admin metadata.
- Order item snapshots.
- `inventory_movements`.
- `payment_events`.
- `shipment_events`.
- `admin_activity_log`.

## Immediate Owner Actions Needed

- Add `RAZORPAY_KEY_SECRET` in Supabase secrets.
- Confirm whether COD should remain enabled for all India or only selected PIN codes.
- Confirm the admin users who should have access once we replace the shared password.
- Confirm whether WhatsApp notifications should use manual links first or an official WhatsApp Business API provider.

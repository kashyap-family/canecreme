# CaneCreme — Project State
> Last updated: Session 21 handoff (2026-05-30)
> Rule: Every agent MUST update this file before context fills. No assumptions. No hallucinations. Only verified facts.

---

## 1. Project Overview
- **Brand:** CaneCreme — Delhi-based gelato/dessert brand
- **Products:** Raw cane sugar gelato, syrups, jam spreads
- **Tagline:** "No More Guilt Indulgence"
- **Email:** canecreme@gmail.com
- **Instagram:** @canecreme (~140 followers, ~150 posts)
- **Locations:** GK1, Moti Nagar, DLF 1, DLF 5 (Delhi NCR)
- **Also on:** Zomato & Swiggy
- **Owner:** Kritika Kashyap

---

## 2. Hosting & Repository
- **GitHub repo:** https://github.com/kashyap-family/canecreme
- **Branch:** `main`
- **Hosting:** GitHub Pages
- **Live domain:** www.canecreme.co
- **CNAME file:** contains `www.canecreme.co`
- **Deploy:** push to `main` → live in ~2 minutes

### Git push command (always use this):
```bash
cd "C:\Users\kritika kashyap\Desktop\cane creme website\canecreme-main"
git add exact-files-only
git commit -m "your message"
git push origin main
```
Never use `git add .` here without checking `git status --short` first. This repo often has local temp files, duplicate assets, and Codex worktree files that should not be pushed.

---

## 3. Tech Stack
- **Frontend:** Pure static HTML + CSS + Vanilla JS (no frameworks, no npm, no build step)
- **Backend:** Supabase (PostgreSQL via REST API)
- **Payments:** Razorpay
- **Fonts:** Lexend (headings) + Lobster (script/tagline) + DM Sans (body) via Google Fonts
- **No Node.js installed** on the dev machine
- **Python:** Available as `python` (Microsoft Store version) — use for local HTTP server if needed
- **Preview server:** PowerShell HTTP server via `.claude/launch.json` on port 3456
- **Supabase CLI:** Installed via Scoop and logged in. Successful deploy path used: `%USERPROFILE%\scoop\shims\supabase.exe`
- **Local preview note:** `.claude/launch.json` is currently modified locally to use `npx serve -l 3456 .`; this is not pushed and should stay local unless user asks.

---

## 4. Credentials & Config
> File: `js/config.js`

| Key | Value |
|-----|-------|
| Supabase URL | `https://qfphvsyidbyhbyeyigrh.supabase.co` |
| Supabase Anon Key | `sb_publishable_usfZZ8OEQjJKYP0dGLqImg_pbAyUrL6` |
| Razorpay Key | `rzp_live_SvBwWNQkqzmora` ✅ LIVE MODE Key ID |
| Admin Password | `canecreme2026` |
| Support Phone | `9891239312` |
| Store Currency | `INR` |

✅ **Razorpay Key ID is now Live Mode.** Do not store or ask for Razorpay Key Secret in this static repo/chat.

### Supabase / Shiprocket Secrets
- Supabase project ref: `qfphvsyidbyhbyeyigrh`
- Edge Function secrets were entered by user in Supabase dashboard, not committed:
  - `SHIPROCKET_EMAIL`
  - `SHIPROCKET_PASSWORD`
  - `SHIPROCKET_PICKUP_LOCATION` = `Kshitiz`
  - `SHIPROCKET_PACKAGE_LENGTH_CM`
  - `SHIPROCKET_PACKAGE_BREADTH_CM`
  - `SHIPROCKET_PACKAGE_HEIGHT_CM`
  - `SHIPROCKET_PACKAGE_WEIGHT_KG`
  - `SERVICE_ROLE_KEY`
- Supabase rejects custom secret names beginning with `SUPABASE_`; use `SERVICE_ROLE_KEY`, not `SUPABASE_SERVICE_ROLE_KEY`.
- Shiprocket API user: `canecremeorders@gmail.com`. Password is private and should remain only in Shiprocket/Supabase secrets.
- Shiprocket pickup profile is verified. Pickup nickname: `Kshitiz`. Warehouse SPOC: Kshitiz Kashyap / 7428906045.

---

## 5. File Structure
```
canecreme-main/
├── index.html          ← Homepage
├── shop.html           ← All products grid
├── about.html          ← Brand story page
├── checkout.html       ← Checkout (Razorpay)
├── success.html        ← Order confirmed page
├── admin.html          ← Admin panel (password: canecreme2026)
├── shipping-policy.html ← Draft shipping policy page
├── return-policy.html  ← Draft returns/refunds/cancellation page
├── privacy-policy.html ← Draft privacy policy page
├── terms.html          ← Draft terms & conditions page
├── CNAME               ← www.canecreme.co
├── PROJECT-STATE.md    ← This file
├── css/
│   ├── style.css       ← Main stylesheet (all pages)
│   └── admin.css       ← Admin panel styles
├── js/
│   ├── config.js       ← API keys & store config
│   ├── cart.js         ← Cart (localStorage: 'canecreme_cart')
│   ├── products.js     ← Fetch & render products from Supabase
│   ├── checkout.js     ← Razorpay payment flow
│   ├── main.js         ← UI: popup, animations, social proof toast, nav, hamburger
│   └── admin.js        ← Admin panel logic
└── Assets/
    ├── logo.png        ← Real CaneCreme logo (black rounded text on WHITE bg)
    ├── logo.svg        ← Old custom SVG — UNUSED
    ├── beet-bite-website1.jpg  ← Used: hero + referenced in split section
    ├── beet-bite-website2.jpg  ← Used: split section
    └── beet-bite-website3.jpg  ← Available, not used yet
```

---

## 6. Supabase Database Tables
Inferred from code — verify in Supabase dashboard before modifying.

### `products`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| name | text | |
| description | text | |
| price | numeric | in INR |
| compare_at_price | numeric | optional, shows strikethrough |
| images | text[] | array of URLs |
| stock | integer | 0 = out of stock |
| is_active | boolean | false = hidden from shop |
| rating | numeric | optional, defaults to 5 in JS |
| created_at | timestamp | |
| delivery_type | text | ⚠️ NOT ADDED YET. Values: `pan_india` / `delhi_only`. Default: `pan_india`. Must be added manually in Supabase Table Editor. |

### `orders`
| Column | Type |
|--------|------|
| id | uuid |
| customer_name | text |
| customer_email | text |
| customer_phone | text |
| shipping_address | jsonb `{line1, line2, city, state, pin, country}` |
| total_amount | numeric |
| payment_status | text `'pending' / 'paid'` |
| order_status | text `'new' / 'processing'` |
| payment_id | text (Razorpay payment ID) |

### `order_items`
| Column | Type |
|--------|------|
| order_id | uuid (FK → orders) |
| product_id | uuid (FK → products) |
| quantity | integer |
| price | numeric |

### `leads`
| Column | Type | Notes |
|--------|------|-------|
| name | text | |
| phone | text | stored as `+91XXXXXXXXXX` |
| email | text | |
| source | text | `'popup'` |

---

## 7. Current Design System

### Active Colour Palette: Lime & Orange
```css
--cream:        #FAFEF0;   /* light lime-white — main background */
--cream-dark:   #EEF9B0;   /* light green tint */
--green:        #BAD50D;   /* lime green — primary buttons, strips, CTA */
--green-mid:    #1C2400;   /* deep dark olive — dark section backgrounds */
--green-light:  #8FA309;   /* darker lime — hover states */
--green-pale:   #EEF9B0;   /* very light lime tint — card backgrounds */
--gold:         #F7AD4E;   /* orange — accent, badges, tagline */
--gold-light:   #FBCF8A;   /* lighter orange */
--dark:         #1C2400;   /* deep dark olive — all body text */
--border:       #DFF09A;   /* light lime border */
```
Footer hardcoded: `background: #1C2400`
Razorpay theme colour: `#BAD50D`

### Colour Palette History (most recent = active)
1. Green / nature
2. Tropical Punch (coral + yellow)
3. Royal Purple + Yellow (#5b2d8e)
4. Vibrant Purple (#6B21A8)
5. Mango Fiesta (orange #F97316 + teal #14B8A6)
6. Rich Chocolate & Gold (#92400E + #F59E0B)
7. Earthy Organic (#283618 + #FEFAE0 + #DDA15E)
8. **Lime & Orange (#BAD50D + #F7AD4E + #FAFEF0) ← CURRENT**

### Typography
- Display font: `Lexend` (headings, product names)
- Script font: `Lobster` (tagline, decorative italic accents)
- Body font: `DM Sans` (all other text)

### Logo Rules
- `Assets/logo.png` = black text on white background PNG
- On light bg (nav): `mix-blend-mode: multiply` (white bg disappears)
- On dark/coloured bg (footer, popup): `filter: invert(1)` + `mix-blend-mode: screen` (NOT brightness(0) invert — that makes everything white)

---

## 8. Page Layout & Sections

### index.html (Homepage)
1. Announcement bar (marquee — dark olive bg `#1C2400` + orange text)
2. Sticky nav (light lime-white `#FAFEF0` bg, logo, Shop / About links + cart icon)
3. **Hero** — FULL-BLEED `beet-bite-website1.jpg` as CSS background-image, dark overlay, centered content: Lobster tagline "No More Guilt Indulgence" (orange), eyebrow pill, Lexend bold title, lime CTA button
4. Lime marquee strip (`#BAD50D` bg, dark text, ✦ separators)
5. **Product Categories** — dark olive `#1C2400` section, 4 emoji circles: 🥗 Healthy Bites · 🍪 Power Cookies · 🌾 Nutritious Makhana · 🌿 All Products
6. **Bestsellers** — 3 featured products loaded from Supabase (`id="featured-products"`)
7. **Story Split** — LEFT: `canecreme-banner.jpeg` (⚠️ LOCAL ONLY — NOT pushed to GitHub yet, pending user approval). Dark panel right ("From the Farm, With Intention")
8. **Process Steps** — orange `#F7AD4E` bg: Sourced → Crafted → Packed → Delivered
9. **Gallery Collage** — horizontal scroll strip with 12 photos (6 gelato + 6 product shots). Drag to scroll. CSS class `.gallery-collage`. ✅ LIVE
10. **CTA Banner** — lime `#BAD50D` bg ("Healthy Cravings, Delivered." — "Delivered." in Lobster orange)
11. **Zomato & Swiggy strip** — above footer, light bg, transparent HD PNG logos with no white badge background. ✅ LOCAL ONLY
12. Footer (dark olive `#1C2400` bg, 4-col: brand + Shop + Company + Help). Footer text: "Cane Creme goodness, crafted with love from India."
13. Cart sidebar (slide-in from right) — now includes "You May Also Like" suggestions + "Add Order Note" textarea
14. Entry popup (green top panel + logo in white pill + form bottom, orange submit button)
15. Social proof toast (bottom-left, lime left border)

### shop.html — products grid, all loaded from Supabase (`id="all-products"`)
### about.html — brand story + values process strip + CTA
### checkout.html — shipping form + order summary + Razorpay
### success.html — order confirmed, shows order ID from URL param `?order=`
### admin.html — password-protected: add/edit/delete products. Now includes **Delivery Zone** dropdown (Pan India / Delhi Only) per product.
### product.html — individual product detail page. URL: `product.html?id=PRODUCT_UUID`. Shows image gallery with thumbnails, quantity stepper, Add to Cart, Save badge, stock status, badges. Now includes **Pin Code Delivery Checker** (see section 9 below). Product cards on shop/homepage now link here on click (Add to Cart button uses `event.stopPropagation()`).

---

## 9. JavaScript Behaviour

### cart.js
- Cart stored in `localStorage` key: `canecreme_cart`
- Cart item shape: `{ id, name, price, image, quantity }`
- `addToCart(product)` → opens sidebar + shows toast
- `openCart()` / `closeCart()` — sidebar toggle
- Escape key closes cart
- **Order note** — `toggleCartNote()` shows/hides textarea. Saved to `localStorage` key: `canecreme_order_note`
- **"You May Also Like"** — `loadCartSuggestions()` fetches all products, filters out cart items, shows up to 3 suggestions with "+ Add" button. Called on `openCart()`
- Cart sidebar structure: `cart-header` → `cart-body` (contains `cart-items` + `cart-note-wrap` + `cart-suggestions`) → `cart-footer`

### products.js
- Fetches from Supabase: `GET /rest/v1/products?is_active=eq.true&order=created_at.desc`
- `renderProductCard(product)` — renders card with: New/Sale badge, in-stock dot, ★★★★★ stars (hardcoded 5), name, desc, price, Add to Cart button
- `loadFeaturedProducts(containerId, limit)` — called by homepage (limit=3) and shop (limit=100)
- Stars are always 5 ★ by default unless `product.rating` field is set in DB
- **Multi-image carousel** — if product has 2+ images, renders a `.carousel-track` with slides. `carouselGo(dotEl, index)` uses `translateX(-N*100%)` to slide between images. Dot buttons at the bottom. Single image uses simple `<img>` tag. No images = 🌿 emoji.
- **Hover auto-slide** — `initCarouselHover()` called after render. On mouseenter: slides cycle every 900ms. On mouseleave: stops + resets to image 0. Uses `carouselSetIndex(card, index)` internally.
- **Product image aspect ratio** — square `1/1`, `object-fit: contain` (shows full product, no cropping)

### main.js
- Entry popup: shows after 1.8s delay, skips if `localStorage.getItem('cc_popup_done')` is set
- Popup saves lead to Supabase `leads` table (silent fail if table missing)
- Coupon code shown: `WELCOME10` (10% off — honour manually, not auto-applied)
- Social proof toast: fires at 9s, then every 22s. 5 fake entries (Priya/Rahul/Anjali/Vikram/Sneha)
- IntersectionObserver scroll fade: `.fade-section` and `.fade-up` classes
- Hamburger menu: `#hamburger` toggles `#nav-links` open class

### checkout.js
- Validates: name, email, phone, address1, city, state, pin
- Flow: call Supabase Edge Function `create-checkout-order` → open Razorpay modal only after Supabase order is saved → on Razorpay success call Edge Function `confirm-paid-order` → `confirm-paid-order` marks order paid and triggers `create-shiprocket-order` → redirect to `success.html?order=ORDER_ID`
- Razorpay theme colour is `#BAD50D` (current brand lime green)
- Razorpay Checkout now sends `notes` with order ID, customer name/email/phone, shipping PIN, and support phone `9891239312`, so these details can be seen against the payment in Razorpay Dashboard. Success redirect includes `?order=ORDER_ID` when available.
- Checkout blocks invalid Indian PIN formats before payment using `/^[1-9][0-9]{5}$/`, so values like `000000`, short PINs, or letters cannot proceed.
- Current cache-busted scripts: `js/auth.js?v=2`, `js/cart.js?v=3`, `js/checkout.js?v=6`, `js/main.js?v=3`.

### auth.js
- Optional checkout login only; guest checkout must keep working.
- Google OAuth code is deployed and redirects to `https://www.canecreme.co/checkout.html` on live domain.
- Google still requires dashboard setup: enable Supabase Google provider, add Google OAuth Client ID/Secret, add allowed redirect URL `https://www.canecreme.co/checkout.html`, and configure the Supabase callback URL in Google Console.
- Phone OTP code exists but Supabase returned "Unsupported phone provider"; real SMS needs Supabase Phone Auth/SMS provider setup. Current behaviour copies the mobile number into Delivery Details and lets customer continue as guest.

### success.html
- Dynamic success summary calls Edge Function `get-order-summary`.
- Shows customer order ID, total bill, delivery address, and estimated delivery window.
- Support phone was removed from success details/footer; success page shows email support only.

### Supabase Edge Functions
All deployed to project `qfphvsyidbyhbyeyigrh`:
- `create-checkout-order` — creates `orders` and `order_items` before payment opens.
- `confirm-paid-order` — marks order paid/processing after Razorpay success and triggers Shiprocket creation.
- `create-shiprocket-order` — creates prepaid Shiprocket order from saved Supabase order.
- `get-order-summary` — reads saved order for success page.
- `supabase/config.toml` has `verify_jwt = false` for all four functions so the static GitHub Pages site can call them.

### product.html — Pin Code Delivery Checker
- UI: box with text input (6-digit pin) + Check button. Appears on every product detail page.
- Logic in `checkPincode(deliveryType)` function (inline script in product.html):
  - `deliveryType` comes from `p.delivery_type` Supabase field (default: `'pan_india'` if null)
  - PIN must match Indian PIN format `/^[1-9][0-9]{5}$/`; invalid formats are rejected
  - `pan_india`: any valid Indian 6-digit PIN format → ✓ available
  - `delhi_only`: only pins starting with `'110'` → ✓ available; others → ✗ not available
  - Delhi pin codes all start with `110` (110001–110096)
  - Enter key on input also triggers check
- Badge on product page shows "Delhi Delivery Only" or "Pan-India Delivery" based on `delivery_type`
- ⚠️ `delivery_type` column does NOT exist in Supabase yet — user needs to add it manually:
  - Table Editor → products → Add column → Name: `delivery_type` | Type: `text` | Default: `pan_india`
  - All 6 current products = pan_india (user confirmed). Once column added, bulk update via API:
    `PATCH /rest/v1/products?is_active=eq.true` with `{"delivery_type":"pan_india"}`

---

## 10. Pending Tasks
- [ ] **Add `delivery_type` column in Supabase** — column does not exist yet. User must: Table Editor → products → Add column → `delivery_type` (text, default: `pan_india`). Then run bulk PATCH to set all 6 products to `pan_india`. Code is ready and waiting.
- [x] **Push canecreme-banner.jpeg split section/asset** — `Assets/canecreme-banner.jpeg` exists locally and live path returned `200 OK` on 2026-05-30.
- [ ] **Category filtering** — user wants products categorised. All 6 current products = "Healthy Bites". User was in process of adding `category` text column to Supabase `products` table. Once column added: update admin.html to include category field, update shop.html to show filter tabs.
- [x] **Razorpay live mode** — Live Key ID `rzp_live_SvBwWNQkqzmora` added to `js/config.js` on 2026-05-29. User initially shared a Key Secret in chat, was told to regenerate it, then provided only the regenerated Live Key ID. Do NOT ask for or store the Key Secret in this repo/chat.
- [ ] **Secure payment verification** — before accepting real payments, add server-side Razorpay payment verification (recommended: Supabase Edge Function or another backend). Current static checkout updates payment status client-side after Razorpay handler, which is not enough for production-grade verification.
- [ ] **Order note in checkout** — order note is saved to `localStorage` key `canecreme_order_note` but checkout.js does NOT yet read/send it to Supabase. Add to orders table and wire up in checkout.js.
- [x] **Deploy Shiprocket Edge Function** — `supabase/functions/create-shiprocket-order/index.ts` deployed to Supabase project `qfphvsyidbyhbyeyigrh` on 2026-05-29. Secrets saved by user in Supabase: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, package dimensions/weight, and `SERVICE_ROLE_KEY`.
- [ ] **Verify a fresh real order end-to-end** — Use hard refresh/incognito. Correct Razorpay notes should show a UUID order ID, not `not_saved`. Supabase should show paid/processing, and Shiprocket should show the shipment.
- [ ] **Delete fake Supabase test order** — fake order: `90f3f251-f964-4a67-b50a-4f1881e684db` named `Codex Test`, total `1.00`, status `pending/new`. Delete `order_items` first, then `orders`.
- [ ] **Configure Supabase Google Auth** — code is deployed, but provider/dashboard setup is still required.
- [ ] **Configure Supabase Phone Auth/SMS provider or remove phone OTP UI** — phone OTP currently falls back to guest checkout because Supabase returned "Unsupported phone provider".
- [ ] **Policy pages** — draft pages exist, but owner should review final shipping fees, courier timelines, refund eligibility, GST/business details, and legal wording before launch.
- [x] **Hero image** — `Assets/beet-bite-website1.jpg` exists locally after restore on 2026-05-30; live path returned `200 OK`.

---

## 10A. Razorpay Setup Notes for User
- User asked for non-technical Razorpay setup instructions on 2026-05-06.
- Simple flow given:
  1. Log in/sign up at Razorpay Dashboard.
  2. Create account with brand name `CaneCreme`, website `https://www.canecreme.co`, support email `canecreme@gmail.com`, support phone `9891239312`.
  3. Complete Razorpay KYC and bank settlement details.
  4. Add/verify website details under `Account & Settings` -> `Website and app settings`.
  5. Wait for website/account verification if required. Razorpay docs say website verification may take up to 3 working days before Live Mode keys can be generated.
  6. Switch Dashboard to Live Mode.
  7. Go to `Account & Settings` -> `API Keys` -> `Generate Key`.
  8. Share only the Live **Key ID** (`rzp_live_...`) with Codex; never share the **Key Secret** in chat or commit it.
  9. Codex updates `js/config.js` by replacing `rzp_test_SjNBmQxDuMl0Oo` with the live Key ID.
  10. Test with a small real order only after product data, Supabase tables, and secure payment verification are ready.
- Open questions asked but not yet answered:
  - Is the Razorpay account already created, or does it need to be created from zero?
  - What business type will be used for Razorpay registration: individual, proprietorship, company, or other?
  - Is the bank account for CaneCreme settlements ready?

---

## 10B. Admin Panel Notes
- **Edit button** — fixed in Session 6. Uses `data-id` attribute + `addEventListener`. Calls `openProductModal(productId)` which fetches product fresh from Supabase. Old `JSON.stringify(p)` inline onclick approach was breaking on special characters in description.
- **Images field in modal** — `<textarea id="p-image">`, one image path per line. JS splits by `\n` and saves as array. Example entry:
  ```
  Assets/beet-bites-1.jpg
  Assets/beet-bites-2.jpg
  Assets/beet-bites-3.jpg
  ```
- **Delivery Zone** — `<select id="p-delivery-type">` with options `pan_india` / `delhi_only`. Added in Session 8. Reads/writes `delivery_type` field in Supabase. Defaults to `pan_india` on new product. ⚠️ Column must be added in Supabase first (see Pending Tasks).

## 10C. Product Image Workflow (for next agent)
How to add product images correctly:
1. User saves photo files to `Assets/` folder on their computer (e.g. `Assets/product-name-1.jpg`)
2. Run `git add Assets/ && git commit -m "..." && git push origin main` to upload to GitHub Pages
3. In admin.html → Edit product → Images field: type `Assets/product-name-1.jpg` (one per line for multiple)
4. Save product
5. Wait 2 min, then hard refresh or open in Incognito to see changes
- Images load via relative URL — `Assets/filename.jpg` resolves to `canecreme.co/Assets/filename.jpg` on live site
- Browser cache can make old version appear — always verify in Incognito or after cache clear (Ctrl+Shift+Delete)

## 10D. Current Products in Supabase (verified via API 2026-05-08)
| Product | ID | Images | Price |
|---------|-----|--------|-------|
| Beet Bites | cf3d5ba7-177f-4033-9ab4-598201bf6cfd | beet-bites-1 → 4 (4 images) | ₹149 |
| Broccoli Bites | 2df1da36-c102-46a6-8f30-cf169499cf71 | broccoli-bites-1 → 4 (4 images) | ₹149 |
| Soya Bites | 863f3532-45f8-4c1b-bcfb-2bdb27d05c96 | soya-bites-1 → 4 (4 images) | (check DB) |
| Pure Ghee Atta Cookies | a494afdd-6bff-44a0-9913-6615badba224 | atta-cookies-1 → 4 (4 images) | ₹229 |
| Powerbite Multigrain Cookies | 7caa3e8d-6ab3-4fe9-878f-3e4f9a882109 | powerbite-1 → 4 (4 images) | ₹275 |
| Chocochip Oatmeal Cookies | ec95d67c-5f95-4392-a127-f295dd071ea4 | chocochip-1 → 4 (4 images) | ₹275 |

## 10E. Current Assets in Assets/ folder (verified 2026-05-08)
- beet-bites-1.jpg → beet-bites-4.jpg
- broccoli-bites-1.jpg → broccoli-bites-4.jpg
- soya-bites-1.jpg → soya-bites-4.jpg
- atta-cookies-1.jpg → atta-cookies-4.jpg
- powerbite-1.jpg → powerbite-4.jpg
- chocochip-1.jpg → chocochip-4.jpg
- galeto-1.jpeg, galeto-2.jpeg, galeto-3.jpeg (JPEG format)
- galeto-4.jpg, galeto-5.jpg, galeto-6.jpg (JPG format)
- canecreme-banner.jpeg
- logo.png, logo.svg (logo.svg unused)
- Assets/logo/zomato-hd.png and Assets/logo/swiggy-hd.png — transparent HD platform logo cutouts created from user-provided WhatsApp image on 2026-05-29. Referenced by index.html, shop.html, and about.html. Local and live paths verified `200 OK` on 2026-05-30.
- Duplicate root image files exist locally but are untracked and not referenced by the website: `Assets/zomato-hd.png`, `Assets/swiggy-hd.png`, `Assets/zomato.png`, `Assets/swiggy.png`. Do not commit them unless intentionally changing paths.

## 10F. Current Git / Deployment State (handoff 2026-05-30)
- Last pushed commit on `main`: `2d058e1 Improve checkout login handling`.
- Recent pushed commits:
  - `2d058e1` Improve checkout login handling
  - `00ac802` Push admin delivery zone updates
  - `180e5ec` Show order details on success page
  - `ed7c8cd` Add optional checkout login
  - `03fdb6d` Simplify checkout details form
  - `2b90f9c` Fix checkout order creation flow
  - `71433c3` Connect checkout to Shiprocket function
  - `df31e0c` Add Shiprocket Edge Function scaffold
- Live deploy is GitHub Pages from `main`; wait about 2 minutes after push.
- Uncommitted local files as of this handoff:
  - Modified: `.claude/launch.json` (local preview config only; leave out unless requested)
  - Untracked: `.claude/settings.local.json`, `.claude/worktrees/`, `supabase/.temp/`
  - Untracked duplicate assets: `Assets/swiggy-hd.png`, `Assets/swiggy.png`, `Assets/zomato-hd.png`, `Assets/zomato.png`
- Next agent must not stage these by accident. Use exact `git add` paths.

## 10G. Real Payment / Order Testing Notes
- One real Razorpay payment for Rs.149 was captured from an older cached checkout flow. Razorpay notes showed `order_id: not_saved`; it did not create a matching Supabase or Shiprocket order. This happened before the current Edge Function checkout fix.
- Current correct flow requires browser hard refresh/incognito so it loads `checkout.html` with `js/checkout.js?v=6` and `js/auth.js?v=2`.
- If a new paid order still does not appear in Supabase:
  1. Check browser console/network for `create-checkout-order` response.
  2. Check Supabase Edge Function logs for `create-checkout-order` and `confirm-paid-order`.
  3. Confirm Supabase secrets include `SERVICE_ROLE_KEY`.
  4. Confirm `orders`/`order_items` tables and RLS policies exist.
  5. Confirm Razorpay notes show a real UUID, not `not_saved`.

## 11. Known Decisions & Rules
- User is **non-technical** — always explain before doing, ask one question at a time
- **No gradients** — user explicitly removed all linear-gradient. Keep everything flat solid colours.
- **No assumptions** — always verify before changing anything
- User confirmed on 2026-05-06: keep shop/checkout visible, delivery is pan-India, customer support phone is `9891239312`, keep fake social proof, keep 10% popup, online payment only, Razorpay live mode not activated yet, prepare draft policy pages.
- All text previously saying "sugarcane" or "Pure Sugarcane" was changed to **"raw cane sugar"** / **"Raw Cane Sugar"** across all pages
- Footer text changed from "Raw cane sugar goodness" → **"Cane Creme goodness, crafted with love from India."** across all pages
- Colour has been changed 7 times — always present numbered options and wait for user to pick
- `logo.svg` in Assets/ is an old unused file — do not reference it
- **Font change rule:** Fonts are Lexend + Lobster + DM Sans. Do NOT revert to Cormorant Garamond.
- **Hero is full-bleed** — CSS `background-image` on `.hero`, NOT an `<img>` tag. The `.hero-overlay` div provides the dark tint.
- **⚠️ IMPORTANT — Preview before push rule:** User instructed on 2026-05-08: ALWAYS make changes locally first, let user preview by opening `canecreme-main/index.html` in their browser, then push to GitHub only after user says "looks good" or "push it".
- **CTA Banner text** changed from "Nature's Sweetness" → **"Healthy Cravings"** (Session 8).
- **Colour palette** changed from Earthy Organic → **Lime & Orange** (#BAD50D + #F7AD4E) in Session 8. This is the 8th palette — always present numbered options before changing again.
- **Worktree workflow:** Always edit files in `canecreme-main/` (main folder). Do NOT edit worktree copies.
- **Preview server:** Python not fully installed. Use browser file:// directly for preview (`file:///C:/Users/kritika kashyap/Desktop/cane creme website/canecreme-main/index.html`)
- **Staging rule:** Do not run `git add .`. Stage exact files only. Leave `.claude/`, `.claude/worktrees/`, `supabase/.temp/`, and duplicate root Zomato/Swiggy assets alone unless user explicitly asks.
- **Live checkout test rule:** For testing checkout after updates, use incognito or hard refresh. Old cached checkout caused a real Razorpay payment with `order_id: not_saved`.

---

## 12. Session Log
| Session | Date | Key Changes |
|---------|------|-------------|
| Session 1 | 2026-05-06 | Full site built: HTML pages, CSS design system, Supabase integration, Razorpay checkout, cart, admin panel, popup, scroll animations |
| Session 2 | 2026-05-06 | Layout redesign (split hero, category circles, social proof toast, simplified popup), colour iterations (Purple → Mango → Chocolate & Gold), "sugarcane" → "raw cane sugar" site-wide, GitHub Pages deployment to canecreme.co |
| Session 3 | 2026-05-06 | Template-inspired redesign: Lexend + Lobster fonts, full-bleed parallax hero with "No More Guilt Indulgence" Lobster tagline, gold underline on section titles, Earthy Organic palette (#283618 + #FEFAE0 + #DDA15E) |
| Session 4 | 2026-05-06 | Captured launch answers: pan-India, phone 9891239312, online payment only, keep shop/checkout/social proof/10% popup, Razorpay not live. Added draft Shipping, Returns, Privacy, and Terms pages; linked policies in footer; updated checkout Razorpay theme to #283618. |
| Session 5 | 2026-05-06 | Explained Razorpay setup step by step for non-technical owner. Saved requirement to share only Live Key ID, never Key Secret. Added production warning that secure server-side Razorpay payment verification is needed before real payments. |
| Session 6 | 2026-05-07 | Category names updated (Healthy Bites / Power Cookies / Nutritious Makhana). Product image ratio fixed to square (1/1, object-fit: contain). Multi-image carousel added (sliding track + dots). Admin Edit button fixed (data-id + fresh fetch). Images field changed to textarea (multiple URLs). Popup logo fixed (white pill). Popup text updated ("Cane Creme goodness"). Products added: Beet Bites (4 images), Broccoli Bites (1 image). All images pushed to GitHub. Browser cache issue identified — images visible in Incognito. |
| Session 7 | 2026-05-08 | Product cards equal height fixed (flexbox). Footer logo fixed (filter: invert(1)). Footer text updated to "Cane Creme goodness". Product images pushed: broccoli-bites 2-4, soya-bites 1-4, atta-cookies 1-4, powerbite 1-4, chocochip 1-4, galeto 1-6. All 6 products confirmed in Supabase with 4 images each. NEW: product.html detail page with image gallery + quantity stepper. Product cards now clickable → product.html. Cart sidebar upgraded: "You May Also Like" suggestions + order note textarea. Zomato & Swiggy strip added above footer. Gallery collage (horizontal scroll) added on homepage. Split section updated locally to use canecreme-banner.jpeg (NOT pushed — pending user approval). ⚠️ NEW RULE: always preview locally before pushing to GitHub. |
| Session 8 | 2026-05-09 | CTA banner text changed: "Nature's Sweetness" → "Healthy Cravings". Product carousel hover auto-slide added (900ms interval, resets on mouseleave). Pin code delivery checker added to product.html. Admin panel now has Delivery Zone dropdown (Pan India / Delhi Only) — reads/writes `delivery_type` Supabase field. ⚠️ `delivery_type` column not yet added in Supabase — pending user action. All 6 products confirmed pan_india by user. Colour palette changed to Lime & Orange (#BAD50D + #F7AD4E + #FAFEF0) — 8th palette. Footer bg updated to #1C2400. Razorpay theme updated to #BAD50D. Changes are LOCAL ONLY — not pushed to GitHub yet. |
| Session 9 | 2026-05-29 | Zomato and Swiggy platform strip icons updated locally. Created transparent HD PNG cutouts: `Assets/logo/zomato-hd.png` (1200x820) and `Assets/logo/swiggy-hd.png` (1520x780). Updated index.html, shop.html, and about.html to use new logo files. Updated `.platform-badge` CSS to remove white pill background/border and display logos directly. Browser file preview was blocked by in-app browser file:// policy; user must preview locally in Chrome before push. Changes are LOCAL ONLY — not pushed to GitHub yet. |
| Session 10 | 2026-05-29 | Added `STORE_PHONE = 9891239312` in js/config.js. Razorpay checkout now sends payment notes containing order ID, customer contact details, shipping PIN, and support phone. Success redirect now includes `?order=ORDER_ID` when Supabase order creation succeeds. Replaced test Razorpay key with regenerated Live Key ID `rzp_live_SvBwWNQkqzmora`. Key Secret was not stored. Dashboard notification settings may still need user confirmation. |
| Session 11 | 2026-05-29 | Tightened PIN validation locally. checkout.html and product.html PIN inputs now include pattern `[1-9][0-9]{5}`. checkout.js blocks payment before Razorpay if PIN does not match `/^[1-9][0-9]{5}$/`. product.html delivery checker rejects invalid Indian PIN formats before showing delivery availability. |
| Session 12 | 2026-05-29 | User created Shiprocket API user `canecremeorders@gmail.com` and saved password privately. Pickup profile is verified in Shiprocket with pickup nickname `Kshitiz`; keep exact pickup address in Shiprocket/Supabase secrets, not public website code. Added local Supabase Edge Function scaffold `create-shiprocket-order` to create Shiprocket prepaid orders securely server-side after paid Supabase order lookup. Function not deployed yet; Supabase CLI not installed locally. |
| Session 13 | 2026-05-29 | User installed Supabase CLI via Scoop and logged in successfully. Deployed Edge Function `create-shiprocket-order` to Supabase project `qfphvsyidbyhbyeyigrh`. Deploy command succeeded; CLI warned Docker is not running, but remote function uploaded successfully. Website checkout is not yet calling the function automatically. |
| Session 14 | 2026-05-29 | Checkout wired locally to call deployed Supabase Edge Function `create-shiprocket-order` after Razorpay handler updates order payment status to `paid`. Function call is non-blocking for customer redirect: if Shiprocket creation fails, error is logged and customer still reaches success page. checkout.html cache-busted `js/checkout.js?v=5`. |
| Session 15 | 2026-05-29 | Debugged real test payment issue: Razorpay captured payment but no Supabase/Shiprocket order because direct browser insert into `orders` returned 401 and old checkout continued to payment anyway. Added and deployed Edge Functions `create-checkout-order` and `confirm-paid-order`, set function JWT verification false in `supabase/config.toml` for static-site calls, rewrote checkout.js to create Supabase order through Edge Function before opening Razorpay, and block payment if order save fails. `confirm-paid-order` marks order paid and triggers Shiprocket after Razorpay success. Test call to `create-checkout-order` succeeded and created pending fake order `90f3f251-f964-4a67-b50a-4f1881e684db` named `Codex Test`; delete this test order from Supabase dashboard. checkout.html cache-busted `js/checkout.js?v=6`. |
| Session 16 | 2026-05-30 | Simplified checkout form labels/placeholders for customers: Delivery Details heading, mobile before email, clearer address fields, PIN before city, secure note. Added `checkout.htm` redirect to `checkout.html?v=6` to prevent old mobile/cached `.htm` links from using stale checkout. Updated checkout validation message. |
| Session 17 | 2026-05-30 | Added optional checkout auth UI and `js/auth.js`: Google OAuth button via Supabase `signInWithOAuth({ provider: 'google' })`, phone OTP send/verify via Supabase Auth, session prefill for name/email/phone, logout button. Normal guest checkout still works. Requires Supabase dashboard setup: enable Google provider and add redirect URL `https://www.canecreme.co/checkout.html`; phone OTP requires Supabase Phone Auth/SMS provider configuration. |
| Session 18 | 2026-05-30 | Updated success page to remove the customer support phone from the confirmation page and show dynamic order summary: customer order ID, total bill, delivery address, and estimated delivery window. Added Supabase Edge Function `get-order-summary` with JWT verification disabled for static-site access; it reads orders securely with `SERVICE_ROLE_KEY`. |
| Session 19 | 2026-05-30 | Restored missing local tracked image paths so future pushes do not delete live assets: `Assets/logo/zomato-hd.png`, `Assets/logo/swiggy-hd.png`, `Assets/beet-bites-1.jpg`, `Assets/beet-bite-website1.jpg`, and `Assets/logo.svg`. Pushed admin delivery-zone UI changes in `admin.html` and `js/admin.js`. |
| Session 20 | 2026-05-30 | Improved checkout quick login handling. Google login now uses an explicit redirect URL and manual redirect fallback. Phone OTP now handles Supabase "Unsupported phone provider" gracefully by copying the mobile number into Delivery Details and allowing guest checkout instead of blocking the customer. Phone OTP still requires Supabase Auth phone provider/SMS setup before real OTP delivery works. |
| Session 21 | 2026-05-30 | Handoff update only: refreshed `PROJECT-STATE.md` with current Git state, deployed Edge Functions, Supabase/Shiprocket/Auth setup status, pending dashboard tasks, fake test order ID, stale real-payment warning, image path status, and dirty worktree files to avoid staging. |

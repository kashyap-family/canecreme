# CaneCreme — Project State
> Last updated: Session 2 (2026-05-06)
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
git add .
git commit -m "your message"
git push origin main
```

---

## 3. Tech Stack
- **Frontend:** Pure static HTML + CSS + Vanilla JS (no frameworks, no npm, no build step)
- **Backend:** Supabase (PostgreSQL via REST API)
- **Payments:** Razorpay
- **Fonts:** Cormorant Garamond (display) + DM Sans (body) via Google Fonts
- **No Node.js installed** on the dev machine

---

## 4. Credentials & Config
> File: `js/config.js`

| Key | Value |
|-----|-------|
| Supabase URL | `https://qfphvsyidbyhbyeyigrh.supabase.co` |
| Supabase Anon Key | `sb_publishable_usfZZ8OEQjJKYP0dGLqImg_pbAyUrL6` |
| Razorpay Key | `rzp_test_SjNBmQxDuMl0Oo` ⚠️ TEST MODE — not live yet |
| Admin Password | `canecreme2026` |
| Store Currency | `INR` |

⚠️ **Razorpay is still in TEST mode.** Real transactions will fail. User must activate live mode and replace key.

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

### Active Colour Palette: Rich Chocolate & Gold
```css
--green:        #92400E;   /* deep brown — primary */
--green-mid:    #78350F;   /* darker brown */
--green-light:  #B45309;   /* lighter brown hover */
--green-pale:   #FEF3C7;   /* very light cream */
--gold:         #F59E0B;   /* bright gold accent */
--gold-light:   #FCD34D;   /* lighter gold */
--dark:         #1C0A00;   /* deep chocolate */
--cream-dark:   #FFFBEB;   /* warm cream bg */
--border:       #FDE68A;   /* light gold border */
```

### Colour Palette History (most recent = active)
1. Green / nature
2. Tropical Punch (coral + yellow)
3. Royal Purple + Yellow (#5b2d8e)
4. Vibrant Purple (#6B21A8)
5. Mango Fiesta (orange #F97316 + teal #14B8A6)
6. **Rich Chocolate & Gold (#92400E + #F59E0B) ← CURRENT**

### Typography
- Display font: `Cormorant Garamond` (headings, product names)
- Body font: `DM Sans` (all other text)

### Logo Rules
- `Assets/logo.png` = black text on white background PNG
- On light bg (nav): `mix-blend-mode: multiply` (white bg disappears)
- On dark/coloured bg (footer, popup): `filter: brightness(0) invert(1)` + `mix-blend-mode: screen`

---

## 8. Page Layout & Sections

### index.html (Homepage)
1. Announcement bar (marquee — dark brown bg + gold text)
2. Sticky nav (logo + Shop / About links + cart icon)
3. **Hero** — split grid: left = solid brown panel (white text, gold "Shop" button), right = full-bleed `beet-bite-website1.jpg`
4. Yellow marquee strip (gold bg, dark text, ✦ separators)
5. **Product Categories** — solid brown section, 4 circles: 🍦 Raw Cane Sugar Gelato · 🍯 Raw Cane Sugar Syrup · 🫙 Jam Spreads · 🌿 All Products
6. **Bestsellers** — 3 featured products loaded from Supabase (`id="featured-products"`)
7. **Story Split** — image left, dark panel right ("From the Farm, With Intention")
8. **Process Steps** — gold bg: Sourced → Crafted → Packed → Delivered
9. **CTA Banner** — solid brown ("Nature's Sweetness, Delivered.")
10. Footer (4-col dark: brand + Shop + Company + Help)
11. Cart sidebar (slide-in from right)
12. Entry popup (single-column: brown top panel + form bottom)
13. Social proof toast (bottom-left)

### shop.html — products grid, all loaded from Supabase (`id="all-products"`)
### about.html — brand story + values process strip + CTA
### checkout.html — shipping form + order summary + Razorpay
### success.html — order confirmed, shows order ID from URL param `?order=`
### admin.html — password-protected: add/edit/delete products

---

## 9. JavaScript Behaviour

### cart.js
- Cart stored in `localStorage` key: `canecreme_cart`
- Cart item shape: `{ id, name, price, image, quantity }`
- `addToCart(product)` → opens sidebar + shows toast
- `openCart()` / `closeCart()` — sidebar toggle
- Escape key closes cart

### products.js
- Fetches from Supabase: `GET /rest/v1/products?is_active=eq.true&order=created_at.desc`
- `renderProductCard(product)` — renders card with: New/Sale badge, in-stock dot, ★★★★★ stars (hardcoded 5), name, desc, price, Add to Cart button
- `loadFeaturedProducts(containerId, limit)` — called by homepage (limit=3) and shop (limit=100)
- Stars are always 5 ★ by default unless `product.rating` field is set in DB

### main.js
- Entry popup: shows after 1.8s delay, skips if `localStorage.getItem('cc_popup_done')` is set
- Popup saves lead to Supabase `leads` table (silent fail if table missing)
- Coupon code shown: `WELCOME10` (10% off — honour manually, not auto-applied)
- Social proof toast: fires at 9s, then every 22s. 5 fake entries (Priya/Rahul/Anjali/Vikram/Sneha)
- IntersectionObserver scroll fade: `.fade-section` and `.fade-up` classes
- Hamburger menu: `#hamburger` toggles `#nav-links` open class

### checkout.js
- Validates: name, email, phone, address1, city, state, pin
- Flow: create order in DB → save order_items → open Razorpay modal → on payment success → update payment_status to 'paid' → redirect to `success.html`
- Razorpay theme colour hardcoded as `#2d5016` (old green — update to current brand colour if needed)

---

## 10. Pending Tasks
- [ ] **Add products** — user has NOT provided product names/descriptions/prices/photos yet. Ask for them.
- [ ] **Product images** — no product photos uploaded to Assets/ yet
- [ ] **Razorpay live mode** — currently on test key `rzp_test_SjNBmQxDuMl0Oo`. User must get live keys from Razorpay dashboard and update `js/config.js`
- [ ] **Razorpay theme colour** in `checkout.js` line 149 is `#2d5016` (old green) — update to `#92400E`
- [ ] **Supabase tables** — confirm `products`, `orders`, `order_items`, `leads` tables exist with correct schema
- [ ] **Category circles** — currently use emoji placeholders. Could be replaced with real product images once available

---

## 11. Known Decisions & Rules
- User is **non-technical** — always explain before doing, ask one question at a time
- **No gradients** — user explicitly removed all linear-gradient. Keep everything flat solid colours.
- **No assumptions** — always verify before changing anything
- All text previously saying "sugarcane" or "Pure Sugarcane" was changed to **"raw cane sugar"** / **"Raw Cane Sugar"** across all pages
- Colour has been changed 6 times — always present numbered options and wait for user to pick
- Image assets (`beet-bite-website*.jpg`) are placeholder lifestyle images. Replace with real CaneCreme product photos when provided.
- `logo.svg` in Assets/ is an old unused file — do not reference it

---

## 12. Session Log
| Session | Date | Key Changes |
|---------|------|-------------|
| Session 1 | 2026-05-06 | Full site built: HTML pages, CSS design system, Supabase integration, Razorpay checkout, cart, admin panel, popup, scroll animations |
| Session 2 | 2026-05-06 | Layout redesign (split hero, category circles, social proof toast, simplified popup), colour iterations (Purple → Mango → Chocolate & Gold), "sugarcane" → "raw cane sugar" site-wide, GitHub Pages deployment to canecreme.co |

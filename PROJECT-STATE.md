# CaneCreme — Project State
> Last updated: Session 3 (2026-05-06)
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
- **Fonts:** Lexend (headings) + Lobster (script/tagline) + DM Sans (body) via Google Fonts
- **No Node.js installed** on the dev machine
- **Python:** Available as `python` (Microsoft Store version) — use for local HTTP server if needed
- **Preview server:** PowerShell HTTP server via `.claude/launch.json` on port 3456

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

### Active Colour Palette: Earthy Organic
```css
--cream:        #FEFAE0;   /* warm cream — main background */
--cream-dark:   #F2EDD0;   /* slightly deeper cream */
--green:        #283618;   /* deep forest green — primary */
--green-mid:    #1E2910;   /* darker green */
--green-light:  #3A5020;   /* lighter green hover */
--green-pale:   #E8EED8;   /* very light green tint */
--gold:         #DDA15E;   /* warm amber accent */
--gold-light:   #E8B87A;   /* lighter amber */
--dark:         #0F1508;   /* deep dark */
--border:       #D4C9A0;   /* warm cream border */
```

### Colour Palette History (most recent = active)
1. Green / nature
2. Tropical Punch (coral + yellow)
3. Royal Purple + Yellow (#5b2d8e)
4. Vibrant Purple (#6B21A8)
5. Mango Fiesta (orange #F97316 + teal #14B8A6)
6. Rich Chocolate & Gold (#92400E + #F59E0B)
7. **Earthy Organic (#283618 + #FEFAE0 + #DDA15E) ← CURRENT**

### Typography
- Display font: `Lexend` (headings, product names)
- Script font: `Lobster` (tagline, decorative italic accents)
- Body font: `DM Sans` (all other text)

### Logo Rules
- `Assets/logo.png` = black text on white background PNG
- On light bg (nav): `mix-blend-mode: multiply` (white bg disappears)
- On dark/coloured bg (footer, popup): `filter: brightness(0) invert(1)` + `mix-blend-mode: screen`

---

## 8. Page Layout & Sections

### index.html (Homepage)
1. Announcement bar (marquee — dark green bg `#1E2910` + amber text)
2. Sticky nav (cream `#FEFAE0` bg, logo, Shop / About links + cart icon)
3. **Hero** — FULL-BLEED `beet-bite-website1.jpg` as CSS background-image, dark overlay `rgba(15,21,8,0.72)`, centered content: Lobster tagline "No More Guilt Indulgence" (amber), eyebrow pill, Lexend bold title, amber CTA button
4. Amber marquee strip (`#DDA15E` bg, dark text, ✦ separators)
5. **Product Categories** — forest green `#283618` section, 4 emoji circles: 🥗 Healthy Bites · 🍪 Power Cookies · 🌾 Nutritious Makhana · 🌿 All Products
6. **Bestsellers** — 3 featured products loaded from Supabase (`id="featured-products"`)
7. **Story Split** — `beet-bite-website2.jpg` left, dark panel right ("From the Farm, With Intention")
8. **Process Steps** — amber `#DDA15E` bg: Sourced → Crafted → Packed → Delivered
9. **CTA Banner** — forest green `#283618` bg ("Nature's Sweetness, Delivered." — "Delivered." in Lobster)
10. Footer (dark `#0d0d0d` bg, 4-col: brand + Shop + Company + Help)
11. Cart sidebar (slide-in from right)
12. Entry popup (green top panel + logo in white pill + form bottom, amber submit button)
13. Social proof toast (bottom-left, green left border)

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
- **Multi-image carousel** — if product has 2+ images, renders a `.carousel-track` with slides. `carouselGo(dotEl, index)` uses `translateX(-N*100%)` to slide between images. Dot buttons at the bottom. Single image uses simple `<img>` tag. No images = 🌿 emoji.
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
- Flow: create order in DB → save order_items → open Razorpay modal → on payment success → update payment_status to 'paid' → redirect to `success.html`
- Razorpay theme colour is `#283618` (current brand green)

---

## 10. Pending Tasks
- [ ] **More products** — Beet Bites and Broccoli Bites added. More products pending — ask user for names/descriptions/prices/photos.
- [ ] **Razorpay live mode** — currently on test key `rzp_test_SjNBmQxDuMl0Oo`. User must activate Razorpay, complete KYC, verify website `https://www.canecreme.co`, generate a Live Mode API key, and provide ONLY the Live Key ID (`rzp_live_...`) for `js/config.js`. Do NOT ask for or store the Key Secret in this repo/chat.
- [ ] **Secure payment verification** — before accepting real payments, add server-side Razorpay payment verification (recommended: Supabase Edge Function or another backend). Current static checkout updates payment status client-side after Razorpay handler, which is not enough for production-grade verification.
- [ ] **Supabase tables** — confirm `products`, `orders`, `order_items`, `leads` tables exist with correct schema
- [ ] **Category circles** — emoji placeholders updated to new category names. Could be replaced with real product images once available.
- [ ] **Policy pages** — draft pages exist, but owner should review final shipping fees, courier timelines, refund eligibility, GST/business details, and legal wording before launch
- [ ] **Broccoli Bites images** — only 1 image uploaded so far (broccoli-bites-1.jpg). Add broccoli-bites-2.jpg, broccoli-bites-3.jpg when available.

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

## 10C. Product Image Workflow (for next agent)
How to add product images correctly:
1. User saves photo files to `Assets/` folder on their computer (e.g. `Assets/product-name-1.jpg`)
2. Run `git add Assets/ && git commit -m "..." && git push origin main` to upload to GitHub Pages
3. In admin.html → Edit product → Images field: type `Assets/product-name-1.jpg` (one per line for multiple)
4. Save product
5. Wait 2 min, then hard refresh or open in Incognito to see changes
- Images load via relative URL — `Assets/filename.jpg` resolves to `canecreme.co/Assets/filename.jpg` on live site
- Browser cache can make old version appear — always verify in Incognito or after cache clear (Ctrl+Shift+Delete)

## 10D. Current Products in Supabase
| Product | Images | Price | Stock |
|---------|--------|-------|-------|
| Beet Bites | Assets/beet-bites-1.jpg → beet-bites-4.jpg (4 images) | ₹149 | 100 |
| Broccoli Bites | Assets/broccoli-bites-1.jpg (1 image so far) | ₹149 | (check DB) |

## 11. Known Decisions & Rules
- User is **non-technical** — always explain before doing, ask one question at a time
- **No gradients** — user explicitly removed all linear-gradient. Keep everything flat solid colours.
- **No assumptions** — always verify before changing anything
- User confirmed on 2026-05-06: keep shop/checkout visible, delivery is pan-India, customer support phone is `9891239312`, keep fake social proof, keep 10% popup, online payment only, Razorpay live mode not activated yet, prepare draft policy pages.
- All text previously saying "sugarcane" or "Pure Sugarcane" was changed to **"raw cane sugar"** / **"Raw Cane Sugar"** across all pages
- Colour has been changed 7 times — always present numbered options and wait for user to pick
- Image assets (`beet-bite-website*.jpg`) are placeholder lifestyle images. Replace with real CaneCreme product photos when provided.
- `logo.svg` in Assets/ is an old unused file — do not reference it
- **Font change rule:** Fonts are Lexend + Lobster + DM Sans. Do NOT revert to Cormorant Garamond.
- **Hero is full-bleed** — CSS `background-image` on `.hero`, NOT an `<img>` tag. The `.hero-overlay` div provides the dark tint.
- **Worktree workflow:** This project uses Claude worktrees. Always edit files in `canecreme-main/` (main folder). The preview server serves from `.claude/worktrees/trusting-ellis-76e924/` — sync with `cp` after edits.
- **Preview server:** Uses PowerShell inline HTTP server. launch.json is at `.claude/worktrees/trusting-ellis-76e924/.claude/launch.json`. Port 3456.

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

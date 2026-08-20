(function () {
  const posts = window.CANECREME_BLOG_POSTS || [];

  function qs(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initNav() {
    const hamburger = qs("#hamburger");
    const links = qs("#nav-links");
    if (!hamburger || !links) return;
    hamburger.addEventListener("click", () => {
      links.classList.toggle("open");
      hamburger.classList.toggle("open");
    });
  }

  function renderListing() {
    const grid = qs("#blog-list");
    if (!grid) return;
    grid.innerHTML = posts.map((post, index) => `
      <article class="blog-card ${index === 0 ? "blog-card-featured" : ""}">
        <a class="blog-card-media" href="${post.slug}.html" aria-label="Read ${escapeHtml(post.title)}">
          <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt)}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" />
        </a>
        <div class="blog-card-body">
          <div class="blog-meta">
            <span>${escapeHtml(post.author)}</span>
            <span>${escapeHtml(post.displayDate)}</span>
            <span>${escapeHtml(post.readingTime)}</span>
          </div>
          <h2><a href="${post.slug}.html">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.excerpt)}</p>
          <a class="blog-read-more" href="${post.slug}.html">Read More</a>
        </div>
      </article>
    `).join("");
  }

  function initSubscribe() {
    document.querySelectorAll(".blog-subscribe-form").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const message = form.querySelector(".blog-form-message");
        const email = form.querySelector("input[type='email']");
        if (message) message.textContent = "Thank you. CaneCreme updates will land softly in your inbox.";
        if (email) email.value = "";
      });
    });
  }

  function initShare() {
    document.querySelectorAll("[data-share]").forEach((button) => {
      button.addEventListener("click", async () => {
        const url = window.location.href;
        const title = document.title;
        const type = button.getAttribute("data-share");
        if (type === "copy") {
          await navigator.clipboard.writeText(url).catch(() => null);
          button.textContent = "Link copied";
          return;
        }
        if (navigator.share && type === "native") {
          await navigator.share({ title, url }).catch(() => null);
          return;
        }
        const shareUrls = {
          whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
          x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
        };
        if (shareUrls[type]) window.open(shareUrls[type], "_blank", "noopener,noreferrer");
      });
    });
  }

  initNav();
  renderListing();
  initSubscribe();
  initShare();
})();

(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");

  function closeMenu() {
    if (!header || !menuButton) return;
    header.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
  }

  if (header) {
    const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  if (header && menuButton && mobileMenu) {
    menuButton.addEventListener("click", () => {
      const open = !header.classList.contains("is-open");
      header.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });

    mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  const revealItems = document.querySelectorAll("[data-reveal]");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const delay = Number(entry.target.dataset.delay || 0);
          window.setTimeout(() => entry.target.classList.add("is-visible"), delay);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -42px" }
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  async function copyToClipboard(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        await copyToClipboard(button.dataset.copy);
        button.textContent = "Copied";
        button.classList.add("is-copied");
      } catch (error) {
        button.textContent = "Select code";
      }
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, 1800);
    });
  });

  function animateOnView(element) {
    if (!element) return;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      element.classList.add("is-animated");
      return;
    }

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.classList.add("is-animated");
        currentObserver.disconnect();
      },
      { threshold: 0.3 }
    );
    observer.observe(element);
  }

  const sidebarWrap = document.getElementById("tsbWrap");
  const sidebarStage = document.getElementById("tsbStage");
  if (sidebarWrap && sidebarStage) {
    const fitSidebar = () => {
      const scale = Math.min(1, sidebarWrap.clientWidth / 600);
      sidebarStage.style.transform = `scale(${scale})`;
      sidebarWrap.style.height = `${620 * scale}px`;
    };

    fitSidebar();
    window.addEventListener("resize", fitSidebar, { passive: true });

    sidebarStage.querySelectorAll(".tsb-ico img").forEach((image) => {
      const iconBox = image.parentElement;
      if (image.complete && image.naturalWidth > 0) iconBox.classList.remove("ph");
      image.addEventListener("load", () => iconBox.classList.remove("ph"));
      image.addEventListener("error", () => iconBox.classList.add("ph"));
    });
  }

  animateOnView(document.getElementById("learning-chart"));
  animateOnView(document.querySelector(".command-map"));

  const comparison = document.querySelector("[data-compare]");
  if (comparison) {
    const handle = comparison.querySelector(".compare-handle");
    let position = 52;
    let dragging = false;

    const setPosition = (nextPosition) => {
      position = Math.max(2, Math.min(98, nextPosition));
      comparison.style.setProperty("--position", `${position}%`);
      if (handle) handle.setAttribute("aria-valuenow", String(Math.round(position)));
    };

    const setFromPointer = (clientX) => {
      const rect = comparison.getBoundingClientRect();
      setPosition(((clientX - rect.left) / rect.width) * 100);
    };

    comparison.addEventListener("pointerdown", (event) => {
      dragging = true;
      comparison.setPointerCapture(event.pointerId);
      setFromPointer(event.clientX);
    });
    comparison.addEventListener("pointermove", (event) => {
      if (dragging) setFromPointer(event.clientX);
    });
    comparison.addEventListener("pointerup", () => {
      dragging = false;
    });
    comparison.addEventListener("pointercancel", () => {
      dragging = false;
    });

    if (handle) {
      handle.addEventListener("keydown", (event) => {
        const increments = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2 };
        if (event.key in increments) {
          event.preventDefault();
          setPosition(position + increments[event.key]);
        } else if (event.key === "Home") {
          event.preventDefault();
          setPosition(2);
        } else if (event.key === "End") {
          event.preventDefault();
          setPosition(98);
        }
      });
    }

    setPosition(position);
  }

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".feature-card").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    });
  }
})();

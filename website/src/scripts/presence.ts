function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canUseDesktopMotion(): boolean {
  return (
    !prefersReducedMotion() &&
    window.matchMedia("(pointer: fine)").matches &&
    window.matchMedia("(min-width: 800px)").matches
  );
}

async function initLenis(): Promise<void> {
  if (!canUseDesktopMotion()) return;
  const { default: Lenis } = await import("lenis");
  document.documentElement.classList.add("lenis-active");
  new Lenis({
    autoRaf: true,
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
}

function initProductTilt(): void {
  const stage = document.querySelector<HTMLElement>("[data-product-stage]");
  const frame = document.querySelector<HTMLElement>("[data-product-frame]");
  if (!stage || !frame || !canUseDesktopMotion()) return;

  let raf = 0;
  let running = false;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const tick = () => {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    const settled =
      targetX === 0 &&
      targetY === 0 &&
      Math.abs(currentX) < 0.02 &&
      Math.abs(currentY) < 0.02;
    if (settled) {
      running = false;
      frame.style.transform = "";
      return;
    }
    frame.style.transform = `rotateX(${currentY}deg) rotateY(${currentX}deg) translateZ(0)`;
    raf = requestAnimationFrame(tick);
  };

  const ensureTick = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(tick);
  };

  stage.addEventListener("pointerenter", ensureTick);
  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    targetX = px * 10;
    targetY = py * -8;
    ensureTick();
  });
  stage.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
    ensureTick();
  });

  window.addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(raf);
      running = false;
    },
    { once: true },
  );
}

function initProductRotator(): void {
  const root = document.querySelector<HTMLElement>("[data-product-rotator]");
  if (!root) return;

  const slides = [...root.querySelectorAll<HTMLElement>("[data-product-slide]")];
  const caption = document.querySelector<HTMLElement>("[data-product-caption]");
  const dots = [...document.querySelectorAll<HTMLButtonElement>("[data-product-dot]")];
  if (slides.length < 2) return;

  let index = 0;
  let timer = 0;

  const show = (next: number) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
      slide.setAttribute("aria-hidden", i === index ? "false" : "true");
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-current", i === index ? "true" : "false");
    });
    const active = slides[index];
    if (caption && active?.dataset.caption) {
      caption.textContent = active.dataset.caption;
    }
  };

  const schedule = () => {
    if (prefersReducedMotion()) return;
    window.clearInterval(timer);
    timer = window.setInterval(() => show(index + 1), 4200);
  };

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      show(i);
      schedule();
    });
  });

  show(0);
  schedule();
}

function showRevealsImmediately(): void {
  document.querySelectorAll<HTMLElement>("[data-reveal], [data-reveal-child]").forEach((el) => {
    el.style.opacity = "1";
  });
}

async function initScrollReveals(): Promise<void> {
  const roots = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (!roots.length) return;

  if (!canUseDesktopMotion()) {
    showRevealsImmediately();
    return;
  }

  const { animate, inView, stagger } = await import("motion");
  inView(
    "[data-reveal]",
    (element) => {
      const el = element as HTMLElement;
      const kids = el.querySelectorAll<HTMLElement>("[data-reveal-child]");
      if (kids.length) {
        animate(
          kids,
          { opacity: [0, 1], y: [28, 0] },
          { duration: 0.7, delay: stagger(0.07), easing: [0.22, 1, 0.36, 1] },
        );
      } else {
        animate(
          el,
          { opacity: [0, 1], y: [24, 0] },
          { duration: 0.65, easing: [0.22, 1, 0.36, 1] },
        );
      }
    },
    { amount: 0.2 },
  );
}

export function initPresence(): void {
  initProductRotator();
  void initLenis();
  initProductTilt();
  void initScrollReveals();
}

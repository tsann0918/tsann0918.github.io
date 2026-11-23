// ===== 全站共用：進場動畫 =====
// 有 data-reveal 的元素進入畫面時加上 .is-in（往上浮現），.line-draw 的頂線同時由左畫出。
// data-reveal 可以填秒數當延遲，例如 data-reveal="0.15"。
{
  const items = document.querySelectorAll("[data-reveal], .line-draw");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  items.forEach(function (el) {
    const delay = parseFloat(el.getAttribute("data-reveal"));
    if (!isNaN(delay)) el.style.setProperty("--reveal-delay", delay + "s");
  });

  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target); // 只播一次
        }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }
}

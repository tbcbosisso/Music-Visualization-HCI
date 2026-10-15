// js/main.js  (Home page)
import { initStore } from "./data.js";
import { initChrome, mountGenreChips, showError } from "./ui.js";
import { drawBars } from "./bars.js";
import { drawBubbles } from "./bubbles.js";
import { drawHeatmap } from "./heatmap.js";
import { drawRecoloredBars } from "./barsRecolored.js";

// One chart failing must not take the others down with it.
const safe = (name, fn) => {
  try { return fn(); } catch (err) { console.error(`[${name}]`, err); }
};

(async function main() {
  try {
    await initStore();                       // the single shared dataset
    initChrome();
    mountGenreChips("#tuner");

    safe("bars", () => drawBars("#chart-bars"));
    const bubbles = safe("bubbles", () => drawBubbles("#chart-bubbles"));
    safe("heatmap", () => drawHeatmap("#chart-heatmap"));
    safe("recolor", () => drawRecoloredBars("#chart-bars-recolor"));

    setupScrollytelling({ bubbles });
  } catch (err) {
    showError(err);
  }
})();

/* ---------- Scrollama ---------- */
function setupScrollytelling({ bubbles }) {
  if (typeof scrollama !== "function") return;   // CDN blocked: page still works
  document.body.classList.add("scrolly");

  const scroller = scrollama();
  scroller
    .setup({ step: ".movement", offset: 0.6 })
    .onStepEnter(({ element }) => {
      element.classList.add("is-active");
      if (element.id === "sec-2") bubbles?.play?.();      // the crescendo starts on its own
    })
    .onStepExit(({ element }) => {
      element.classList.remove("is-active");
      if (element.id === "sec-2") bubbles?.pause?.();
    });

  addEventListener("resize", scroller.resize);
}
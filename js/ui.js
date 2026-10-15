// js/ui.js  -  small pieces shared by all pages
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state, store, setState, subscribe } from "./data.js";

// Scroll "playhead" along the bottom of the nav
export function initChrome() {
  const bar = document.querySelector(".playhead");
  if (!bar) return;
  const tick = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.setProperty("--p", (max > 0 ? (h.scrollTop / max) * 100 : 0).toFixed(1) + "%");
  };
  addEventListener("scroll", tick, { passive: true });
  addEventListener("resize", tick);
  tick();
}

// One tooltip for the whole site (styled in style.css)
export function tooltip() {
  let tip = d3.select("body").select(".tooltip");
  if (tip.empty()) tip = d3.select("body").append("div").attr("class", "tooltip");
  return tip;
}

export function moveTip(tip, e) {
  const left = Math.min(e.pageX + 14, document.documentElement.clientWidth - 260);
  tip.style("left", left + "px").style("top", e.pageY - 14 + "px");
}

// Visible message instead of a silent blank page
export function showError(err) {
  console.error(err);
  const box = document.createElement("div");
  box.className = "error-banner";
  box.setAttribute("role", "alert");
  box.textContent =
    "Couldn't load the data (" + (err?.message || err) + "). " +
    "Open the site through Live Server and check that data/music.csv exists.";
  document.body.prepend(box);
}

// Genre chips: the shared filter. Every chart listens to it.
export function mountGenreChips(selector) {
  const root = d3.select(selector);
  if (root.empty()) return;
  root.selectAll("*").remove();

  root.append("span").attr("class", "tuner-label").text("♪ Tuning");
  const util = (label, genres) => root.append("button")
    .attr("class", "chip chip-util").attr("type", "button").text(label)
    .on("click", () => setState({ genres }, "chips"));
  util("All", store.genres);
  util("None", []);

  const chips = root.selectAll(".chip-genre").data(store.genres).join("button")
    .attr("class", "chip chip-genre")
    .attr("type", "button")
    .html(d => `<i style="background:${store.color(d)}"></i>${d}`)
    .on("click", (e, d) => {
      const s = new Set(state.genres);
      if (s.has(d)) s.delete(d); else s.add(d);
      setState({ genres: s }, "chips");
    })
    .on("mouseover", (e, d) => setState({ hover: d }, "chips"))
    .on("mouseout", () => setState({ hover: null }, "chips"));

  const sync = () => chips.attr("aria-pressed", d => state.genres.has(d));
  sync();
  subscribe(p => { if ("genres" in p) sync(); });
}
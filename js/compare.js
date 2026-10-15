// js/compare.js  (Compare page: duet + rank mismatch)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { initStore, store, state, setState, subscribe, summarize } from "./data.js";
import { initChrome, tooltip, moveTip, showError } from "./ui.js";

const f3 = d3.format(".3f");
let era = "all";
let slope = null;
const inEra = d => era === "all" || (era === "pre" ? d.year < 2000 : d.year >= 2000);

(async function main() {
  try {
    await initStore();
    initChrome();
    setupPickers();
    setupEra();
    renderAll();
    let t;
    addEventListener("resize", () => { clearTimeout(t); t = setTimeout(renderAll, 150); });
    subscribe(p => { if ("hover" in p) styleSlope(); });
  } catch (err) {
    showError(err);
  }
})();

function renderAll() {
  renderVerdict();
  lineChart("#duet-hot", "avgArtistHotness", "Artist hotness", f3);
  lineChart("#duet-count", "artistCount", "Artists per year", d3.format("d"));
  renderSlope();
}

/* ---------- Pickers ---------- */
function setupPickers() {
  const fill = (id, val) => {
    const s = d3.select(id);
    s.selectAll("option").data(store.genres).join("option").attr("value", d => d).text(d => d);
    s.property("value", val);
    return s;
  };
  const a = fill("#sel-a", state.A), b = fill("#sel-b", state.B);
  const change = who => {
    let A = a.property("value"), B = b.property("value");
    if (A === B) {                                   // a duet needs two different genres
      const other = store.genres.find(g => g !== (who === "a" ? A : B));
      if (who === "a") B = other; else A = other;
      a.property("value", A); b.property("value", B);
    }
    setState({ A, B }, "compare");
    renderAll();
  };
  a.on("change", () => change("a"));
  b.on("change", () => change("b"));
}

function setupEra() {
  const btns = d3.selectAll("#era button");
  btns.on("click", (e) => {
    era = e.currentTarget.dataset.era;
    btns.attr("aria-pressed", function () { return this.dataset.era === era; });
    renderSlope();
  });
}

/* ---------- Verdict ---------- */
function renderVerdict() {
  const sum = g => summarize(store.data.filter(d => d.genre === g));
  const a = sum(state.A), b = sum(state.B);
  const [big, small] = a.artists >= b.artists ? [[state.A, a], [state.B, b]] : [[state.B, b], [state.A, a]];
  const hotter = a.artistHot >= b.artistHot ? state.A : state.B;
  const ratio = (big[1].artists / Math.max(small[1].artists, 1)).toFixed(1);
  const twist = hotter !== big[0] ? "Bigger isn't hotter." : "Here, bigger is hotter too.";
  d3.select("#verdict").html(
    `<strong>${big[0]}</strong> fields ${ratio}× the artists of ${small[0]}. ` +
    `<strong>${hotter}</strong> runs hotter (${f3(Math.max(a.artistHot, b.artistHot))} vs ${f3(Math.min(a.artistHot, b.artistHot))}). ` +
    `<em>${twist}</em>`);
}

/* ---------- Duet line charts ---------- */
function lineChart(sel, key, title, fmt) {
  const el = d3.select(sel);
  el.selectAll("*").remove();
  const node = el.node();
  const w = node.clientWidth, h = node.clientHeight;
  if (!w || !h) return;

  const m = { top: 48, right: 22, bottom: 36, left: 54 };
  const W = w - m.left - m.right, H = h - m.top - m.bottom;
  const svg = el.append("svg").attr("viewBox", [0, 0, w, h]).style("width", "100%").style("height", "100%");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const picks = [state.A, state.B];
  const series = picks.map(genre => ({
    genre, rows: store.data.filter(d => d.genre === genre).sort((p, q) => p.year - q.year)
  }));
  const all = series.flatMap(s => s.rows);

  const x = d3.scaleLinear().domain(store.extent).range([0, W]);
  const y0 = key === "artistCount" ? 0 : d3.min(all, d => d[key]);
  const y = d3.scaleLinear().domain([y0, d3.max(all, d => d[key])]).nice().range([H, 0]);

  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-W).tickFormat("")).select(".domain").remove();
  g.append("g").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")).tickSizeOuter(0));
  g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(fmt).tickSizeOuter(0));

  svg.append("text").attr("x", m.left).attr("y", 24).attr("font-size", 13).attr("font-weight", 700).attr("fill", "#1c1930").text(title);

  const tip = tooltip();
  const line = d3.line().x(d => x(d.year)).y(d => y(d[key]));
  series.forEach(s => {
    const c = store.color(s.genre);
    g.append("path").datum(s.rows).attr("d", line).attr("fill", "none")
      .attr("stroke", c).attr("stroke-width", 2.4).attr("stroke-linejoin", "round").attr("opacity", 0.9);
    g.selectAll(null).data(s.rows).join("circle")
      .attr("cx", d => x(d.year)).attr("cy", d => y(d[key])).attr("r", 4)
      .attr("fill", c).attr("stroke", "#fff").attr("stroke-width", 1.2).style("cursor", "pointer")
      .on("mouseover", (e, d) => tip.style("opacity", 1).html(`<strong>${d.genre}, ${d.year}</strong><br/>${title}: ${fmt(d[key])}`))
      .on("mousemove", e => moveTip(tip, e))
      .on("mouseout", () => tip.style("opacity", 0));
  });

  // Legend, top-right (A then B, laid out right to left)
  let cursor = w - m.right;
  series.slice().reverse().forEach(s => {
    const label = svg.append("text").attr("x", cursor).attr("y", 24).attr("text-anchor", "end")
      .attr("font-size", 12).attr("fill", "#1c1930").text(s.genre);
    const tw = label.node().getComputedTextLength?.() || s.genre.length * 7;
    svg.append("circle").attr("cx", cursor - tw - 12).attr("cy", 20).attr("r", 5).attr("fill", store.color(s.genre));
    cursor -= tw + 34;
  });
}

/* ---------- Rank mismatch slopegraph ---------- */
function renderSlope() {
  const el = d3.select("#slope");
  el.selectAll("*").remove();
  const node = el.node();
  const w = node.clientWidth, h = node.clientHeight;
  if (!w || !h) return;

  const rows = store.data.filter(inEra);
  const by = d3.rollups(rows, v => summarize(v), d => d.genre).map(([genre, s]) => ({ genre, ...s }));
  const byCount = [...by].sort((p, q) => q.artists - p.artists);
  const byHot = [...by].sort((p, q) => q.artistHot - p.artistHot);
  by.forEach(d => { d.rc = byCount.indexOf(d) + 1; d.rh = byHot.indexOf(d) + 1; });

  const m = { top: 56, right: 170, bottom: 24, left: 170 };
  const W = w - m.left - m.right, H = h - m.top - m.bottom;
  const svg = el.append("svg").attr("viewBox", [0, 0, w, h]).style("width", "100%").style("height", "100%");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
  const y = d3.scaleLinear().domain([1, Math.max(by.length, 2)]).range([0, H]);

  g.append("text").attr("x", -12).attr("y", -26).attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#1c1930").text("Most artists");
  g.append("text").attr("x", W + 12).attr("y", -26).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#1c1930").text("Hottest");

  const item = g.selectAll(".sl").data(by).join("g").attr("class", "sl").style("cursor", "pointer")
    .on("mouseover", (e, d) => setState({ hover: d.genre }, "slope"))
    .on("mouseout", () => setState({ hover: null }, "slope"));

  const c = d => store.color(d.genre);
  item.append("line").attr("x1", 0).attr("x2", W).attr("y1", d => y(d.rc)).attr("y2", d => y(d.rh))
    .attr("stroke", "transparent").attr("stroke-width", 14);
  item.append("line").attr("class", "ln").attr("x1", 0).attr("x2", W).attr("y1", d => y(d.rc)).attr("y2", d => y(d.rh))
    .attr("stroke", c).attr("stroke-linecap", "round");
  item.append("circle").attr("cx", 0).attr("cy", d => y(d.rc)).attr("r", 5).attr("fill", c);
  item.append("circle").attr("cx", W).attr("cy", d => y(d.rh)).attr("r", 5).attr("fill", c);
  item.append("text").attr("x", -14).attr("y", d => y(d.rc)).attr("dy", "0.35em").attr("text-anchor", "end")
    .attr("font-size", 12).attr("fill", "#1c1930").text(d => `${d.genre} · ${d.artists}`);
  item.append("text").attr("x", W + 14).attr("y", d => y(d.rh)).attr("dy", "0.35em")
    .attr("font-size", 12).attr("fill", "#1c1930").text(d => `${f3(d.artistHot)} · ${d.genre}`);

  slope = { item };
  styleSlope();

  const big = byCount[0];
  d3.select("#slope-note").text(big
    ? `${big.genre}: #1 by artists, #${big.rh} by hotness.`
    : "No data in this era.");
}

function styleSlope() {
  if (!slope) return;
  const op = d => (state.hover ? (state.hover === d.genre ? 1 : 0.15) : 0.85);
  slope.item.attr("opacity", op);
  slope.item.select(".ln").attr("stroke-width", d => (d.genre === state.A || d.genre === state.B ? 5 : 2.5));
}
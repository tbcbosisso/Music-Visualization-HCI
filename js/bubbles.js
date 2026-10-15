// js/bubbles.js  (Movement II: animated bubble scatter, linked to the shared store)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { store, state, setState, subscribe, emphasis } from "./data.js";
import { tooltip, moveTip } from "./ui.js";

export function drawBubbles(selector) {
  const container = d3.select(selector);
  const node = container.node();
  if (!node) return console.error("[bubbles] container not found:", selector);
  const width = node.clientWidth, height = node.clientHeight;
  if (!width || !height) return console.error("[bubbles] container has zero size. Check .story-chart height in CSS.");

  container.style("position", "relative");

  const { data, genres: allGenres, years } = store;
  const color = g => store.color(g);

  // Wide right margin holds the legend, so it never touches an axis.
  const margin = { top: 30, right: 170, bottom: 90, left: 70 };
  const W = width - margin.left - margin.right;
  const H = height - margin.top - margin.bottom;

  const svg = container.append("svg").attr("viewBox", [0, 0, width, height])
    .style("width", "100%").style("height", "100%");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Scales use ALL data, so filtering never rescales the chart.
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.artistCount)]).nice().range([0, W]);
  const y = d3.scaleLinear().domain(d3.extent(data, d => d.avgArtistHotness)).nice().range([H, 0]);
  const r = d3.scaleSqrt().domain(d3.extent(data, d => d.avgSongHotness)).range([6, 26]);

  // Quadrants
  const quads = [
    { x: 0,     y: 0,     label: "EMERGING",   fill: "#2a9d8f" },
    { x: W / 2, y: 0,     label: "BOUTIQUE",   fill: "#e9c46a" },
    { x: 0,     y: H / 2, label: "DECLINING",  fill: "#264653" },
    { x: W / 2, y: H / 2, label: "MAINSTREAM", fill: "#e76f51" }
  ];
  g.selectAll(".quad").data(quads).join("rect").attr("class", "quad")
    .attr("x", d => d.x).attr("y", d => d.y).attr("width", W / 2).attr("height", H / 2)
    .attr("fill", d => d.fill).attr("opacity", 0.1);
  g.selectAll(".quad-label").data(quads).join("text").attr("class", "quad-label")
    .attr("x", d => d.x + 12).attr("y", d => d.y + 20)
    .attr("font-size", 11).attr("letter-spacing", "0.08em").attr("fill", "#6b6580").text(d => d.label);

  g.append("g").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).tickSizeOuter(0));
  g.append("g").call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(".2f")).tickSizeOuter(0));
  g.append("text").attr("x", W / 2).attr("y", H + 38).attr("text-anchor", "middle")
    .attr("font-size", 12).attr("fill", "#3a3552").text("Number of artists");
  g.append("text").attr("transform", "rotate(-90)").attr("x", -H / 2).attr("y", -50).attr("text-anchor", "middle")
    .attr("font-size", 12).attr("fill", "#3a3552").text("Avg artist hotness");

  const trailLayer = g.append("g").attr("class", "trails");
  const bubbleLayer = g.append("g").attr("class", "bubbles");

  const byYear = d3.group(data, d => d.year);
  const tip = tooltip();

  function showTip(e, d) {
    const rows = byYear.get(d.year) || [];
    const rankCount = [...rows].sort((a, b) => b.artistCount - a.artistCount).findIndex(row => row.genre === d.genre) + 1;
    const rankHot = [...rows].sort((a, b) => b.avgArtistHotness - a.avgArtistHotness).findIndex(row => row.genre === d.genre) + 1;
    tip.style("opacity", 1).html(`
      <strong>${d.genre}, ${d.year}</strong><br/>
      Artists: ${d.artistCount}<br/>
      Avg artist hotness: ${d.avgArtistHotness.toFixed(3)}<br/>
      Rank by count: #${rankCount} of ${rows.length}<br/>
      Rank by hotness: #${rankHot} of ${rows.length}`);
    moveTip(tip, e);
  }

  /* ---------- Speed ---------- */
  let speed = 0.5;                       // default: relaxed
  const BASE_STEP_MS = 1600;             // time per year at 1x
  const stepMs = () => BASE_STEP_MS / speed;

  /* ---------- Drawing ---------- */
  const startIdx = Math.max(0, years.findIndex(yr => yr >= 1990));  // playback starts where data gets dense
  let currentIdx = Math.max(0, years.indexOf(state.year));
  const visible = rows => rows.filter(d => state.genres.has(d.genre));

  function drawYear(i, dur = 0, trails = false) {
    currentIdx = i;
    const rows = visible(byYear.get(years[i]) || []);
    const prevRows = i > 0 ? visible(byYear.get(years[i - 1]) || []) : [];

    if (trails && prevRows.length) {
      trailLayer.selectAll(null).data(prevRows).join("circle")
        .attr("cx", d => x(d.artistCount)).attr("cy", d => y(d.avgArtistHotness))
        .attr("r", d => r(d.avgSongHotness)).attr("fill", d => color(d.genre))
        .attr("opacity", 0.22)
        .transition().duration(stepMs() * 1.5).attr("opacity", 0).remove();
    }

    const bubbles = bubbleLayer.selectAll("circle").data(rows, d => d.genre).join(
      enter => enter.append("circle")
        .attr("cx", d => x(d.artistCount)).attr("cy", d => y(d.avgArtistHotness)).attr("r", 0)
        .attr("fill", d => color(d.genre)).attr("fill-opacity", 0.78).attr("stroke", "#fff")
        .style("cursor", "pointer"),
      update => update.interrupt(),      // cancel a pending fade-out if the genre returns
      exit => exit.transition().duration(300).attr("r", 0).remove()
    );

    bubbles.attr("opacity", d => emphasis(d.genre))
      .transition().duration(dur).ease(d3.easeCubicInOut)
      .attr("cx", d => x(d.artistCount)).attr("cy", d => y(d.avgArtistHotness)).attr("r", d => r(d.avgSongHotness));

    bubbles
      .on("mouseover", (e, d) => { setState({ hover: d.genre }, "bubbles"); showTip(e, d); })
      .on("mousemove", (e, d) => showTip(e, d))
      .on("mouseout", () => { setState({ hover: null }, "bubbles"); tip.style("opacity", 0); });
  }

  function highlight() {
    bubbleLayer.selectAll("circle").transition("hl").duration(120).attr("opacity", d => emphasis(d.genre));
  }

  /* ---------- Legend = genre filter (right margin), shares state with the chips ---------- */
  const ROW_H = 24, ROW_W = 146;
  const legend = g.append("g").attr("class", "legend").attr("transform", `translate(${W + 24},0)`);
  legend.append("text").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#1c1930").text("Genres");

  const quick = legend.append("g").attr("transform", "translate(0,14)");
  [["All", () => setState({ genres: allGenres }, "bubbles")], ["None", () => setState({ genres: [] }, "bubbles")]]
    .forEach(([label, fn], i) => {
      const b = quick.append("g").attr("transform", `translate(${i * 52},0)`)
        .attr("role", "button").attr("tabindex", 0).style("cursor", "pointer")
        .on("click", fn)
        .on("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
      b.append("rect").attr("width", 44).attr("height", 22).attr("rx", 6).attr("fill", "#f3ecdb").attr("stroke", "#c2b697");
      b.append("text").attr("x", 22).attr("y", 15).attr("text-anchor", "middle").attr("font-size", 11)
        .attr("fill", "#1c1930").style("pointer-events", "none").text(label);
    });

  const toggle = genre => {
    const s = new Set(state.genres);
    if (s.has(genre)) s.delete(genre); else s.add(genre);
    setState({ genres: s }, "bubbles");
  };

  const legendItems = legend.selectAll(".legend-item").data(allGenres).join("g")
    .attr("class", "legend-item").attr("transform", (d, i) => `translate(0,${48 + i * ROW_H})`)
    .attr("role", "checkbox").attr("tabindex", 0).style("cursor", "pointer")
    .on("click", (e, d) => toggle(d))
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(d); } });

  legendItems.append("rect").attr("class", "hit").attr("width", ROW_W).attr("height", ROW_H - 2).attr("rx", 5)
    .attr("fill", "transparent")
    .on("mouseover", function () { d3.select(this).attr("fill", "#f3ecdb"); })
    .on("mouseout", function () { d3.select(this).attr("fill", "transparent"); });
  legendItems.append("circle").attr("cx", 13).attr("cy", (ROW_H - 2) / 2).attr("r", 6).attr("stroke-width", 2)
    .attr("stroke", d => color(d)).style("pointer-events", "none");
  legendItems.append("text").attr("class", "label").attr("x", 27).attr("y", (ROW_H - 2) / 2).attr("dy", "0.35em")
    .attr("font-size", 12).attr("fill", "#1c1930").style("pointer-events", "none").text(d => d);
  legendItems.append("text").attr("class", "only").attr("x", ROW_W - 8).attr("y", (ROW_H - 2) / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").attr("font-size", 10).attr("fill", "#4b3fa0").attr("text-decoration", "underline")
    .text("only").on("click", (e, d) => { e.stopPropagation(); setState({ genres: [d] }, "bubbles"); });

  const emptyMsg = g.append("text").attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle")
    .attr("font-size", 13).attr("fill", "#777").attr("opacity", 0)
    .text("No genres selected. Click a genre or press All.");

  function styleLegend() {
    const partial = state.genres.size < allGenres.length;
    legendItems.style("opacity", d => (state.genres.has(d) ? 1 : 0.4)).attr("aria-checked", d => state.genres.has(d));
    legendItems.select("circle").attr("fill", d => (state.genres.has(d) ? color(d) : "#fff"));
    legendItems.select(".label").attr("font-weight", d => (partial && state.genres.has(d) ? 700 : 400));
    emptyMsg.attr("opacity", state.genres.size ? 0 : 1);
  }

  /* ---------- Controls: play, reset, speed, year ---------- */
  const controls = container.append("div").attr("class", "controls")
    .style("position", "absolute").style("left", `${margin.left}px`).style("bottom", "0")
    .style("display", "flex").style("align-items", "center").style("flex-wrap", "wrap").style("gap", "10px");

  const playBtn = controls.append("button").attr("type", "button").text("▶ Play");
  const resetBtn = controls.append("button").attr("type", "button").text("⟲ Reset");
  const speedWrap = controls.append("label").style("display", "flex").style("align-items", "center").style("gap", "6px").text("Speed");
  const speedSel = speedWrap.append("select").attr("aria-label", "Animation speed");
  [[0.25, "0.25× slow motion"], [0.5, "0.5×"], [1, "1×"], [2, "2×"], [4, "4× fast"]].forEach(([v, t]) =>
    speedSel.append("option").attr("value", v).property("selected", v === speed).text(t));
  speedSel.on("change", e => { speed = +e.target.value; });
  const yearLabel = controls.append("strong").attr("class", "year-label").text(years[currentIdx]);

  let playing = false, timer = null, autoplayed = false;

  const stop = () => { playing = false; clearTimeout(timer); playBtn.text("▶ Play"); };

  function jumpTo(i) {
    trailLayer.selectAll("*").remove();
    drawYear(i, 0);
    yearLabel.text(years[i]);
    setState({ year: years[i] }, "bubbles");
  }

  function step() {
    const next = currentIdx + 1;
    if (next >= years.length) return stop();
    drawYear(next, stepMs() * 0.75, true);
    yearLabel.text(years[next]);
    setState({ year: years[next] }, "bubbles");
    if (next >= years.length - 1) return stop();
    if (playing) timer = setTimeout(step, stepMs());
  }

  playBtn.on("click", () => {
    if (playing) return stop();
    playing = true;
    playBtn.text("⏸ Pause");
    if (currentIdx >= years.length - 1 || currentIdx < startIdx) jumpTo(startIdx);
    step();
  });

  resetBtn.on("click", () => { stop(); jumpTo(startIdx); });

  subscribe((p, src) => {
    if ("genres" in p) { styleLegend(); drawYear(currentIdx, 0); }
    if ("year" in p && src !== "bubbles") {
      const i = years.indexOf(state.year);
      if (i >= 0) { drawYear(i, 500); yearLabel.text(state.year); }
    }
    if ("hover" in p) highlight();
  });

  styleLegend();
  drawYear(currentIdx, 0);

  return {
    play() {
      if (playing) return;
      if (!autoplayed) { autoplayed = true; jumpTo(startIdx); }   // first scroll-in starts at the dense years
      playBtn.node().click();
    },
    pause() { if (playing) stop(); },
    reset() { resetBtn.node().click(); }
  };
}
// js/barsRecolored.js  (Movement IV: same bars as Movement I, filled by artist hotness)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { store, state, setState, subscribe, emphasis, artistsHtml } from "./data.js";
import { tooltip, moveTip } from "./ui.js";

export function drawRecoloredBars(selector) {
  const container = d3.select(selector);
  const node = container.node();
  if (!node) return console.error("[barsRecolored] container not found:", selector);
  const width = node.clientWidth, height = node.clientHeight;
  if (!width || !height) return console.error("[barsRecolored] container has zero size. Check .story-chart height in CSS.");

  container.style("position", "relative");

  const { genres, years, byKey, data } = store;
  // Identical to bars.js so the two charts line up.
  const margin = { top: 52, right: 130, bottom: 74, left: 100 };   // same as bars.js; room for the readout
  const W = width - margin.left - margin.right;
  const H = height - margin.top - margin.bottom;

  const svg = container.append("svg").attr("viewBox", [0, 0, width, height])
    .style("width", "100%").style("height", "100%");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().domain(genres).range([0, H]).padding(0.15);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.artistCount)]).nice().range([0, W]);

  // hot = red, cold = blue
  const [lo, hi] = d3.extent(data, d => d.avgArtistHotness);
  const colorScale = d3.scaleSequential().domain([hi, lo]).interpolator(d3.interpolateRdBu);
  const fillFor = d => (d.hotness == null ? "#cfc4a8" : colorScale(d.hotness));

  const yAxis = g.append("g").call(d3.axisLeft(y).tickSizeOuter(0));
  g.append("g").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
  g.append("text").attr("x", W / 2).attr("y", H + 38).attr("text-anchor", "middle")
    .attr("font-size", 12).attr("fill", "#3a3552").text("Number of artists (color = avg artist hotness)");

  const rowsFor = yr => genres.map(genre => {
    const r = byKey.get(`${genre}|${yr}`);
    return { genre, year: yr, count: r?.artistCount ?? 0, hotness: r ? r.avgArtistHotness : null };
  });

  const rowG = g.selectAll(".row").data(rowsFor(state.year), d => d.genre).join("g")
    .attr("class", "row").attr("transform", d => `translate(0,${y(d.genre)})`);
  rowG.append("rect").attr("class", "bar").attr("height", y.bandwidth()).attr("rx", 3);
  rowG.append("text").attr("class", "val").attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("font-size", 11).attr("fill", "#3a3552");
  const tip = tooltip();
  rowG.append("rect").attr("class", "hit").attr("width", W).attr("height", y.bandwidth()).attr("fill", "transparent")
    .on("mouseover", (e, d) => {
      setState({ hover: d.genre }, "recolor");
      tip.style("opacity", 1).html(d.count
        ? `<strong>${d.genre}, ${d.year}</strong><br/>${d.count} artists<br/>Artist hotness ${d.hotness.toFixed(3)}<br/>Top: ${artistsHtml(byKey.get(`${d.genre}|${d.year}`))}`
        : `<strong>${d.genre}, ${d.year}</strong><br/>No data this year`);
    })
    .on("mousemove", e => moveTip(tip, e))
    .on("mouseout", () => { setState({ hover: null }, "recolor"); tip.style("opacity", 0); })
    .on("click", (e, d) => { picked = picked === d.genre ? null : d.genre; markPicked(); renderReadout(); });

  // Readout strip (top of the card): stats + top artists for the clicked genre at the shared year
  let picked = null;
  const readout = container.append("div").attr("class", "readout")
    .style("position", "absolute").style("top", "12px").style("left", `${margin.left}px`).style("right", "16px");

  function renderReadout() {
    if (!picked) { readout.text("Click a bar: see that genre's top artists."); return; }
    const r = byKey.get(`${picked}|${state.year}`);
    readout.html(r
      ? `<strong>${picked}, ${state.year}</strong> &nbsp; ${r.artistCount} artists · artist hotness ${r.avgArtistHotness.toFixed(3)}<br/><strong>Top artists:</strong> ${artistsHtml(r)}`
      : `<strong>${picked}, ${state.year}</strong> &nbsp; No data this year.`);
  }
  function markPicked() {
    rowG.select(".bar").attr("stroke", d => (d.genre === picked ? "#1c1930" : "none")).attr("stroke-width", 2);
  }

  // Legend: vertical, HOT (red) on top, COLD (blue) at the bottom
  const legendH = Math.min(190, H - 30);
  const gradId = "recolor-gradient";
  const grad = svg.append("defs").append("linearGradient").attr("id", gradId)
    .attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
  d3.range(0, 1.01, 0.1).forEach(t => grad.append("stop")
    .attr("offset", `${t * 100}%`).attr("stop-color", colorScale(hi - t * (hi - lo))));

  const legend = svg.append("g").attr("class", "legend")
    .attr("transform", `translate(${width - 112},${margin.top + 34})`);
  legend.append("text").attr("y", -26).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#1c1930").text("Artist");
  legend.append("text").attr("y", -12).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#1c1930").text("hotness");
  legend.append("rect").attr("width", 16).attr("height", legendH).attr("rx", 3).attr("fill", `url(#${gradId})`);
  legend.append("text").attr("x", 24).attr("y", 10).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#b2182b").text("Hot");
  legend.append("text").attr("x", 24).attr("y", 24).attr("font-size", 10).attr("fill", "#666").text(hi.toFixed(2));
  legend.append("text").attr("x", 24).attr("y", legendH - 14).attr("font-size", 10).attr("fill", "#666").text(lo.toFixed(2));
  legend.append("text").attr("x", 24).attr("y", legendH).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#2166ac").text("Cold");

  // Controls + live one-line takeaway
  const controls = container.append("div").attr("class", "controls")
    .style("position", "absolute").style("left", `${margin.left}px`).style("right", "16px").style("bottom", "0")
    .style("display", "flex").style("align-items", "center").style("flex-wrap", "wrap").style("gap", "12px");
  const yearLabel = controls.append("strong").attr("class", "year-label").text(state.year);
  const slider = controls.append("input").attr("type", "range").attr("aria-label", "Year")
    .attr("min", 0).attr("max", years.length - 1).attr("step", 1)
    .property("value", years.indexOf(state.year)).style("width", "220px");
  const note = controls.append("span").attr("class", "ctl-note");

  function paint(dur) {
    rowG.select(".bar").transition().duration(dur).attr("width", d => x(d.count)).attr("fill", fillFor);
    rowG.select(".val").text(d => (d.count ? d.count : "–"))
      .transition().duration(dur).attr("x", d => x(d.count) + 6);
  }

  function takeaway(rows) {
    const live = rows.filter(d => d.count > 0);
    if (!live.length) return "";
    const big = d3.greatest(live, d => d.count);
    const hot = d3.greatest(live, d => d.hotness);
    return big.genre === hot.genre
      ? `${big.genre} leads in both size and heat.`
      : `Most artists: ${big.genre}. Hottest: ${hot.genre}.`;
  }

  function update(yr, dur = 400) {
    const rows = rowsFor(yr);
    rowG.data(rows, d => d.genre);
    paint(dur);
    note.text(takeaway(rows));
    renderReadout();
  }
  update(state.year, 0);
  markPicked();

  function highlight() {
    rowG.transition("hl").duration(150).attr("opacity", d => emphasis(d.genre));
    yAxis.selectAll(".tick").transition("hl").duration(150).attr("opacity", d => emphasis(d));
  }
  highlight();

  slider.on("input", e => {
    const yr = years[+e.target.value];
    yearLabel.text(yr);
    setState({ year: yr }, "recolor");
    update(yr);
  });

  subscribe((p, src) => {
    if ("year" in p && src !== "recolor") {
      slider.property("value", years.indexOf(state.year));
      yearLabel.text(state.year);
      update(state.year);
    }
    if ("genres" in p || "hover" in p) highlight();
  });

  return { update };
}
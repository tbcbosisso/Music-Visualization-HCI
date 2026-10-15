// js/heatmap.js  (Movement III: genre x year heatmap, linked to the shared store)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { store, state, setState, subscribe, emphasis, artistsHtml } from "./data.js";
import { tooltip, moveTip } from "./ui.js";

export function drawHeatmap(selector) {
  const container = d3.select(selector);
  const node = container.node();
  if (!node) return console.error("[heatmap] container not found:", selector);
  const width = node.clientWidth, height = node.clientHeight;
  if (!width || !height) return console.error("[heatmap] container has zero size. Check .story-chart height in CSS.");

  container.style("position", "relative");

  const { genres, data, extent, byKey } = store;
  const years = d3.range(extent[0], extent[1] + 1);   // full calendar, so gaps are honest

  const margin = { top: 76, right: 130, bottom: 50, left: 100 };   // room for the two-line readout
  const W = width - margin.left - margin.right;
  const H = height - margin.top - margin.bottom;

  const svg = container.append("svg").attr("viewBox", [0, 0, width, height])
    .style("width", "100%").style("height", "100%");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(years).range([0, W]).padding(0.06);
  const y = d3.scaleBand().domain(genres).range([0, H]).padding(0.08);

  // hot = red, cold = blue
  const [lo, hi] = d3.extent(data, d => d.avgSongHotness);
  const colorScale = d3.scaleSequential().domain([hi, lo]).interpolator(d3.interpolateRdBu);
  const EMPTY = "#cfc4a8";

  const cells = genres.flatMap(genre => years.map(year => ({ genre, year, row: byKey.get(`${genre}|${year}`) })));
  const tip = tooltip();

  // Readout strip (top of the card)
  const readout = container.append("div").attr("class", "readout")
    .style("position", "absolute").style("top", "12px").style("left", `${margin.left}px`).style("right", "16px")
    .text("Click a cell: see its top artists, and every chart jumps to that year.");

  const showReadout = d => readout.html(
    `<strong>${d.genre}, ${d.year}</strong> &nbsp; ${d.row.artistCount} artists · ${d.row.songCount} songs · ` +
    `artist hotness ${d.row.avgArtistHotness.toFixed(3)} · song hotness ${d.row.avgSongHotness.toFixed(3)}` +
    `<br/><strong>Top artists:</strong> ${artistsHtml(d.row)}`);

  const cellSel = g.selectAll(".cell").data(cells).join("rect").attr("class", "cell")
    .attr("x", d => x(d.year)).attr("y", d => y(d.genre))
    .attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 2)
    .attr("fill", d => (d.row ? colorScale(d.row.avgSongHotness) : EMPTY))
    .style("cursor", d => (d.row ? "pointer" : "default"))
    .on("mouseover", (e, d) => {
      setState({ hover: d.genre }, "heatmap");
      tip.style("opacity", 1).html(d.row
        ? `<strong>${d.genre}, ${d.year}</strong><br/>Song hotness ${d.row.avgSongHotness.toFixed(3)}<br/>${d.row.songCount} songs · ${d.row.artistCount} artists<br/>Top: ${artistsHtml(d.row)}`
        : `<strong>${d.genre}, ${d.year}</strong><br/>No data (fewer than 3 artists)`);
    })
    .on("mousemove", e => moveTip(tip, e))
    .on("mouseout", () => { setState({ hover: null }, "heatmap"); tip.style("opacity", 0); })
    .on("click", (e, d) => {
      if (!d.row) return;
      setState({ year: d.year }, "heatmap");
      showReadout(d);
      moveMarker(true);
    });

  const yAxis = g.append("g").call(d3.axisLeft(y).tickSizeOuter(0));
  g.append("g").attr("transform", `translate(0,${H})`)
    .call(d3.axisBottom(x).tickValues(years.filter(yr => yr % 5 === 0)).tickFormat(d3.format("d")).tickSizeOuter(0));

  // Current-year marker (follows the shared year)
  const marker = g.append("rect").attr("class", "year-marker")
    .attr("y", -6).attr("height", H + 12).attr("width", x.bandwidth() + 4).attr("rx", 3)
    .attr("fill", "none").attr("stroke", "#1c1930").attr("stroke-width", 1.6).style("pointer-events", "none");
  function moveMarker(animate) {
    const t = marker.interrupt();
    (animate ? t.transition().duration(250) : t).attr("x", x(state.year) - 2);
  }
  moveMarker(false);

  function highlight() {
    cellSel.attr("opacity", d => emphasis(d.genre));
    yAxis.selectAll(".tick").attr("opacity", d => emphasis(d));
  }
  highlight();

  // Legend: vertical gradient, HOT (red) top, COLD (blue) bottom, plus "no data"
  const legendH = Math.min(160, H);
  const gradId = "heat-gradient";
  const grad = svg.append("defs").append("linearGradient").attr("id", gradId)
    .attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
  d3.range(0, 1.01, 0.1).forEach(t => grad.append("stop")
    .attr("offset", `${t * 100}%`).attr("stop-color", colorScale(hi - t * (hi - lo))));

  const legend = svg.append("g").attr("class", "legend")
    .attr("transform", `translate(${width - margin.right + 30},${margin.top})`);
  legend.append("text").attr("y", -10).attr("font-size", 11).attr("font-weight", 700).attr("fill", "#1c1930").text("Song hotness");
  legend.append("rect").attr("width", 14).attr("height", legendH).attr("rx", 3).attr("fill", `url(#${gradId})`);
  legend.append("text").attr("x", 22).attr("y", 10).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#b2182b").text("Hot");
  legend.append("text").attr("x", 22).attr("y", 24).attr("font-size", 10).attr("fill", "#666").text(hi.toFixed(2));
  legend.append("text").attr("x", 22).attr("y", legendH - 14).attr("font-size", 10).attr("fill", "#666").text(lo.toFixed(2));
  legend.append("text").attr("x", 22).attr("y", legendH).attr("font-size", 12).attr("font-weight", 700).attr("fill", "#2166ac").text("Cold");
  legend.append("rect").attr("y", legendH + 22).attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", EMPTY);
  legend.append("text").attr("x", 22).attr("y", legendH + 33).attr("font-size", 11).attr("fill", "#666").text("No data");

  subscribe((p, src) => {
    if ("year" in p && src !== "heatmap") moveMarker(true);
    if ("genres" in p || "hover" in p) highlight();
  });

  return { highlight };
}
// js/bars.js  (Movement I: artist count per genre, linked to the shared year + genre filter)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { store, state, setState, subscribe, emphasis, artistsHtml } from "./data.js";
import { tooltip, moveTip } from "./ui.js";

export function drawBars(selector) {
  const container = d3.select(selector);
  const node = container.node();
  if (!node) return console.error("[bars] container not found:", selector);
  const width = node.clientWidth, height = node.clientHeight;
  if (!width || !height) return console.error("[bars] container has zero size. Check .story-chart height in CSS.");

  container.style("position", "relative");

  const { genres, years, byKey, data } = store;
  // Keep identical to barsRecolored.js so the two charts line up.
  const margin = { top: 52, right: 130, bottom: 74, left: 100 };
  const W = width - margin.left - margin.right;
  const H = height - margin.top - margin.bottom;

  const svg = container.append("svg").attr("viewBox", [0, 0, width, height])
    .style("width", "100%").style("height", "100%");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().domain(genres).range([0, H]).padding(0.15);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.artistCount)]).nice().range([0, W]);

  const yAxis = g.append("g").call(d3.axisLeft(y).tickSizeOuter(0));
  g.append("g").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
  g.append("text").attr("x", W / 2).attr("y", H + 38).attr("text-anchor", "middle")
    .attr("font-size", 12).attr("fill", "#3a3552").text("Number of artists");

  const rowsFor = yr => {
    const i = years.indexOf(yr);
    const prev = i > 0 ? years[i - 1] : null;
    return genres.map(genre => ({
      genre, year: yr,
      count: byKey.get(`${genre}|${yr}`)?.artistCount ?? 0,
      prevCount: prev == null ? 0 : byKey.get(`${genre}|${prev}`)?.artistCount ?? 0
    }));
  };

  const rowG = g.selectAll(".row").data(rowsFor(state.year), d => d.genre).join("g")
    .attr("class", "row").attr("transform", d => `translate(0,${y(d.genre)})`);

  rowG.append("rect").attr("class", "ghost").attr("height", y.bandwidth()).attr("rx", 3).attr("fill", "#c4b8da");
  rowG.append("rect").attr("class", "bar").attr("y", y.bandwidth() * 0.15).attr("height", y.bandwidth() * 0.7)
    .attr("rx", 3).attr("fill", "#4b4f8c");
  rowG.append("text").attr("class", "val").attr("y", y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("font-size", 11).attr("fill", "#3a3552");
  const tip = tooltip();
  rowG.append("rect").attr("class", "hit").attr("width", W).attr("height", y.bandwidth()).attr("fill", "transparent")
    .on("mouseover", (e, d) => {
      setState({ hover: d.genre }, "bars");
      const row = byKey.get(`${d.genre}|${d.year}`);
      tip.style("opacity", 1).html(d.count
        ? `<strong>${d.genre}, ${d.year}</strong><br/>${d.count} artists<br/>Top: ${artistsHtml(row)}`
        : `<strong>${d.genre}, ${d.year}</strong><br/>No data this year`);
    })
    .on("mousemove", e => moveTip(tip, e))
    .on("mouseout", () => { setState({ hover: null }, "bars"); tip.style("opacity", 0); });

  function paint(dur) {
    rowG.select(".ghost").transition().duration(dur).attr("width", d => x(d.prevCount));
    rowG.select(".bar").transition().duration(dur).attr("width", d => x(d.count));
    rowG.select(".val").text(d => (d.count ? d.count : "–"))
      .transition().duration(dur).attr("x", d => x(d.count) + 6);
  }
  paint(0);

  function update(yr) {
    rowG.data(rowsFor(yr), d => d.genre);
    paint(400);
  }

  function highlight() {
    rowG.transition("hl").duration(150).attr("opacity", d => emphasis(d.genre));
    yAxis.selectAll(".tick").transition("hl").duration(150).attr("opacity", d => emphasis(d));
  }
  highlight();

  // Key (right margin)
  const key = g.append("g").attr("transform", `translate(${W + 24},0)`);
  [["#4b4f8c", "This year"], ["#c4b8da", "Previous"]].forEach(([c, t], i) => {
    key.append("rect").attr("y", i * 20).attr("width", 14).attr("height", 10).attr("rx", 2).attr("fill", c);
    key.append("text").attr("x", 20).attr("y", i * 20 + 9).attr("font-size", 11).attr("fill", "#3a3552").text(t);
  });

  // Year slider (steps through years that have data)
  const controls = container.append("div").attr("class", "controls")
    .style("position", "absolute").style("left", `${margin.left}px`).style("bottom", "0")
    .style("display", "flex").style("align-items", "center").style("gap", "12px");
  const yearLabel = controls.append("strong").attr("class", "year-label").text(state.year);
  const slider = controls.append("input").attr("type", "range").attr("aria-label", "Year")
    .attr("min", 0).attr("max", years.length - 1).attr("step", 1)
    .property("value", years.indexOf(state.year)).style("width", "260px");

  slider.on("input", e => {
    const yr = years[+e.target.value];
    yearLabel.text(yr);
    setState({ year: yr }, "bars");
    update(yr);
  });

  subscribe((p, src) => {
    if ("year" in p && src !== "bars") {
      slider.property("value", years.indexOf(state.year));
      yearLabel.text(state.year);
      update(state.year);
    }
    if ("genres" in p || "hover" in p) highlight();
  });

  return { update };
}
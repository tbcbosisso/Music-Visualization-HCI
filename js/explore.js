// js/explore.js  (Explore page: the dataset, and how to manipulate it)
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { initStore, store, state, subscribe, setState, summarize } from "./data.js";
import { initChrome, mountGenreChips, showError } from "./ui.js";

const METRICS = {
  artists:   { label: "Artists",        f: s => s.artists,   fmt: d3.format(",") },
  artistHot: { label: "Artist hotness", f: s => s.artistHot, fmt: d3.format(".3f") },
  songHot:   { label: "Song hotness",   f: s => s.songHot,   fmt: d3.format(".3f") },
  songs:     { label: "Songs",          f: s => s.songs,     fmt: d3.format(",") }
};

const COLS = [
  { key: "genre",            label: "Genre" },
  { key: "year",             label: "Year",           num: true, fmt: d3.format("d") },
  { key: "artistCount",      label: "Artists",        num: true, fmt: d3.format(",") },
  { key: "avgArtistHotness", label: "Artist hotness", num: true, fmt: d3.format(".3f"), heat: true },
  { key: "avgSongHotness",   label: "Song hotness",   num: true, fmt: d3.format(".3f"), heat: true },
  { key: "songCount",        label: "Songs",          num: true, fmt: d3.format(",") }
];

const ui = { metric: "artists", from: 0, to: 0, sortKey: "year", sortDir: 1 };

(async function main() {
  try {
    await initStore();
    initChrome();
    mountGenreChips("#tuner");
    ui.from = store.extent[0];
    ui.to = store.extent[1];

    renderStats();
    setupFilters();
    const renderLens = makeLens();
    const renderTable = makeTable();
    const renderAll = () => { renderLens(); renderTable(); };

    d3.select("#metric").on("change", e => { ui.metric = e.target.value; renderAll(); });
    d3.select("#yr-from").on("change", e => { ui.from = +e.target.value; if (ui.to < ui.from) ui.to = ui.from; syncRange(); renderAll(); });
    d3.select("#yr-to").on("change", e => { ui.to = +e.target.value; if (ui.from > ui.to) ui.from = ui.to; syncRange(); renderAll(); });
    d3.select("#reset").on("click", () => {
      Object.assign(ui, { metric: "artists", from: store.extent[0], to: store.extent[1], sortKey: "year", sortDir: 1 });
      d3.select("#metric").property("value", ui.metric);
      syncRange();
      setState({ genres: store.genres }, "explore");
      renderAll();
    });
    d3.select("#download").on("click", downloadCsv);
    subscribe(p => { if ("genres" in p) renderAll(); });

    renderAll();
  } catch (err) {
    showError(err);
  }
})();

const filtered = () => store.data.filter(d => state.genres.has(d.genre) && d.year >= ui.from && d.year <= ui.to);

function renderStats() {
  const { data, genres, extent } = store;
  const items = [
    [data.length, "genre-years"],
    [genres.length, "genres"],
    [`${extent[0]}–${extent[1]}`, "years covered"],
    [d3.sum(data, d => d.songCount).toLocaleString(), "songs counted"]
  ];
  d3.select("#stats").selectAll(".stat").data(items).join("div").attr("class", "stat")
    .html(d => `<strong>${d[0]}</strong><span>${d[1]}</span>`);
}

function setupFilters() {
  const metric = d3.select("#metric");
  metric.selectAll("option").data(Object.entries(METRICS)).join("option")
    .attr("value", d => d[0]).text(d => d[1].label);
  metric.property("value", ui.metric);
  ["#yr-from", "#yr-to"].forEach(id =>
    d3.select(id).selectAll("option").data(store.years).join("option").attr("value", d => d).text(d => d));
  syncRange();
}

function syncRange() {
  d3.select("#yr-from").property("value", ui.from);
  d3.select("#yr-to").property("value", ui.to);
}

/* ---------- Lens: same data, different metric, different winner ---------- */
function makeLens() {
  const el = d3.select("#lens");
  const w0 = el.node().clientWidth, h0 = el.node().clientHeight;
  const m = { top: 10, right: 84, bottom: 10, left: 128 };
  const W = w0 - m.left - m.right, H = h0 - m.top - m.bottom;
  const g = el.append("svg").attr("viewBox", [0, 0, w0, h0]).style("width", "100%").style("height", "100%")
    .append("g").attr("transform", `translate(${m.left},${m.top})`);

  return function render() {
    const M = METRICS[ui.metric];
    const agg = d3.rollups(filtered(), v => summarize(v), d => d.genre).map(([genre, s]) => ({ genre, ...s }));
    const biggest = [...agg].sort((a, b) => b.artists - a.artists)[0];
    agg.forEach(d => { d.value = M.f(d); });
    agg.sort((a, b) => b.value - a.value);
    agg.forEach((d, i) => { d.rank = i + 1; });

    const n = Math.max(agg.length, 1);
    const y = d3.scaleBand().domain(agg.map(d => d.genre)).range([0, Math.min(H, n * 44)]).padding(0.2);
    const x = d3.scaleLinear().domain([0, d3.max(agg, d => d.value) || 1]).range([0, W]);
    const mid = () => y.bandwidth() / 2;

    const rows = g.selectAll(".lrow").data(agg, d => d.genre).join(
      enter => {
        const e = enter.append("g").attr("class", "lrow").attr("opacity", 0)
          .attr("transform", d => `translate(0,${y(d.genre)})`);
        e.append("rect").attr("class", "lbar").attr("rx", 4).attr("width", 0);
        e.append("text").attr("class", "lname").attr("text-anchor", "end").attr("x", -10);
        e.append("text").attr("class", "lrank").attr("x", -m.left).attr("fill", "#8a839c");
        e.append("text").attr("class", "lval").attr("x", 8);
        return e;
      },
      update => update,
      exit => exit.transition().duration(250).attr("opacity", 0).remove()
    );

    rows.transition().duration(600).attr("opacity", 1).attr("transform", d => `translate(0,${y(d.genre)})`);
    rows.select(".lbar").attr("height", y.bandwidth()).attr("fill", d => store.color(d.genre))
      .transition().duration(600).attr("width", d => x(d.value));
    rows.select(".lname").attr("y", mid()).attr("dy", "0.35em").attr("font-size", 13).attr("fill", "#1c1930").text(d => d.genre);
    rows.select(".lrank").attr("y", mid()).attr("dy", "0.35em").attr("font-size", 11).text(d => `#${d.rank}`);
    rows.select(".lval").attr("y", mid()).attr("dy", "0.35em").attr("font-size", 12).attr("fill", "#3a3552")
      .text(d => M.fmt(d.value))
      .transition().duration(600).attr("x", d => x(d.value) + 8);

    let note = "No rows in this selection.";
    if (biggest) {
      const bigRank = agg.findIndex(d => d.genre === biggest.genre) + 1;
      note = ui.metric === "artists" ? `${biggest.genre} leads by artists.`
        : bigRank > 1 ? `${biggest.genre} leads by artists, but ranks #${bigRank} by ${M.label.toLowerCase()}.`
        : `${biggest.genre} leads here too.`;
    }
    d3.select("#lens-note").text(note);
  };
}

/* ---------- Table: sort, filter, export ---------- */
function makeTable() {
  const heat = {};
  ["avgArtistHotness", "avgSongHotness"].forEach(k => {
    const [lo, hi] = d3.extent(store.data, d => d[k]);
    heat[k] = d3.scaleSequential().domain([hi, lo]).interpolator(d3.interpolateRdBu);
  });
  const fill = (k, v) => d3.color(heat[k](v)).copy({ opacity: 0.4 }).formatRgb();

  const thead = d3.select("#data-table thead").append("tr");
  const tbody = d3.select("#data-table tbody");

  thead.selectAll("th").data(COLS).join("th")
    .attr("class", c => (c.num ? "num" : null)).attr("tabindex", 0).attr("scope", "col")
    .on("click", (e, c) => sortBy(c.key))
    .on("keydown", (e, c) => { if (e.key === "Enter") sortBy(c.key); });

  function sortBy(key) {
    ui.sortDir = ui.sortKey === key ? -ui.sortDir : 1;
    ui.sortKey = key;
    render();
  }

  function render() {
    const rows = filtered().sort((a, b) => {
      const A = a[ui.sortKey], B = b[ui.sortKey];
      return (typeof A === "string" ? A.localeCompare(B) : A - B) * ui.sortDir || a.year - b.year;
    });

    thead.selectAll("th")
      .attr("aria-sort", c => (c.key === ui.sortKey ? (ui.sortDir > 0 ? "ascending" : "descending") : "none"))
      .text(c => c.label + (c.key === ui.sortKey ? (ui.sortDir > 0 ? " ▲" : " ▼") : ""));

    const tr = tbody.selectAll("tr").data(rows, d => `${d.genre}|${d.year}`).join("tr").order();
    tr.selectAll("td").data(d => COLS.map(c => ({ c, v: d[c.key] }))).join("td")
      .attr("class", x => (x.c.num ? "num" : null))
      .html(x => (x.c.key === "genre"
        ? `<i class="dot" style="background:${store.color(x.v)}"></i>${x.v}`
        : x.c.fmt(x.v)))
      .style("background", x => (x.c.heat ? fill(x.c.key, x.v) : null));

    d3.select("#row-count").text(`Showing ${rows.length} of ${store.data.length} rows`);
  }
  return render;
}

function downloadCsv() {
  const cols = ["genre", "year", "artist_count", "avg_artist_hotness", "avg_song_hotness", "song_count"];
  const rows = filtered().sort((a, b) => a.genre.localeCompare(b.genre) || a.year - b.year);
  const csv = [cols.join(",")].concat(rows.map(d =>
    [d.genre, d.year, d.artistCount, d.avgArtistHotness, d.avgSongHotness, d.songCount].join(","))).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "music-filtered.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
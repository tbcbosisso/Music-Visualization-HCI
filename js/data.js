// js/data.js  -  the ONE data store shared by every page and every chart.
// Loads music.csv once, owns the shared state (genre filter, year, hover, duet picks),
// and tells every chart when something changes, so all visualizations stay linked.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const STORE_KEY = "mge-state-v2";
const listeners = new Set();
let ready = null;

export const store = {
  data: [],            // [{genre, year, artistCount, avgArtistHotness, avgSongHotness, songCount}]
  genres: [],          // biggest overall first (same order in every chart)
  years: [],           // years that actually have data
  extent: [0, 0],
  hasArtists: false,   // true once music.csv contains the top_artists column
  byKey: new Map(),    // "Rock|1995" -> row
  color: () => "#888"  // genre -> color (same in every chart)
};

export const state = {
  genres: new Set(),   // selected genres (default: all)
  year: 1995,          // the "current" year shared by the sliders, bubbles and heatmap
  hover: null,         // genre under the cursor in ANY chart (not persisted)
  A: "Rock",           // Compare page picks
  B: "Hip-Hop"
};

export function initStore() {
  ready ??= d3.csv("data/music.csv").then(raw => {
    const data = raw
      .map(d => ({
        genre: d.genre,
        year: +d.year,
        artistCount: +d.artist_count,
        avgArtistHotness: +d.avg_artist_hotness,
        avgSongHotness: +d.avg_song_hotness,
        songCount: +d.song_count,
        topArtists: parseArtists(d.top_artists)     // [{name, hotness}], may be empty
      }))
      .filter(d => d.genre && Number.isFinite(d.year) && Number.isFinite(d.artistCount));

    store.data = data;
    store.hasArtists = data.some(d => d.topArtists.length > 0);
    store.genres = Array.from(d3.rollup(data, v => d3.sum(v, d => d.artistCount), d => d.genre))
      .sort((a, b) => b[1] - a[1])
      .map(d => d[0]);
    store.years = [...new Set(data.map(d => d.year))].sort(d3.ascending);
    store.extent = d3.extent(store.years);
    store.byKey = new Map(data.map(d => [`${d.genre}|${d.year}`, d]));
    const scale = d3.scaleOrdinal().domain([...store.genres].sort()).range(d3.schemeTableau10);
    store.color = g => scale(g);

    restore();
    return store;
  });
  return ready;
}

export const loadData = () => initStore().then(s => s.data);

export function snapYear(y) {
  return store.years.reduce((best, c) => (Math.abs(c - y) < Math.abs(best - y) ? c : best), store.years[0]);
}

function restore() {
  state.genres = new Set(store.genres);
  state.year = snapYear(1995);
  state.A = store.genres[0];
  state.B = store.genres.includes("Hip-Hop") ? "Hip-Hop" : store.genres[1];
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (!s) return;
    const g = (s.genres || []).filter(x => store.genres.includes(x));
    if (g.length) state.genres = new Set(g);
    if (store.years.includes(s.year)) state.year = s.year;
    if (store.genres.includes(s.A)) state.A = s.A;
    if (store.genres.includes(s.B) && s.B !== s.A) state.B = s.B;
  } catch { /* storage unavailable: fine */ }
}

function persist() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({
      genres: [...state.genres], year: state.year, A: state.A, B: state.B
    }));
  } catch { /* ignore */ }
}

export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

// setState({ year }, "bars")  ->  every subscriber gets (patch, source)
export function setState(patch, source) {
  if (patch.genres) patch.genres = new Set(patch.genres);
  if ("year" in patch) patch.year = snapYear(patch.year);
  Object.assign(state, patch);
  if (!("hover" in patch) || Object.keys(patch).length > 1) persist();
  listeners.forEach(fn => fn(patch, source));
}

// Opacity every chart gives a genre: filtered-out = faint, other-than-hovered = soft.
export function emphasis(genre) {
  if (!state.genres.has(genre)) return 0.12;
  if (state.hover && state.hover !== genre) return 0.3;
  return 1;
}

// Aggregate any set of rows. Hotness is weighted so big years count more.
export function summarize(rows) {
  const artists = d3.sum(rows, d => d.artistCount);
  const songs = d3.sum(rows, d => d.songCount);
  return {
    rows: rows.length,
    artists,
    songs,
    artistHot: artists ? d3.sum(rows, d => d.avgArtistHotness * d.artistCount) / artists : 0,
    songHot: songs ? d3.sum(rows, d => d.avgSongHotness * d.songCount) / songs : 0
  };
}

/* ---------- Artist names (from the top_artists column built by build_music_csv.py) ---------- */
function parseArtists(text) {
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter(a => a && a.name).slice(0, 3) : [];
  } catch { return []; }
}

export const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "Name 0.91, Name 0.84, Name 0.80"  (HTML-safe, ready for .html())
export function artistsHtml(row) {
  if (!row?.topArtists?.length) {
    return store.hasArtists
      ? "names unavailable"
      : "names not in music.csv yet (re-run build_music_csv.py)";
  }
  return row.topArtists.map(a =>
    esc(a.name) + (Number.isFinite(a.hotness) ? ` <span class="hot">${a.hotness.toFixed(2)}</span>` : "")
  ).join(", ");
}
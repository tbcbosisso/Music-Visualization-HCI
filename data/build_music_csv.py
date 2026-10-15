#!/usr/bin/env python3
"""
build_music_csv.py  -  turn the raw music.xlsx into data/music.csv

Same six steps as before, plus ONE new column:

    genre, year, artist_count, avg_artist_hotness, avg_song_hotness, song_count, top_artists

`top_artists` holds the 3 hottest artists of that genre-year as JSON, e.g.
    [{"name":"Kanye West","hotness":0.912}, {"name":"...","hotness":0.8}, ...]
The website reads it to show artist names in the heatmap and the last bar chart.

Usage (run it from ANY folder; it finds the project by looking for index.html):
    python build_music_csv.py
    python build_music_csv.py --src C:\\path\\to\\music.xlsx
It looks for music.xlsx in the current folder, next to this script, in the project folder
and in project/data, and always writes project/data/music.csv.

Safety: if data/music.csv already exists it is copied to data/music.backup.csv first,
and the new file is compared with it so you can see whether the numbers still match.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import pandas as pd

SHEET = "music"
YEAR_MIN, YEAR_MAX = 1960, 2010
MIN_ARTISTS = 3          # genre-years with fewer unique artists are dropped
TOP_N = 3                # artists listed per genre-year

# Raw column names. The first one found in your file wins.
CANDIDATES = {
    "artist":     ["artist.name", "artist_name", "artist", "artistname", "Artist"],
    "genre":      ["artist.terms", "genre", "artist_genre", "Genre"],
    "year":       ["song.year", "song_year", "year", "Year"],
    "artist_hot": ["artist.hotttnesss", "artist_hotness", "artist_hotttnesss", "artist_hottness"],
    "song_hot":   ["song.hotttnesss", "song_hotness", "song_hotttnesss", "song_hottness"],
}

# Step 4: messy genre strings -> one clean family.
# Order matters: the first family with a matching keyword wins.
# >>> If your old script had its own genre mapping, paste it into canonical_genre() instead. <<<
GENRE_KEYWORDS = [
    ("Hip-Hop",    ["hip hop", "hip-hop", "hiphop", "rap", "gangsta", "trap"]),
    ("Metal",      ["metal", "grindcore", "deathcore", "thrash"]),
    ("Electronic", ["electro", "techno", "house", "trance", "dubstep", "drum and bass",
                    "dnb", "ambient", "edm", "synth", "idm"]),
    ("Country",    ["country", "bluegrass", "honky"]),
    ("Jazz",       ["jazz", "bebop", "swing", "bossa"]),
    ("Blues",      ["blues"]),
    ("Folk",       ["folk", "singer-songwriter", "acoustic"]),
    ("Soul/R&B",   ["soul", "r&b", "rnb", "motown", "funk", "rhythm and blues"]),
    ("Pop",        ["pop"]),
    ("Rock",       ["rock", "punk", "grunge", "indie", "alternative", "emo",
                    "hardcore", "new wave", "psychedelic"]),
]


def canonical_genre(raw):
    if pd.isna(raw):
        return None
    s = str(raw).lower()
    for family, words in GENRE_KEYWORDS:
        if any(w in s for w in words):
            return family
    return None


def pick_columns(df):
    found = {}
    for key, options in CANDIDATES.items():
        match = next((c for c in options if c in df.columns), None)
        if match is None:
            sys.exit(f"Could not find a '{key}' column. Tried {options}.\n"
                     f"Columns in your file: {list(df.columns)}\n"
                     f"Add the right name to CANDIDATES at the top of this script.")
        found[key] = match
    return found


def load_raw(path):
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xlsm", ".xls"):
        return pd.read_excel(path, sheet_name=SHEET)
    return pd.read_csv(path)


def build(raw):
    cols = pick_columns(raw)
    df = pd.DataFrame({
        "artist":     raw[cols["artist"]].astype("string").str.strip(),
        "genre_raw":  raw[cols["genre"]],
        "year":       pd.to_numeric(raw[cols["year"]], errors="coerce"),
        "artist_hot": pd.to_numeric(raw[cols["artist_hot"]], errors="coerce"),
        "song_hot":   pd.to_numeric(raw[cols["song_hot"]], errors="coerce"),
    })

    # Steps 2-3: drop year 0 and sentinel hotness (< 0), keep 1960-2010
    df = df.dropna(subset=["year", "artist_hot", "song_hot"])
    df = df[(df["year"] != 0) & (df["artist_hot"] >= 0) & (df["song_hot"] >= 0)]
    df = df[(df["year"] >= YEAR_MIN) & (df["year"] <= YEAR_MAX)].copy()
    df["year"] = df["year"].astype(int)

    # Step 4: canonical genres
    df["genre"] = df["genre_raw"].map(canonical_genre)
    df = df.dropna(subset=["genre"])

    # Step 5: one row per genre-year
    rows = []
    for (genre, year), g in df.groupby(["genre", "year"]):
        artists = g["artist"].dropna()
        artist_count = artists.nunique()
        if artist_count < MIN_ARTISTS:          # Step 6
            continue

        # NEW: the hottest artists of this genre-year (hotness averaged per artist)
        per_artist = (g.dropna(subset=["artist"])
                       .groupby("artist", as_index=False)["artist_hot"].mean())
        per_artist = per_artist[per_artist["artist"] != ""]
        top = per_artist.sort_values(["artist_hot", "artist"], ascending=[False, True]).head(TOP_N)
        top_json = json.dumps(
            [{"name": str(r.artist), "hotness": round(float(r.artist_hot), 3)} for r in top.itertuples()],
            ensure_ascii=False,
        )

        rows.append({
            "genre": genre,
            "year": year,
            "artist_count": int(artist_count),
            "avg_artist_hotness": round(float(g["artist_hot"].mean()), 4),
            "avg_song_hotness": round(float(g["song_hot"].mean()), 4),
            "song_count": int(len(g)),
            "top_artists": top_json,
        })

    return pd.DataFrame(rows).sort_values(["genre", "year"]).reset_index(drop=True)


def compare_with_old(new, old_path):
    """Tell the user whether the rebuilt numbers match the CSV they had before."""
    old = pd.read_csv(old_path)
    keys = ["genre", "year"]
    both = old.merge(new, on=keys, suffixes=("_old", "_new"))
    same = (
        (both["artist_count_old"] == both["artist_count_new"])
        & ((both["avg_artist_hotness_old"] - both["avg_artist_hotness_new"]).abs() < 1e-3)
        & ((both["song_count_old"] == both["song_count_new"]))
    ).sum()
    print(f"\nCompared with your previous CSV: {len(old)} old rows, {len(new)} new rows, "
          f"{len(both)} genre-years in both, {same} identical.")
    if same < len(old):
        print("Some numbers differ. Most likely cause: the genre mapping (canonical_genre) differs "
              "from your old script.\nPaste your old mapping into canonical_genre() and run again. "
              "Your previous file is kept as data/music.backup.csv.")


def find_root():
    """The project folder = the nearest folder (from this script upward) that holds index.html."""
    here = Path(__file__).resolve().parent
    for p in [here, *here.parents]:
        if (p / "index.html").exists():
            return p
    return here


def find_source(root, given):
    if given:
        return Path(given)
    places = [Path.cwd(), Path(__file__).resolve().parent, root, root / "data"]
    for place in places:
        if (place / "music.xlsx").exists():
            return place / "music.xlsx"
    sys.exit("Could not find music.xlsx. Looked in:\n  " + "\n  ".join(str(p) for p in places) +
             "\nPass it explicitly:  python build_music_csv.py --src path\\to\\music.xlsx")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=None, help="path to music.xlsx (auto-detected if omitted)")
    ap.add_argument("--out", default=None, help="output CSV (default: <project>/data/music.csv)")
    args = ap.parse_args()

    root = find_root()
    src = find_source(root, args.src)
    out = Path(args.out) if args.out else root / "data" / "music.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"Reading  {src}\nWriting  {out}")

    old_path = None
    if out.exists():
        old_path = out.with_name("music.backup.csv")
        shutil.copyfile(out, old_path)

    new = build(load_raw(src))
    new.to_csv(out, index=False)

    named = (new["top_artists"] != "[]").sum()
    print(f"Wrote {out}: {len(new)} rows, {new['genre'].nunique()} genres, "
          f"{new['year'].min()}-{new['year'].max()}, top artists on {named} rows.")

    if old_path is not None:
        try:
            compare_with_old(new, old_path)
        except Exception as err:   # comparison is a courtesy, never a failure
            print("(Could not compare with the old CSV:", err, ")")


if __name__ == "__main__":
    main()
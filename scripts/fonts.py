#!/usr/bin/env python3
"""Builds the bundled code fonts (ganymede-ui#354): public/fonts/.

Fetches each font from its upstream release, checks it against the
SHA-256 below, writes WOFF2 files, the fonts' licences, and
`public/fonts/catalog.json`, which the page (src/lib/code-font.ts) and
the Apple app (apple/Sources/Ganymede/CodeFont.swift) both read.

Needs fontTools and Brotli: `pip install fonttools brotli`. Run from the
repository root: `python3 scripts/fonts.py`. The output is committed, so
builds don't need the network or Python.

Every font here is under the SIL Open Font License 1.1, which allows
bundling with software; its text ships beside the fonts.
"""

import hashlib
import io
import json
import os
import sys
import tarfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

OUT = Path("public/fonts")
JSDELIVR = "https://cdn.jsdelivr.net/"
NPM = "https://registry.npmjs.org/"

# Latin, Latin-1, general punctuation, arrows, maths, box drawing and
# blocks: what code and terminals show. Only Iosevka, whose full files
# are about 1 MB each, is cut down to this.
CODE_UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2200-22FF,U+2300-23FF,"
    "U+2500-259F,U+25A0-25FF,U+FEFF,U+FFFD"
)

# Iosevka's stylistic sets each copy another font's shapes; the font
# doesn't name them (Iosevka's docs, "Stylistic Sets").
IOSEVKA_SETS = {
    "ss01": "Andale Mono style",
    "ss02": "Anonymous Pro style",
    "ss03": "Consolas style",
    "ss04": "Menlo style",
    "ss05": "Fira Mono style",
    "ss06": "Liberation Mono style",
    "ss07": "Monaco style",
    "ss08": "Pragmata Pro style",
    "ss09": "Source Code Pro style",
    "ss10": "Envy Code R style",
    "ss11": "X Window style",
    "ss12": "Ubuntu Mono style",
    "ss13": "Lucida style",
    "ss14": "JetBrains Mono style",
    "ss15": "IBM Plex Mono style",
    "ss16": "PT Mono style",
    "ss17": "Recursive Mono style",
    "ss18": "Input Mono style",
    "ss20": "Curly style",
}

# Fira Code's sets and variants that change operators rather than
# letters (Fira Code's README, "Character variants").
FIRA_CODE = {
    "ss02": "<= >=",
    "ss07": "=~ !~",
    "ss08": "== === != !==",
    "ss09": ">>= <<= ||= |=",
    "ss10": "Fl Tl fi fj fl ft",
    "cv19": "<=",
    "cv20": "<=",
    "cv21": "=<",
    "cv22": "=<",
    "cv23": ">=",
    "cv24": "/=",
}

CASCADIA_CODE = {
    "ss02": "Alternate operators",
    "ss19": "Slashed zero (alternate)",
    "ss20": "Control pictures",
}

# Each font's styles (#565): a few named sets of its features, in place
# of one switch per feature, checked by eye against the font. Every font
# also has its standard look, with none of them. Fira Code's default zero
# is slashed and JetBrains Mono's and Cascadia Code's dotted, so `zero`
# swaps those.
STYLES = {
    "jetbrains-mono": [
        {"id": "slashed-zero", "name": "Slashed zero", "features": ["zero"]},
        {"id": "classic", "name": "Classic", "features": ["ss01"]},
        {"id": "closed", "name": "Closed", "features": ["ss02"]},
    ],
    "fira-code": [
        {"id": "dotted-zero", "name": "Dotted zero", "features": ["zero"]},
        {"id": "alternate-letters", "name": "Alternate a, r, & and @",
         "features": ["cv01", "ss01", "ss03", "ss05"]},
    ],
    "cascadia-code": [
        {"id": "slashed-zero", "name": "Slashed zero", "features": ["zero"]},
    ],
    "iosevka": [
        {"id": "menlo", "name": "Menlo style", "features": ["ss04"]},
        {"id": "pragmata-pro", "name": "Pragmata Pro style", "features": ["ss08"]},
        {"id": "source-code-pro", "name": "Source Code Pro style", "features": ["ss09"]},
        {"id": "jetbrains-mono", "name": "JetBrains Mono style", "features": ["ss14"]},
    ],
}

# Monaspace keeps its code ligatures in stylistic sets ss01-ss10 (its
# README, "Coding ligatures"), and `calt` is its texture healing: the
# Ligatures switch turns the sets on rather than `calt` off.
MONASPACE_LIGATURES = [f"ss{i:02d}" for i in range(1, 11)]

MONASPACE = ["Neon", "Argon", "Xenon", "Radon", "Krypton"]
MONASPACE_LICENSE = JSDELIVR + "gh/githubnext/monaspace@v1.200/LICENSE"

# Each font: its files as (url, member of a tarball or None, style,
# weight range, whether to cut it to CODE_UNICODES), and its licence as
# (url, member).
FONTS = [
    {
        "id": "jetbrains-mono",
        "name": "JetBrains Mono",
        "files": [
            (JSDELIVR + "gh/JetBrains/JetBrainsMono@v2.304/fonts/variable/JetBrainsMono%5Bwght%5D.ttf",
             None, "normal", "100 800", False),
            (JSDELIVR + "gh/JetBrains/JetBrainsMono@v2.304/fonts/variable/JetBrainsMono-Italic%5Bwght%5D.ttf",
             None, "italic", "100 800", False),
        ],
        "license": (JSDELIVR + "gh/JetBrains/JetBrainsMono@v2.304/OFL.txt", None),
        "source": "JetBrains Mono 2.304",
    },
    {
        "id": "fira-code",
        "name": "Fira Code",
        "files": [
            (NPM + "firacode/-/firacode-6.2.0.tgz",
             "package/distr/variable_ttf/FiraCode-VF.ttf", "normal", "300 700", False),
        ],
        "license": (NPM + "firacode/-/firacode-6.2.0.tgz", "package/LICENSE"),
        "source": "Fira Code 6.2",
    },
    {
        "id": "cascadia-code",
        "name": "Cascadia Code",
        "files": [
            (JSDELIVR + "gh/google/fonts@main/ofl/cascadiacode/CascadiaCode%5Bwght%5D.ttf",
             None, "normal", "200 700", False),
        ],
        "license": (JSDELIVR + "gh/google/fonts@main/ofl/cascadiacode/OFL.txt", None),
        "source": "Cascadia Code, Google Fonts build",
    },
    *[
        {
            "id": f"monaspace-{x.lower()}",
            "name": f"Monaspace {x}",
            "files": [
                (JSDELIVR + f"gh/githubnext/monaspace@v1.200/fonts/variable/Monaspace{x}VarVF%5Bwght,wdth,slnt%5D.ttf",
                 None, "normal", "200 800", False),
            ],
            "license": (MONASPACE_LICENSE, None),
            "source": "Monaspace 1.200",
        }
        for x in MONASPACE
    ],
    {
        "id": "iosevka",
        "name": "Iosevka",
        "files": [
            (NPM + "@fontsource/iosevka/-/iosevka-5.3.0.tgz",
             "package/files/iosevka-latin-400-normal.woff2", "normal", "400", True),
            (NPM + "@fontsource/iosevka/-/iosevka-5.3.0.tgz",
             "package/files/iosevka-latin-700-normal.woff2", "normal", "700", True),
            (NPM + "@fontsource/iosevka/-/iosevka-5.3.0.tgz",
             "package/files/iosevka-latin-400-italic.woff2", "italic", "400", True),
        ],
        "license": (NPM + "@fontsource/iosevka/-/iosevka-5.3.0.tgz", "package/LICENSE"),
        "source": "Iosevka (Fontsource 5.3.0), Latin subset",
    },
]

# What each download must hash to, so a changed upstream file fails the
# build instead of slipping in. `--update-hashes` prints new values.
HASHES_FILE = Path("scripts/fonts.sha256.json")

_cache: dict[str, bytes] = {}


def fetch(url: str) -> bytes:
    if url not in _cache:
        req = urllib.request.Request(url, headers={"User-Agent": "ganymede-ui fonts.py"})
        with urllib.request.urlopen(req) as r:
            _cache[url] = r.read()
    return _cache[url]


def checked(url: str, hashes: dict, update: bool) -> bytes:
    data = fetch(url)
    digest = hashlib.sha256(data).hexdigest()
    if update:
        hashes[url] = digest
    elif hashes.get(url) != digest:
        sys.exit(f"{url}: sha256 {digest}, expected {hashes.get(url)}")
    return data


def member(data: bytes, name: str | None) -> bytes:
    if name is None:
        return data
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        f = tar.extractfile(name)
        assert f, name
        return f.read()


def feature_tags(font: TTFont) -> list[str]:
    if "GSUB" not in font:
        return []
    tags = {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord}
    return sorted(t for t in tags if t[:2] in ("ss", "cv") and t[2:].isdigit() or t == "zero")


def lookup_inputs(gsub, index: int, seen: set) -> set[str]:
    """The glyphs a lookup changes, following contextual lookups."""
    if index in seen:
        return set()
    seen.add(index)
    out: set[str] = set()
    lookup = gsub.LookupList.Lookup[index]
    for st in lookup.SubTable:
        if lookup.LookupType == 7:
            st = st.ExtSubTable
        kind = st.LookupType if hasattr(st, "LookupType") else lookup.LookupType
        if kind in (1, 3):
            out |= set((st.mapping if kind == 1 else st.alternates).keys())
        elif kind == 4:
            for first, ligs in st.ligatures.items():
                out.add(first)
                for lig in ligs:
                    out |= set(lig.Component)
        elif kind in (5, 6):
            records = []
            for attr in ("SubstLookupRecord",):
                records += getattr(st, attr, None) or []
            # Each rule set's list, as fontTools names it.
            rule_lists = {
                "ChainSubRuleSet": "ChainSubRule",
                "ChainSubClassSet": "ChainSubClassRule",
                "SubRuleSet": "SubRule",
                "SubClassSet": "SubClassRule",
            }
            for set_attr, rule_attr in rule_lists.items():
                for rs in getattr(st, set_attr, None) or []:
                    if rs is None:
                        continue
                    for rule in getattr(rs, rule_attr, None) or []:
                        records += rule.SubstLookupRecord or []
            for rec in records:
                out |= lookup_inputs(gsub, rec.LookupListIndex, seen)
    return out


def label(font: TTFont, tag: str, font_id: str) -> str:
    gsub = font["GSUB"].table
    name = font["name"]
    known = {"iosevka": IOSEVKA_SETS, "fira-code": FIRA_CODE, "cascadia-code": CASCADIA_CODE}
    if tag in known.get(font_id, {}):
        return known[font_id][tag]
    glyphs: set[str] = set()
    for rec in gsub.FeatureList.FeatureRecord:
        if rec.FeatureTag != tag:
            continue
        params = rec.Feature.FeatureParams
        for attr in ("UINameID", "FeatUILabelNameID"):
            nid = getattr(params, attr, None) if params else None
            if nid:
                text = name.getDebugName(nid)
                if text:
                    # Monaspace prefixes its names with the tag.
                    return text.split(": ", 1)[-1]
        for i in rec.Feature.LookupListIndex:
            glyphs |= lookup_inputs(gsub, i, set())
    cmap = {g: chr(c) for c, g in sorted(font.getBestCmap().items(), reverse=True)}

    def text(glyph: str) -> str | None:
        """A glyph's characters: its own, or for an unencoded glyph such
        as `greater_equal.alt`, its named parts' (`>=`)."""
        if glyph in cmap:
            return cmap[glyph]
        parts = glyph.split(".", 1)[0].split("_")
        if all(p in cmap for p in parts):
            return "".join(cmap[p] for p in parts)
        return None

    found = {text(g) for g in glyphs}
    chars = sorted({c for c in found if c and c.isprintable() and not c.isspace()},
                   key=lambda c: (not c.isalnum(), c))
    if tag == "zero":
        return "Slashed zero"
    # The ASCII characters say which letter it is; accented copies add
    # nothing.
    ascii_chars = [c for c in chars if c.isascii()]
    return " ".join((ascii_chars or chars)[:6]) if chars else tag


def main() -> None:
    update = "--update-hashes" in sys.argv
    hashes = {} if update or not HASHES_FILE.exists() else json.loads(HASHES_FILE.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "licenses").mkdir(exist_ok=True)
    for old in OUT.glob("*.woff2"):
        old.unlink()
    catalog = []
    for spec in FONTS:
        files = []
        family = None
        features: dict[str, str] = {}
        ligatures = False
        for i, (url, inner, style, weight, cut) in enumerate(spec["files"]):
            font = TTFont(io.BytesIO(member(checked(url, hashes, update), inner)), recalcTimestamp=False)
            if cut:
                opts = subset.Options()
                opts.layout_features = ["*"]
                # Drop Iosevka's per-language ligation sets (upper-case
                # tags): `calt` keeps the default ligatures.
                tags = {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord}
                opts.layout_features = sorted(t for t in tags if not t.isupper())
                opts.name_IDs = ["*"]
                opts.notdef_outline = True
                opts.glyph_names = False
                sub = subset.Subsetter(opts)
                sub.populate(unicodes=subset.parse_unicodes(CODE_UNICODES))
                sub.subset(font)
            names = font["name"]
            family = family or names.getDebugName(16) or names.getDebugName(1)
            tags = {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord} if "GSUB" in font else set()
            ligatures = ligatures or bool(tags & {"calt", "liga", "dlig"})
            if i == 0:
                # Iosevka's variants each have several values; its sets
                # are the useful switches.
                tags = [t for t in feature_tags(font) if spec["id"] != "iosevka" or not t.startswith("cv")]
                for tag in tags:
                    features[tag] = label(font, tag, spec["id"])
            font.flavor = "woff2"
            suffix = ("-italic" if style == "italic" else "") + ("-bold" if weight == "700" else "")
            file = f"{spec['id']}{suffix}.woff2"
            font.save(OUT / file)
            # The page asks for `file?v=<hash>`, so a changed font isn't
            # served from a browser's cache under the old URL.
            digest = hashlib.sha256((OUT / file).read_bytes()).hexdigest()[:12]
            files.append({"file": file, "style": style, "weight": weight, "hash": digest})
        lic_url, lic_member = spec["license"]
        lic = member(checked(lic_url, hashes, update), lic_member)
        (OUT / "licenses" / f"{spec['id']}.txt").write_bytes(lic)
        catalog.append({
            "id": spec["id"],
            "name": spec["name"],
            "family": family,
            "source": spec["source"],
            "files": files,
            "ligatures": ligatures,
            "features": [{"tag": t, "label": features[t]} for t in sorted(features)],
            "styles": STYLES.get(spec["id"], []),
            **({"ligatureFeatures": MONASPACE_LIGATURES} if spec["id"].startswith("monaspace-") else {}),
        })
        for style in STYLES.get(spec["id"], []):
            missing = set(style["features"]) - set(features)
            assert not missing, f"{spec['id']} {style['id']}: no {missing}"
        print(f"{spec['id']}: {family}, {len(files)} file(s), {len(features)} features", file=sys.stderr)
    (OUT / "catalog.json").write_text(json.dumps({"fonts": catalog}, indent=2, ensure_ascii=False) + "\n")
    if update:
        HASHES_FILE.write_text(json.dumps(hashes, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent.parent)
    main()

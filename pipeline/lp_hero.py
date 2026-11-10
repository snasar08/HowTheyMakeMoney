"""The hero of a low-poly Short: a consistent, recognisable cartoon figure (stdlib only: Blender imports it too).

Sam, Nov 9: a famous person should be recognisable WITHOUT being a copy: hairstyle and hair color,
beard or clean-shaven, bald or not, height, and the kind of clothes they are known for in plain
colors. Never a logo, crest, sponsor, number or a real jersey design; never a photoreal face.

Script-level "hero" (every low-poly scene uses it, so the figure is the same person all Short long):
  {"skin": "light|tan|brown|dark" or hex, "hair": "short|buzz|bald|quiff|long|bangs|ponytail|bun|afro|curly|mohawk",
   "hair_color": hex, "beard": "none|stubble|full|goatee|mustache", "beard_color": hex,
   "shirt": hex, "pants": hex, "outfit": "tee|kit|suit|hoodie|dress", "shoes": hex, "socks": hex,
   "extras": ["glasses", "cap", "headband"], "extra_color": hex, "height": 1.0}

The body is the pack's one mesh with a 5-color palette texture (skin, hair, shirt, pants, dark), so
looks are (a) a recolored palette and (b) boxes/cylinders/spheres riding on bones. Accessories are
given in the figure's rest pose, in meters on a 1.75 m person: +x forward, +y up, +-z the sides.
"""
SKIN, HAIR, SHIRT, PANTS = (255, 209, 159), (124, 88, 35), (115, 167, 196), (21, 96, 189)
BASE = "LightSkin"
SKINS = {"light": "ffd19f", "tan": "e0ac7e", "brown": "a8744a", "dark": "6b4a32"}
DEFAULT = dict(skin="light", hair="short", hair_color="3a2a1c", beard="none", shirt="e63946", pants="263247",
               outfit="tee", shoes="f4f4f4")


def rgb(h, default=(128, 128, 128)):
    h = SKINS.get(h, h or "")
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) if len(h) == 6 else default
    except ValueError:
        return default


def _mix(a, b, k):
    return tuple(int(round(x + (y - x) * k)) for x, y in zip(a, b))


def spec(hero):
    s = dict(DEFAULT)
    s.update(hero or {})
    return s


def palette(hero):
    """{pack color: new color} for the body texture."""
    s = spec(hero)
    skin, hair = rgb(s["skin"], SKIN), rgb(s.get("hair_color"), HAIR)
    if s["hair"] == "bald":
        hair = skin
    elif s["hair"] == "buzz":
        hair = _mix(skin, hair, 0.55)
    legs = skin if s["outfit"] in ("kit", "dress") else rgb(s.get("pants"), PANTS)   # shorts/skirt: bare legs
    return {SKIN: skin, HAIR: hair, SHIRT: rgb(s.get("shirt"), SHIRT), PANTS: legs}


def skin_name(hero):
    """Texture name both renderers understand: 'LightSkin#<skin>-<hair>-<shirt>-<pants>' (hex)."""
    p = palette(hero)
    return BASE + "#" + "-".join("%02x%02x%02x" % p[k] for k in (SKIN, HAIR, SHIRT, PANTS))


def recolor_map(name):
    """{pack color: new color} for a '#'-style name, else None."""
    base, _, cols = name.partition("#")
    if not cols:
        return base, None
    parts = cols.split("-")
    return base, {k: rgb(h, k) for k, h in zip((SKIN, HAIR, SHIRT, PANTS), parts)}


def accessories(hero):
    """[(bone, mesh, (x, y, z), (sx, sy, sz), (r, g, b) 0..1)] in rest-pose meters. Boxes sit on their
    base (y = bottom), spheres are centered, cylinders stand on their base with radius sx."""
    s = spec(hero)
    c = lambda h, d=(128, 128, 128): tuple(v / 255 for v in rgb(h, d))   # noqa: E731
    skin = tuple(v / 255 for v in rgb(s["skin"], SKIN))
    hair = c(s.get("hair_color"), HAIR)
    out = []
    add = lambda bone, mesh, pos, size, col: out.append((bone, mesh, pos, size, col))   # noqa: E731
    style = s["hair"]
    if style == "quiff":                      # short, brushed up at the front
        add("Head", "box", (0.0, 1.7, 0), (0.2, 0.055, 0.17), hair)
        add("Head", "box", (0.075, 1.705, 0), (0.08, 0.075, 0.15), hair)
    elif style in ("long", "bangs"):          # past the shoulders
        add("Head", "box", (-0.135, 1.3, 0), (0.07, 0.46, 0.25), hair)
        for z in (-0.122, 0.122):
            add("Head", "box", (-0.03, 1.36, z), (0.17, 0.34, 0.035), hair)
        add("Head", "box", (-0.01, 1.7, 0), (0.25, 0.06, 0.235), hair)
        if style == "bangs":
            add("Head", "box", (0.115, 1.665, 0), (0.035, 0.075, 0.21), hair)
    elif style == "ponytail":
        add("Head", "sphere", (-0.17, 1.67, 0), (0.05, 0.05, 0.05), hair)
        add("Head", "box", (-0.21, 1.4, 0), (0.05, 0.26, 0.07), hair)
    elif style == "bun":
        add("Head", "sphere", (-0.1, 1.79, 0), (0.07, 0.07, 0.07), hair)
    elif style in ("afro", "curly"):
        r = 0.185 if style == "afro" else 0.15
        add("Head", "sphere", (-0.045, 1.72, 0), (r, r * 0.82, r * 0.95), hair)
    elif style == "mohawk":
        add("Head", "box", (-0.02, 1.73, 0), (0.24, 0.09, 0.045), hair)
    beard = s.get("beard", "none")
    bc = c(s.get("beard_color"), tuple(int(v * 255) for v in hair))
    if beard == "stubble":
        bc = tuple(a * 0.62 + b * 0.38 for a, b in zip(skin, bc))
    if beard in ("full", "stubble"):          # along the jaw and chin, mouth left clear
        add("Head", "box", (0.094, 1.437, 0), (0.062, 0.058, 0.15), bc)
        for z in (-0.086, 0.086):
            add("Head", "box", (0.04, 1.44, z), (0.125, 0.078, 0.022), bc)
            add("Head", "box", (0.0, 1.5, z * 1.2), (0.05, 0.09, 0.018), bc)
        add("Head", "box", (0.127, 1.512, 0), (0.012, 0.016, 0.075), bc)
    elif beard == "goatee":
        add("Head", "box", (0.105, 1.437, 0), (0.04, 0.058, 0.07), bc)
        add("Head", "box", (0.127, 1.512, 0), (0.012, 0.016, 0.075), bc)
    elif beard == "mustache":
        add("Head", "box", (0.127, 1.512, 0), (0.014, 0.018, 0.085), bc)
    ex, ec = s.get("extras") or [], c(s.get("extra_color"), (30, 30, 34))
    if "glasses" in ex:
        for z in (-0.047, 0.047):
            add("Head", "box", (0.128, 1.595, z), (0.012, 0.045, 0.07), ec)
        add("Head", "box", (0.128, 1.612, 0), (0.01, 0.012, 0.03), ec)
    if "cap" in ex:
        add("Head", "sphere", (-0.008, 1.668, 0), (0.148, 0.098, 0.127), ec)
        add("Head", "box", (0.19, 1.66, 0), (0.13, 0.016, 0.17), ec)
    if "headband" in ex:
        add("Head", "cyl", (-0.008, 1.648, 0), (0.142, 0.036, 0.122), ec)
    shoes = c(s.get("shoes"), (244, 244, 244))
    for side, z in (("Left", -0.115), ("Right", 0.115)):
        add(side + "Foot", "box", (0.056, -0.008, z * 0.99), (0.29, 0.078, 0.12), shoes)
    outfit, shirt, pants = s["outfit"], c(s.get("shirt"), SHIRT), c(s.get("pants"), PANTS)
    if outfit in ("kit", "dress"):
        sock = c(s.get("socks"), (245, 245, 245))
        for side, z in (("Left", -0.1), ("Right", 0.1)):
            if s.get("socks") != "none":
                add(side + "Leg", "cyl", (-0.018, 0.05, z * 1.08), (0.062, 0.2 if outfit == "kit" else 0.34, 0.064), sock)
    if outfit == "kit":                       # shorts over bare legs
        for side, z in (("Left", -0.088), ("Right", 0.088)):
            add(side + "UpLeg", "cyl", (-0.015, 0.5, z), (0.108, 0.34, 0.1), pants)
        add("Hips", "box", (-0.012, 0.76, 0), (0.25, 0.17, 0.37), pants)
    elif outfit == "dress":                   # knee-length skirt in the dress color
        add("Hips", "cyl", (-0.012, 0.6, 0), (0.185, 0.3, 0.215), shirt)
    elif outfit == "suit":                    # dark jacket: white shirt V and a tie
        add("Spine2", "box", (0.1, 1.2, 0), (0.022, 0.25, 0.085), (0.96, 0.96, 0.96))
        add("Spine2", "box", (0.116, 1.2, 0), (0.012, 0.21, 0.034), c(s.get("tie"), (200, 30, 40)))
    elif outfit == "hoodie":
        add("Spine2", "box", (-0.155, 1.33, 0), (0.07, 0.17, 0.26), shirt)
        add("Spine2", "box", (0.1, 1.0, 0), (0.02, 0.1, 0.2), tuple(v * 0.85 for v in shirt))
    return out


def auto(slug):
    """A stable everyman look for a Short with no named hero (what-if format): the same figure all
    Short long, a different one from Short to Short, always in a bright top that stands out of a crowd."""
    import zlib
    h = zlib.crc32((slug or "").encode())
    shirts = ("e63946", "f4a261", "2a9d8f", "ffca3a", "8e5bd0", "ff6b9d", "3a86ff")
    hairs = (("short", "3a2a1c"), ("quiff", "1c1612"), ("curly", "2a1a10"), ("ponytail", "5a3a20"),
             ("short", "c9a45a"), ("buzz", "141210"), ("bun", "3a2a1c"))
    hair, hair_color = hairs[(h >> 3) % len(hairs)]
    return dict(skin=("light", "tan", "brown", "dark")[(h >> 7) % 4], hair=hair, hair_color=hair_color,
                beard="stubble" if (h >> 11) % 5 == 0 and hair not in ("ponytail", "bun") else "none",
                outfit="hoodie" if (h >> 13) % 3 == 0 else "tee", shirt=shirts[h % len(shirts)],
                pants=("263247", "3a3a3a", "2c4a3a")[(h >> 17) % 3], shoes="f4f4f4")


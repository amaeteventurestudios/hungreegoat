"""Renders the on-video lower-third overlay for a station (artwork + title + artist +
HUNGREE Goat branding). Output is an RGBA PNG of OVERLAY_W x OVERLAY_H that the stream
supervisor converts to yuva420p and feeds to FFmpeg. Atomic replace so FFmpeg never
sees a torn file."""
from __future__ import annotations
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import config

FONTS = config.STATIC_DIR / "assets" / "fonts"
GOLD = (245, 196, 84)
CREAM = (250, 246, 236)
CYAN = (110, 226, 226)
MUTED = (188, 208, 208)
INK = (4, 18, 22)


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    p = FONTS / name
    try:
        return ImageFont.truetype(str(p), size)
    except Exception:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)


def _fit(draw: ImageDraw.ImageDraw, text: str, font_name: str, size: int, max_w: int, min_size: int = 20):
    while size > min_size:
        f = _font(font_name, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    f = _font(font_name, min_size)
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1]
    return f, text


def overlay_path(sid: str) -> Path:
    return config.RUN_DIR / f"overlay-{sid}.png"


def render(sid: str, title: str, artist: str, subtitle: str = "", artwork: str | None = None,
           kind: str = "music") -> Path:
    W, H = config.OVERLAY_W, config.OVERLAY_H
    st = config.station(sid)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # vertical scrim for legibility
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for y in range(H):
        a = int(215 * (y / H) ** 1.35)
        sd.line([(0, y), (W, y)], fill=(INK[0], INK[1], INK[2], a))
    im.alpha_composite(scrim)
    d = ImageDraw.Draw(im)

    # artwork card
    art_size = 200
    ax, ay = 56, H - art_size - 44
    art_img = None
    for cand in (artwork, str(config.DEFAULT_ARTWORK)):
        if cand and Path(cand).exists():
            try:
                a = Image.open(cand).convert("RGB")
                a = _square(a, art_size)
                art_img = a
                break
            except Exception:
                continue
    if art_img is None:
        art_img = Image.new("RGB", (art_size, art_size), (12, 40, 44))
    # glow + rounded mask
    glow = Image.new("RGBA", (art_size + 40, art_size + 40), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle((12, 12, art_size + 28, art_size + 28), radius=22, fill=(245, 196, 84, 110))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    im.alpha_composite(glow, (ax - 20, ay - 20))
    mask = Image.new("L", (art_size, art_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, art_size - 1, art_size - 1), radius=18, fill=255)
    im.paste(art_img, (ax, ay), mask)
    d.rounded_rectangle((ax, ay, ax + art_size - 1, ay + art_size - 1), radius=18, outline=(245, 196, 84, 200), width=2)

    # text block
    tx = ax + art_size + 34
    max_w = W - tx - 360
    label = "NOW PLAYING" if kind == "music" else ("STATION ID" if kind == "jingle" else "ON AIR")
    d.text((tx, ay + 6), label, font=_font("Montserrat-Bold.ttf", 18), fill=GOLD + (255,))
    ft = _fit(d, title, "Montserrat-ExtraBold.ttf", 48, max_w)
    if isinstance(ft, tuple):
        ft, title = ft
    d.text((tx - 2, ay + 30), title, font=ft, fill=CREAM + (255,))
    fa = _fit(d, artist, "Montserrat-SemiBold.ttf", 28, max_w)
    if isinstance(fa, tuple):
        fa, artist = fa
    d.text((tx, ay + 96), artist, font=fa, fill=CYAN + (255,))
    if subtitle:
        fs = _fit(d, subtitle, "Montserrat-Medium.ttf", 22, max_w)
        if isinstance(fs, tuple):
            fs, subtitle = fs
        d.text((tx, ay + 138), subtitle, font=fs, fill=MUTED + (255,))
    # pill with station name
    pill_f = _font("Montserrat-Bold.ttf", 16)
    pill_t = st["short"].upper() + "  •  24/7"
    pw = int(d.textlength(pill_t, font=pill_f)) + 28
    py = ay + art_size - 34
    d.rounded_rectangle((tx, py, tx + pw, py + 32), radius=16, fill=(12, 60, 60, 190), outline=(110, 226, 226, 160), width=1)
    d.text((tx + 14, py + 7), pill_t, font=pill_f, fill=CYAN + (255,))

    # branding, right side
    bx = W - 60
    wm = _font("Montserrat-ExtraBold.ttf", 34)
    t1 = "HUNGREE GOAT"
    w1 = d.textlength(t1, font=wm)
    d.text((bx - w1, H - 118), t1, font=wm, fill=GOLD + (255,))
    tg = _font("Montserrat-SemiBold.ttf", 15)
    t2 = "M U S I C   F E E D S   D I F F E R E N T"
    w2 = d.textlength(t2, font=tg)
    d.text((bx - w2, H - 76), t2, font=tg, fill=CREAM + (230,))
    sc = _font("GreatVibes-Regular.ttf", 30)
    t3 = "Good Music, Higher Vibes"
    w3 = d.textlength(t3, font=sc)
    d.text((bx - w3, H - 56), t3, font=sc, fill=CYAN + (235,))

    out = overlay_path(sid)
    tmp = out.with_suffix(".tmp.png")
    im.save(tmp, "PNG", compress_level=3)
    tmp.replace(out)
    return out


def _square(img: Image.Image, size: int) -> Image.Image:
    from PIL import ImageOps
    return ImageOps.fit(img, (size, size), method=Image.LANCZOS)


def render_idle(sid: str) -> Path:
    st = config.station(sid)
    return render(sid, st["short"], "HUNGREE Goat", "Music feeds different", None, kind="idle")

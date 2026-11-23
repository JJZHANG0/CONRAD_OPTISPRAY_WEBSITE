from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import math


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "research"
OUT.mkdir(parents=True, exist_ok=True)

BG = "#08110f"
PANEL = "#101d19"
PANEL_ALT = "#12221d"
INK = "#e3eee8"
MUTED = "#9bb2a7"
GRID = "#334941"
CYAN = "#70e5ca"
BLUE = "#58b7ee"
GOLD = "#eab17c"
LIME = "#c3e596"

FONT_DIR = Path(r"C:\Windows\Fonts")


def font(name, size):
    path = FONT_DIR / name
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default()


SANS = lambda size: font("segoeui.ttf", size)
SANS_BOLD = lambda size: font("segoeuib.ttf", size)
MONO = lambda size: font("consola.ttf", size)


def panel_canvas(title, subtitle=""):
    image = Image.new("RGB", (1200, 620), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((14, 14, 1186, 606), 26, fill=PANEL, outline=GRID, width=2)
    draw.text((54, 42), title, font=MONO(28), fill=CYAN)
    if subtitle:
        draw.text((54, 82), subtitle, font=SANS(24), fill=MUTED)
    return image, draw


def arrow(draw, start, end, color=CYAN, width=5, head=17):
    x1, y1 = start
    x2, y2 = end
    draw.line((x1, y1, x2, y2), fill=color, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    a1 = angle + math.radians(150)
    a2 = angle - math.radians(150)
    draw.polygon([
        (x2, y2),
        (x2 + head * math.cos(a1), y2 + head * math.sin(a1)),
        (x2 + head * math.cos(a2), y2 + head * math.sin(a2)),
    ], fill=color)


def dotted_line(draw, points, fill=GOLD, width=4, dash=15, gap=12):
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if not length:
            continue
        ux, uy = dx / length, dy / length
        pos = 0
        while pos < length:
            stop = min(pos + dash, length)
            draw.line((x1 + ux * pos, y1 + uy * pos, x1 + ux * stop, y1 + uy * stop), fill=fill, width=width)
            pos += dash + gap


def drone(draw, x, y, scale=1.0):
    s = scale
    draw.line((x - 95*s, y, x + 95*s, y), fill="#b7c8bf", width=max(3, int(7*s)))
    draw.polygon([(x - 34*s, y - 14*s), (x + 34*s, y - 14*s), (x + 23*s, y + 15*s), (x - 23*s, y + 15*s)], fill="#d9e5df")
    for rx in (x - 93*s, x + 93*s):
        draw.ellipse((rx - 33*s, y - 16*s, rx + 33*s, y + 16*s), outline=CYAN, width=max(2, int(3*s)))
    draw.line((x, y + 16*s, x, y + 49*s), fill=GOLD, width=max(2, int(4*s)))
    draw.ellipse((x - 7*s, y + 43*s, x + 7*s, y + 57*s), fill=GOLD)


def save(image, name):
    image.save(OUT / name, optimize=True)


def make_motion():
    image, d = panel_canvas("01 / DROPLET MOTION", "Gravity and drag set the path from nozzle to landing.")
    d.line((70, 536, 1125, 536), fill="#8fa59a", width=3)
    d.text((80, 550), "LANDING SURFACE", font=MONO(20), fill=MUTED)
    drone(d, 180, 190, .85)
    d.text((104, 265), "RELEASE", font=MONO(20), fill=GOLD)
    arrow(d, (355, 145), (700, 145), BLUE, 5)
    d.text((374, 104), "AMBIENT AIR · EASTWARD", font=MONO(20), fill=BLUE)
    arrow(d, (1070, 205), (1070, 305), INK, 4)
    d.text((975, 168), "GRAVITY", font=MONO(19), fill=INK)

    start = (258, 246)
    tracks = [
        ("FINE", BLUE, 950, 1.55),
        ("MEDIUM", CYAN, 720, 1.32),
        ("COARSE", GOLD, 500, 1.16),
    ]
    for label, color, end_x, power in tracks:
        pts = []
        for n in range(45):
            t = n / 44
            pts.append((start[0] + (end_x - start[0]) * t, start[1] + (536 - start[1]) * (t ** power)))
        d.line(pts, fill=color, width=6, joint="curve")
        d.ellipse((end_x - 8, 528, end_x + 8, 544), fill=color)
        d.text((max(330, end_x - 105), 435), label, font=MONO(18), fill=color)
    d.text((78, 335), "DRAG TOWARD LOCAL AIR VELOCITY", font=MONO(19), fill=MUTED)
    save(image, "droplet-motion.png")


def make_evaporation():
    image, d = panel_canvas("02 / EVAPORATION", "The shrinking drop changes its mass and response to air.")
    d.text((62, 160), "D² LAW", font=MONO(24), fill=GOLD)
    d.text((62, 205), "d²(t) = d₀² − Kt", font=SANS_BOLD(50), fill=INK)
    d.text((64, 268), "K varies with temperature, humidity and airflow.", font=SANS(24), fill=MUTED)

    centers = [(210, 430, 72), (470, 430, 53), (715, 430, 35)]
    for i, (cx, cy, r) in enumerate(centers):
        d.ellipse((cx-r, cy-r, cx+r, cy+r), fill="#4eaec044", outline=CYAN, width=4)
        d.ellipse((cx-7, cy-7, cx+7, cy+7), fill=GOLD)
        if i < len(centers)-1:
            arrow(d, (cx + r + 20, cy), (centers[i+1][0] - centers[i+1][2] - 20, cy), MUTED, 3, 13)
    d.text((112, 520), "WATER", font=MONO(19), fill=CYAN)
    d.text((625, 520), "NONVOLATILE RESIDUE", font=MONO(19), fill=GOLD)

    d.rounded_rectangle((850, 160, 1125, 270), 18, fill=PANEL_ALT, outline=GRID, width=2)
    d.text((878, 185), "TEMPERATURE", font=MONO(19), fill=MUTED)
    d.text((878, 220), "↑ warmer", font=SANS_BOLD(27), fill=GOLD)
    d.rounded_rectangle((850, 305, 1125, 415), 18, fill=PANEL_ALT, outline=GRID, width=2)
    d.text((878, 330), "RELATIVE HUMIDITY", font=MONO(18), fill=MUTED)
    d.text((878, 365), "↓ drier", font=SANS_BOLD(27), fill=GOLD)
    d.text((850, 465), "FASTER WATER LOSS", font=MONO(18), fill=CYAN)
    save(image, "evaporation.png")


def make_downwash():
    image, d = panel_canvas("03 / ROTOR DOWNWASH", "Rotor flow couples with crosswind around the droplets.")
    drone(d, 580, 150, 1.6)
    # Smooth downwash streamlines and outward shear.
    for x, spread in ((360, 85), (490, 115), (650, 115), (800, 85)):
        points = []
        for n in range(28):
            t = n / 27
            y = 220 + t * 310
            xoff = spread * (t**1.25) + 10 * math.sin(t * 5 + x / 110)
            points.append((x + xoff, y))
        d.line(points, fill="#56cbb988", width=4)
        arrow(d, points[-2], points[-1], CYAN, 3, 13)
    for x, endx, color in ((415, 715, BLUE), (565, 830, GOLD), (700, 900, BLUE)):
        pts = []
        for n in range(25):
            t = n/24
            pts.append((x + (endx-x)*t, 245 + 285*(t**1.1)))
        dotted_line(d, pts, color, 4, 9, 9)
        d.ellipse((endx-7, 524, endx+7, 538), fill=color)
    arrow(d, (120, 530), (1045, 530), BLUE, 5)
    d.text((128, 485), "CROSSWIND · WEST TO EAST", font=MONO(20), fill=BLUE)
    d.text((385, 280), "DOWNWARD FLOW", font=MONO(18), fill=CYAN)
    d.text((770, 395), "DROPLET PATH", font=MONO(18), fill=GOLD)
    save(image, "rotor-downwash.png")


def make_route():
    image, d = panel_canvas("04 / WIND-AWARE ROUTING", "Wind moves the landing band downwind.")
    field = [(245, 185), (1000, 185), (1080, 500), (170, 500)]
    d.polygon(field, fill="#14251f", outline="#81968c", width=4)
    # Crop rows and boundary inset.
    for y in range(245, 480, 47):
        d.line((205, y, 1050, y), fill="#34483e", width=2)
    for x in (300, 420, 540, 660, 780, 900):
        d.line((x, 205, x-26, 480), fill="#263b32", width=2)
    # Intended deposition band remains inside the field; wind moves drops east.
    overlay = Image.new("RGBA", image.size, (0,0,0,0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle((650, 238, 745, 446), 28, fill=(112,229,202,75), outline=(112,229,202,205), width=3)
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(image)
    d.line((510, 230, 510, 455), fill=GOLD, width=7)
    d.text((355, 190), "UPWIND RELEASE LINE", font=MONO(18), fill=GOLD)
    arrow(d, (528, 330), (635, 330), BLUE, 5, 18)
    d.text((750, 285), "PREDICTED", font=MONO(17), fill=CYAN)
    d.text((750, 312), "LANDING BAND", font=MONO(17), fill=CYAN)
    arrow(d, (265, 164), (590, 164), BLUE, 5)
    d.text((268, 128), "WIND · WEST TO EAST", font=MONO(19), fill=BLUE)
    # Turn/transfer segment with spray off.
    dotted_line(d, [(905, 232), (955, 455)], GOLD, 4, 13, 10)
    d.text((865, 452), "TURN · SPRAY OFF", font=MONO(16), fill=MUTED)
    d.text((60, 548), "FIELD EDGE", font=MONO(18), fill=MUTED)
    d.text((735, 548), "WIND · HEIGHT · DROPLET SIZE", font=MONO(18), fill=CYAN)
    save(image, "wind-aware-route.png")


def make_measurements():
    image = Image.new("RGB", (1500, 690), BG)
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((14, 14, 1486, 676), 26, fill=PANEL, outline=GRID, width=2)
    d.text((52, 42), "WATER-SENSITIVE PAPER / RECORDED LANDING REACH", font=MONO(28), fill=CYAN)
    left = (70, 130, 720, 610)
    right = (780, 130, 1430, 610)
    for box in (left, right):
        d.rounded_rectangle(box, 18, fill="#0b1713", outline=GRID, width=2)

    def plot(box, title, max_y, y_label):
        x0, y0, x1, y1 = box
        d.text((x0+25, y0+20), title, font=MONO(22), fill=INK)
        pl, pt, pr, pb = x0+90, y0+95, x1-35, y1-75
        for tick in range(4):
            y = pb - (pb-pt) * tick / 3
            val = max_y * tick / 3
            d.line((pl, y, pr, y), fill=GRID, width=1)
            d.text((x0+25, y-13), f"{val:.1f}", font=MONO(17), fill=MUTED)
        d.line((pl, pt, pl, pb), fill=MUTED, width=2)
        d.line((pl, pb, pr, pb), fill=MUTED, width=2)
        d.text((x0+22, pt-35), y_label, font=MONO(16), fill=MUTED)
        d.text((x0+225, pb+20), "RELEASE HEIGHT · m", font=MONO(17), fill=MUTED)
        return pl, pt, pr, pb

    pl, pt, pr, pb = plot(left, "STILL AIR · RADIAL REACH", 1.5, "RADIUS · m")
    still = [(1.5, .60), (1.8, 1.00), (2.0, 1.25), (2.2, 1.35)]
    pts = []
    for h, r in still:
        x = pl + (h-1.4)/(2.3-1.4)*(pr-pl)
        y = pb - r/1.5*(pb-pt)
        pts.append((x,y))
        d.ellipse((x-9,y-9,x+9,y+9), fill=CYAN, outline=INK, width=2)
        d.text((x-35,y-37), f"{r:.2f}", font=MONO(18), fill=CYAN)
    d.line(pts, fill=CYAN, width=4)
    for h in (1.5, 1.8, 2.0, 2.2):
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        d.text((x-22,pb+5), f"{h:.1f}", font=MONO(16), fill=MUTED)

    pl, pt, pr, pb = plot(right, "CROSSWIND · FLIGHT DISTANCE", 7.0, "DISTANCE · m")
    wind = [(1.5,2.25,3.7),(1.8,4.20,2.8),(2.0,6.20,3.6),(2.2,6.00,2.8)]
    for h, distance, speed in wind:
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        y=pb-distance/7.0*(pb-pt)
        d.ellipse((x-10,y-10,x+10,y+10), fill=GOLD, outline=INK, width=2)
        label=f"{distance:.2f} m · {speed:.1f} m/s"
        dx,dy=(15,-27) if h in (1.5,2.0) else (-165,9)
        d.text((x+dx,y+dy),label,font=MONO(16),fill=GOLD)
    for h in (1.5,1.8,2.0,2.2):
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        d.text((x-22,pb+5),f"{h:.1f}",font=MONO(16),fill=MUTED)
    save(image, "measured-landing-distance.png")


def make_measurements_mobile():
    image = Image.new("RGB", (900, 1280), BG)
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((14, 14, 886, 1266), 26, fill=PANEL, outline=GRID, width=2)
    d.text((46, 38), "WATER-SENSITIVE PAPER", font=MONO(27), fill=CYAN)
    d.text((46, 78), "RECORDED LANDING REACH", font=MONO(24), fill=CYAN)

    def plot(top, title, max_y, y_label):
        x0, x1 = 48, 852
        y0, y1 = top, top + 535
        d.rounded_rectangle((x0, y0, x1, y1), 18, fill="#0b1713", outline=GRID, width=2)
        d.text((x0+25, y0+22), title, font=MONO(23), fill=INK)
        pl, pt, pr, pb = x0+100, y0+105, x1-35, y1-95
        for tick in range(4):
            y = pb - (pb-pt)*tick/3
            val = max_y*tick/3
            d.line((pl,y,pr,y),fill=GRID,width=2)
            d.text((x0+26,y-14),f"{val:.1f}",font=MONO(19),fill=MUTED)
        d.line((pl,pt,pl,pb),fill=MUTED,width=2)
        d.line((pl,pb,pr,pb),fill=MUTED,width=2)
        d.text((x0+24,pt-38),y_label,font=MONO(18),fill=MUTED)
        d.text((x0+285,pb+24),"RELEASE HEIGHT · m",font=MONO(19),fill=MUTED)
        return pl,pt,pr,pb

    pl,pt,pr,pb = plot(140,"STILL AIR · RADIAL REACH",1.5,"RADIUS · m")
    still=[(1.5,.60),(1.8,1.00),(2.0,1.25),(2.2,1.35)]
    points=[]
    for h,r in still:
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        y=pb-r/1.5*(pb-pt)
        points.append((x,y))
        d.ellipse((x-11,y-11,x+11,y+11),fill=CYAN,outline=INK,width=2)
        d.text((x-34,y-42),f"{r:.2f}",font=MONO(20),fill=CYAN)
    d.line(points,fill=CYAN,width=5)
    for h in (1.5,1.8,2.0,2.2):
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        d.text((x-24,pb+5),f"{h:.1f}",font=MONO(19),fill=MUTED)

    pl,pt,pr,pb = plot(700,"CROSSWIND · FLIGHT DISTANCE",7.0,"DISTANCE · m")
    wind=[(1.5,2.25,3.7),(1.8,4.20,2.8),(2.0,6.20,3.6),(2.2,6.00,2.8)]
    label_offsets=[(18,-50),(-105,22),(18,-52),(-150,20)]
    for (h,distance,speed),(dx,dy) in zip(wind,label_offsets):
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        y=pb-distance/7.0*(pb-pt)
        d.ellipse((x-11,y-11,x+11,y+11),fill=GOLD,outline=INK,width=2)
        d.text((x+dx,y+dy),f"{distance:.2f} m",font=MONO(19),fill=GOLD)
        d.text((x+dx,y+dy+24),f"{speed:.1f} m/s",font=MONO(18),fill=MUTED)
    for h in (1.5,1.8,2.0,2.2):
        x=pl+(h-1.4)/(2.3-1.4)*(pr-pl)
        d.text((x-24,pb+5),f"{h:.1f}",font=MONO(19),fill=MUTED)
    save(image,"measured-landing-distance-mobile.png")


def make_bench_photo():
    source = Path(r"C:\Users\sejta\Downloads\97e813e8-67ac-44da-bf51-4f337e30004e.jpg")
    image = Image.open(source).convert("RGB")
    # Keep the fan, paper path, imaging laptop and nozzle equipment in one frame.
    crop = image.crop((0, 170, image.width, 1130))
    crop = ImageOps.fit(crop, (1280, 960), method=Image.Resampling.LANCZOS, centering=(0.5, 0.53))
    crop.save(OUT / "bench-measurement.webp", "WEBP", quality=86, method=6)


make_motion()
make_evaporation()
make_downwash()
make_route()
make_measurements()
make_measurements_mobile()
make_bench_photo()
print("Generated:")
for path in sorted(OUT.iterdir()):
    if path.name in {"droplet-motion.png", "evaporation.png", "rotor-downwash.png", "wind-aware-route.png", "measured-landing-distance.png", "measured-landing-distance-mobile.png", "bench-measurement.webp"}:
        print(f"{path.name} · {path.stat().st_size:,} bytes")

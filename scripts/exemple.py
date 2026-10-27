"""Une seule image d'exemple, façon cadre vide Shopify."""
from PIL import Image, ImageDraw

SIZE = 1200
BG = (246, 246, 247)
INK = (156, 163, 175)
OUT = "/home/user/novadz-repo-final/public/demo/exemple.jpg"

im = Image.new("RGB", (SIZE, SIZE), BG)
d = ImageDraw.Draw(im)

# assez grande pour rester lisible dans une vignette
w, h = 360, 280
cx, cy = SIZE // 2, SIZE // 2
x0, y0 = cx - w // 2, cy - h // 2
x1, y1 = cx + w // 2, cy + h // 2
d.rounded_rectangle((x0, y0, x1, y1), radius=28, outline=INK, width=14)
d.ellipse((x0 + 46, y0 + 42, x0 + 110, y0 + 106), outline=INK, width=14)
d.line(
    [
        (x0 + 34, y1 - 36),
        (x0 + 124, y0 + 130),
        (x0 + 196, y1 - 88),
        (x0 + 252, y0 + 108),
        (x1 - 34, y1 - 36),
    ],
    fill=INK,
    width=14,
)
im.save(OUT, "JPEG", quality=92)
print(OUT)

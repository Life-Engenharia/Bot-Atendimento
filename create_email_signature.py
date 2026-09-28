from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path("output/signature/assinatura-joao-victor-vasconcelos.png")
OUT.parent.mkdir(parents=True, exist_ok=True)

W, H = 1100, 260
NAVY = (18, 62, 106, 255)
CYAN = (0, 169, 214, 255)
TEXT = (42, 59, 77, 255)
MUTED = (98, 116, 135, 255)

img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
regular = r"C:\Windows\Fonts\arial.ttf"
bold = r"C:\Windows\Fonts\arialbd.ttf"

name_font = ImageFont.truetype(bold, 48)
role_font = ImageFont.truetype(regular, 27)
phone_font = ImageFont.truetype(regular, 26)
# Original hacker-inspired badge. The web references were used only for visual direction;
# this mark is drawn from simple shapes and does not reuse a third-party asset.
circle = (32, 43, 174, 185)
draw.ellipse(circle, fill=NAVY)
draw.arc(circle, 295, 70, fill=CYAN, width=8)

# Fedora brim, crown and a minimal anonymous face/glasses silhouette.
draw.ellipse((46, 91, 160, 115), fill=(9, 34, 61, 255))
draw.polygon([(64, 94), (74, 59), (128, 59), (144, 94)], fill=(9, 34, 61, 255))
draw.rounded_rectangle((76, 79, 134, 86), radius=2, fill=CYAN)
draw.rounded_rectangle((63, 111, 99, 121), radius=4, fill=(255, 255, 255, 220))
draw.rounded_rectangle((108, 111, 144, 121), radius=4, fill=(255, 255, 255, 220))
draw.rectangle((99, 115, 108, 118), fill=(255, 255, 255, 220))

# Divider and professional contact details.
draw.rounded_rectangle((223, 47, 228, 213), radius=3, fill=CYAN)
draw.text((265, 53), "João Victor Vasconcelos", font=name_font, fill=NAVY)
draw.text((267, 119), "Engenheiro de Software", font=role_font, fill=TEXT)
draw.text((267, 163), "+55 79 99116-2353", font=phone_font, fill=MUTED)
draw.line((267, 207, 790, 207), fill=(211, 224, 232, 255), width=2)

img.save(OUT, "PNG", optimize=True)
print(OUT)

#!/usr/bin/env python3
"""Crea la lámina de presentación a partir de los activos finales de GIBO."""
from pathlib import Path
import io
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont, ImageCms
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
NAVY, BLUE, CYAN = '#0F2557', '#176BEB', '#20BFD1'
BG, GRAY, BORDER = '#F4F6F8', '#526179', '#E2E7EF'
im = Image.new('RGB', (2000, 1740), BG)
draw = ImageDraw.Draw(im)

@lru_cache(None)
def fontdata(family, weight):
    source = ROOT/'06_Fuentes'/family/(family+'-variable.ttf')
    f = TTFont(source)
    coords = {'wght':weight}
    if family == 'Inter':
        coords['opsz'] = 14
    f = instantiateVariableFont(f,coords,inplace=False)
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()

@lru_cache(None)
def font(size,weight=400,family='Inter'):
    return ImageFont.truetype(io.BytesIO(fontdata(family,weight)),size)

def text(x,y,value,size=24,color=NAVY,weight=400,family='Inter'):
    draw.text((x,y),value,font=font(size,weight,family),fill=color,anchor='lt')

def right(x,y,value,size=24,color=NAVY,weight=400):
    draw.text((x,y),value,font=font(size,weight),fill=color,anchor='rt')

def card(box,color='white',outline=BORDER,radius=18):
    draw.rounded_rectangle(box,radius,fill=color,outline=outline,width=2)

def place(relative,x,y,width):
    with Image.open(ROOT/relative) as source:
        asset=source.convert('RGBA')
    height=round(asset.height*width/asset.width)
    asset=asset.resize((width,height),Image.Resampling.LANCZOS)
    im.paste(asset,(x,y),asset)

draw.rectangle((80,64,128,70),fill=CYAN)
text(148,51,'GIBO / IDENTIDAD VISUAL',22,weight=600)
right(1920,51,'V1.0  /  OCTUBRE 2026',20,GRAY,500)
text(80,109,'Sistema de identidad',62,weight=700,family='Montserrat')
right(1920,137,'Governance & Data',24,GRAY,400)

card((80,210,1340,860))
text(112,246,'01  /  LOGOTIPO PRINCIPAL',19,GRAY,600)
place('03_PNG/principal/gibo-principal-positivo-3200.png',110,284,1200)

card((1380,210,1920,860),NAVY,NAVY)
text(1418,246,'02  /  ISOTIPO',19,'#B8C9E6',600)
place('03_PNG/isotipo/gibo-isotipo-negativo-2048.png',1420,306,460)
text(1418,790,'Tres nodos. Una órbita.',24,'#FFFFFF',500)

variants=[('positivo','Positiva','Para fondos claros','white',NAVY),
          ('negativo','Negativa','Para fondos oscuros',NAVY,'#FFFFFF'),
          ('negro','Una tinta / negro','Detalles calados','white',NAVY),
          ('blanco','Una tinta / blanco','Detalles calados','#08152E','#FFFFFF')]
for i,(key,title,subtitle,bg,fg) in enumerate(variants):
    x=80+i*465
    card((x,900,x+445,1270),bg,BORDER if bg=='white' else bg)
    text(x+28,935,title,23,fg,600)
    place(f'03_PNG/wordmark/gibo-wordmark-{key}-1600.png',x+20,1001,405)
    text(x+28,1208,subtitle,20,GRAY if bg=='white' else '#B8C9E6',400)

card((80,1310,1080,1635))
text(112,1347,'03  /  PALETA PRINCIPAL',19,GRAY,600)
for i,(name,color,fg) in enumerate([('Marino',NAVY,'white'),('Eléctrico',BLUE,'white'),('Cian',CYAN,NAVY)]):
    x=112+i*312
    draw.rounded_rectangle((x,1396,x+294,1538),12,fill=color)
    text(x+22,1424,name,25,fg,600)
    text(x+22,1474,color,26,fg,500)
text(112,1576,'Color plano · sRGB · especificaciones en la guía',19,GRAY)

card((1110,1310,1920,1635))
text(1142,1347,'04  /  TIPOGRAFÍA DE SISTEMA',19,GRAY,600)
text(1142,1400,'Montserrat',42,weight=700,family='Montserrat')
text(1580,1414,'Títulos / 600–700',21,GRAY)
draw.line((1142,1478,1888,1478),fill=BORDER,width=2)
text(1142,1512,'Inter',42,weight=500)
text(1350,1526,'Interfaz, formularios y datos',22,GRAY)

text(80,1684,'SVG con contornos  /  PNG transparentes  /  Iconos y guía de marca',20,GRAY)
right(1920,1684,'Reconstrucción vectorial normalizada',18,GRAY)
path=ROOT/'08_Preview'/'GIBO_Vista_Previa.png'
path.parent.mkdir(parents=True,exist_ok=True)
profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
im.save(path,optimize=True,dpi=(300,300),icc_profile=profile)
print(path)

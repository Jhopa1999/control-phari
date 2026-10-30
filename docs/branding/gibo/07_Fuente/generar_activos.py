#!/usr/bin/env python3
"""GIBO · reconstrucción vectorial normalizada v1.0.

Genera SVG con contornos, PNG RGBA y recursos de aplicación sin red ni IA de imagen.
Dependencias Python: Pillow y fonttools. Renderizador: Inkscape en PATH.
Desde la raíz del paquete: python3 07_Fuente/generar_activos.py --output .
"""
from __future__ import annotations

import argparse
import io
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageCms, ImageDraw, ImageFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

NAVY = '#0F2557'
BLUE = '#176BEB'
CYAN = '#20BFD1'
WHITE = '#FFFFFF'
DARK = '#08152E'
CANVAS = '#F4F6F8'
VARIANTS = ('positivo', 'negativo', 'negro', 'blanco')
ASSETS = ('principal', 'wordmark', 'isotipo', 'icono')
ICC = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()

# Curvas maestras normalizadas según la referencia. La G integra su nodo exterior.
G_PATH = (
    'M210 43 C187 19 158 7 122 7 C54 7 0 53 0 116 '
    'C0 181 48 225 118 225 C153 225 185 214 208 195 '
    'L208 107 L155.45 107 '
    'C151.3 93.7 138.8 84 124 84 C105.8 84 91 98.8 91 117 '
    'C91 135.2 105.8 150 124 150 C136.5 150 147.4 143.1 153.1 133 '
    'L162 133 L162 175 C150 180 136 182 120 182 '
    'C81 182 52 156 52 117 C52 78 80 50 122 50 '
    'C144 50 162 57 180 74 L210 43 Z'
)
B_PATH = (
    'M331 12 H439 C488 12 514 31 514 67 '
    'C514 89 502 103 486 111 C510 119 523 135 523 160 '
    'C523 200 495 220 447 220 H331 Z '
    'M380 50 H437 C455 50 465 58 465 72 '
    'C465 87 454 96 435 96 H380 Z '
    'M380 134 H441 C462 134 473 143 473 158 '
    'C473 173 462 182 441 182 H380 Z'
)

def n(value):
    return f'{value:.5f}'.rstrip('0').rstrip('.')

def point(cx, cy, r, degrees):
    a = math.radians(degrees)
    return cx + r * math.cos(a), cy + r * math.sin(a)

def circle_path(cx, cy, r):
    return (f'M{n(cx+r)} {n(cy)} A{n(r)} {n(r)} 0 1 0 {n(cx-r)} {n(cy)} '
            f'A{n(r)} {n(r)} 0 1 0 {n(cx+r)} {n(cy)} Z')

def sector_path(cx, cy, radius, thickness, start, end):
    ro, ri = radius + thickness / 2, radius - thickness / 2
    po1, po2 = point(cx, cy, ro, start), point(cx, cy, ro, end)
    pi2, pi1 = point(cx, cy, ri, end), point(cx, cy, ri, start)
    large = int((end-start) > 180)
    return (f'M{n(po1[0])} {n(po1[1])} A{n(ro)} {n(ro)} 0 {large} 1 {n(po2[0])} {n(po2[1])} '
            f'L{n(pi2[0])} {n(pi2[1])} A{n(ri)} {n(ri)} 0 {large} 0 {n(pi1[0])} {n(pi1[1])} Z')

def palette(variant):
    if variant == 'positivo':
        return NAVY, BLUE, CYAN
    if variant == 'negativo':
        return WHITE, BLUE, CYAN
    value = '#000000' if variant == 'negro' else WHITE
    return value, value, value

def orbit_paths(micro=False):
    width, radius, node, gap = (14, 86, 20.5, 22) if micro else (9, 86, 18, 18)
    angles = (-90, 42, 180)
    nodes = [circle_path(*point(116, 116, radius, angle), node) for angle in angles]
    arcs = [sector_path(116, 116, radius, width, angle+gap, stop-gap)
            for angle, stop in zip(angles, (42, 180, 270))]
    return arcs, nodes

def isotipo(variant='positivo', micro=False, dynamic=False):
    base, blue, cyan = palette(variant)
    base = 'var(--gibo-base)' if dynamic else base
    ring = circle_path(116, 116, 116) + ' ' + circle_path(116, 116, 57)
    arcs, nodes = orbit_paths(micro)
    if variant in ('negro', 'blanco'):
        return (f'<g id="isotipo"><path id="anillo-con-calados" fill="{base}" '
                f'fill-rule="evenodd" d="{ring} {" ".join(arcs+nodes)}"/></g>')
    return (f'<g id="isotipo"><path id="anillo" fill="{base}" fill-rule="evenodd" d="{ring}"/>'
            f'<g id="orbita" fill="{cyan}">' +
            ''.join(f'<path id="arco-{i+1}" d="{d}"/>' for i, d in enumerate(arcs)) + '</g>' +
            f'<g id="tres-nodos" fill="{cyan}">' +
            ''.join(f'<path id="nodo-{i+1}" d="{d}"/>' for i, d in enumerate(nodes)) + '</g></g>')

def wordmark(variant='positivo'):
    base, blue, cyan = palette(variant)
    mono = variant in ('negro', 'blanco')
    g = G_PATH + (' ' + circle_path(124, 117, 17.5) if mono else '')
    return (f'<g id="wordmark"><path id="letra-G" fill="{base}" fill-rule="evenodd" d="{g}"/>' +
            ('' if mono else f'<path id="nodo-G" fill="{blue}" d="{circle_path(124,117,17.5)}"/>') +
            f'<path id="letra-I" fill="{base}" d="M243 12 H293 V220 H243 Z"/>'
            f'<path id="letra-B" fill="{base}" fill-rule="evenodd" d="{B_PATH}"/>'
            f'<g id="letra-O" transform="translate(540 0)">{isotipo(variant)}</g></g>')

def font_instance(path, weight=700, opsz=None):
    font = TTFont(path)
    if 'fvar' in font:
        coords = {'wght': weight}
        if opsz is not None and any(a.axisTag == 'opsz' for a in font['fvar'].axes):
            coords['opsz'] = opsz
        font = instantiateVariableFont(font, coords, inplace=False)
    return font

def tagline_path(fontpath):
    font = font_instance(fontpath, 700)
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    pil_font = ImageFont.truetype(buf, 1000)
    text = 'GOVERNANCE & DATA'
    positions, x, bounds = [], 0, BoundsPen(gs)
    for i, char in enumerate(text):
        if i:
            prev = text[i-1]
            x += pil_font.getlength(prev+char) - pil_font.getlength(prev) - pil_font.getlength(char)
        glyph = cmap[ord(char)]
        positions.append((glyph, x))
        gs[glyph].draw(TransformPen(bounds, (1,0,0,1,x,0)))
        x += font['hmtx'][glyph][0]
    xmin, ymin, xmax, ymax = bounds.bounds
    scale = 744 / (xmax-xmin)
    pen = SVGPathPen(gs, ntos=lambda val: n(float(val)))
    for glyph, x in positions:
        transform = (scale,0,0,-scale,14+(x-xmin)*scale,262+ymax*scale)
        gs[glyph].draw(TransformPen(pen,transform))
    return pen.getCommands(), {'bbox':[14,262,758,262+(ymax-ymin)*scale], 'height': (ymax-ymin)*scale,
                               'font':'Montserrat Bold 700', 'scaled_proportionally':True}

def svg_document(body, box, title, desc, extra=''):
    vb = ' '.join(n(x) for x in box)
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{n(box[2])}" height="{n(box[3])}" '
            f'role="img" aria-labelledby="gibo-title gibo-desc">\n'
            f'<title id="gibo-title">{escape(title)}</title>\n<desc id="gibo-desc">{escape(desc)}</desc>\n'
            f'{extra}\n{body}\n</svg>\n')

def asset_svg(asset, variant, tagline):
    if asset == 'principal':
        body = wordmark(variant) + f'<path id="tagline-contornos" fill="{palette(variant)[0]}" d="{tagline}"/>'
        box = (-36,-36,844,382)
    elif asset == 'wordmark':
        body, box = wordmark(variant), (-36,-36,844,304)
    elif asset == 'isotipo':
        body, box = isotipo(variant), (-36,-36,304,304)
    else:
        body = f'<g transform="translate(64 64) scale({n(384/232)})">{isotipo(variant)}</g>'
        box = (0,0,512,512)
    return svg_document(body,box,f'GIBO · {asset} · {variant}',
                        'Reconstrucción vectorial normalizada. Fondo y contraformas transparentes. '
                        'Tres nodos orbitales y nodo interior de G. Texto convertido en contornos.')

def render(svg, png, width):
    png.parent.mkdir(parents=True,exist_ok=True)
    # Nunca sobrescribir un PNG mientras otro lector mantiene el archivo abierto.
    # Verificar bytes completos antes de sustituir la exportación anterior.
    with tempfile.TemporaryDirectory(prefix='.gibo-render-',dir=png.parent) as tmp:
        rendered, finished = Path(tmp)/'render.png', Path(tmp)/'finished.png'
        proc = subprocess.run(['inkscape',str(svg),'--export-type=png',f'--export-filename={rendered}',
                               f'--export-width={width}','--export-background-opacity=0'],capture_output=True,text=True)
        if proc.returncode:
            raise RuntimeError(proc.stderr)
        with Image.open(rendered) as source:
            rgba = source.convert('RGBA')
        rgba.save(finished,dpi=(300,300),icc_profile=ICC,optimize=True)
        with Image.open(finished) as checked:
            checked.verify()
        finished.replace(png)
    return png.name

def save_text(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.output.resolve()
    if not shutil.which('inkscape'):
        raise SystemExit('Se requiere Inkscape en PATH para renderizar PNG.')
    fonts = root/'06_Fuentes'
    tagline,tag_info = tagline_path(fonts/'Montserrat'/'Montserrat-variable.ttf')
    jobs = []
    for asset in ASSETS:
        for variant in VARIANTS:
            svg = root/'02_SVG'/asset/f'gibo-{asset}-{variant}.svg'
            save_text(svg,asset_svg(asset,variant,tagline))
            sizes = (1600,3200) if asset in ('principal','wordmark') else (512,2048)
            for width in sizes:
                jobs.append((svg,root/'03_PNG'/asset/f'gibo-{asset}-{variant}-{width}.png',width))
    # Favicon micro: margen de 2/32 por lado, trazo y nodos corregidos ópticamente.
    for variant in VARIANTS:
        body = f'<g transform="translate(2 2) scale({n(28/232)})">{isotipo(variant,True)}</g>'
        path = root/'02_SVG'/'isotipo'/f'gibo-isotipo-micro-{variant}.svg'
        save_text(path,svg_document(body,(0,0,32,32),f'GIBO · isotipo micro · {variant}',
                                   'Adaptación óptica para 16 y 32 píxeles. Fondo transparente.'))
    app = root/'04_App_Icon'
    app.mkdir(parents=True,exist_ok=True)
    dynamic = f'<g transform="translate(2 2) scale({n(28/232)})">{isotipo("positivo",True,True)}</g>'
    style = '<style>:root{--gibo-base:#0F2557}@media(prefers-color-scheme:dark){:root{--gibo-base:#FFFFFF}}</style>'
    save_text(app/'favicon.svg',svg_document(dynamic,(0,0,32,32),'GIBO',
                'Favicon vectorial adaptativo. Marino en modo claro y blanco en modo oscuro, con acentos cian.',style))
    micro = root/'02_SVG'/'isotipo'/'gibo-isotipo-micro-positivo.svg'
    for width in (16,32):
        jobs.append((micro,app/f'favicon-{width}.png',width))
    jobs.append((root/'02_SVG'/'icono'/'gibo-icono-positivo.svg',app/'favicon-48.png',48))
    tile = f'<path fill="{NAVY}" d="M0 0H512V512H0Z"/>' + f'<g transform="translate(64 64) scale({n(384/232)})">{isotipo("negativo")}</g>'
    app_svg=app/'gibo-app-icon.svg'
    save_text(app_svg,svg_document(tile,(0,0,512,512),'GIBO · icono de aplicación',
        'Fondo marino opaco. Sin esquinas precortadas. Símbolo dentro del 75% central del lienzo.'))
    for filename,width in [('apple-touch-icon.png',180),('android-chrome-192.png',192),
                           ('android-chrome-512.png',512),('maskable-icon-192.png',192),
                           ('maskable-icon-512.png',512),('gibo-app-icon-1024.png',1024)]:
        jobs.append((app_svg,app/filename,width))
    exported = [render(*job) for job in jobs]
    # PNG móviles opacos; el maestro de icono transparente está en 02_SVG/icono.
    for filename in ('apple-touch-icon.png','android-chrome-192.png','android-chrome-512.png',
                     'maskable-icon-192.png','maskable-icon-512.png','gibo-app-icon-1024.png'):
        path = app/filename
        with Image.open(path) as im:
            im.convert('RGB').save(path,dpi=(300,300),icc_profile=ICC,optimize=True)
    # Cada tamaño del ICO conserva su render óptico dedicado, sin reescalado genérico.
    from PIL import IcoImagePlugin
    frames = [Image.open(app/f'favicon-{s}.png').convert('RGBA') for s in (16,32,48)]
    frames[-1].save(app/'favicon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48)],append_images=frames[:-1])
    manifest = {
        'name':'GIBO · Governance & Data','short_name':'GIBO','lang':'es','display':'standalone',
        'background_color':NAVY,'theme_color':NAVY,
        'icons':[{'src':f'android-chrome-{size}.png','sizes':f'{size}x{size}','type':'image/png','purpose':'any'} for size in (192,512)] +
                [{'src':f'maskable-icon-{size}.png','sizes':f'{size}x{size}','type':'image/png','purpose':'maskable'} for size in (192,512)]
    }
    save_text(app/'site.webmanifest',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    geometry = {
        'version':'1.0','date':'2026-10-29','unit':'unidad vectorial',
        'principal':{'art_width':772,'art_height':310,'viewBox':[-36,-36,844,382]},
        'wordmark':{'art_width':772,'art_height':232,'viewBox':[-36,-36,844,304]},
        'isotipo':{'diameter':232,'inner_diameter':114,'orbit_radius':86,'orbit_thickness':9,
                   'node_radius':18,'angles_deg':[-90,42,180],'viewBox':[-36,-36,304,304]},
        'clearspace':36,'icon':{'canvas':512,'art_diameter':384,'padding':64},
        'micro':{'canvas':32,'art_diameter':28,'padding':2,'orbit_thickness_in_master_units':14,'node_radius':20.5},
        'tagline':tag_info,'colors':{'navy':NAVY,'electric':BLUE,'cyan':CYAN},
        'note':'Contornos propios normalizados desde raster; no es recuperación del maestro original. CMYK no gestionado en SVG/PNG.'
    }
    save_text(root/'07_Fuente'/'geometria.json',json.dumps(geometry,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'svg_assets':20,'png_exports':len(exported),'tagline':tag_info,'output':str(root)},ensure_ascii=False))

if __name__ == '__main__':
    main()

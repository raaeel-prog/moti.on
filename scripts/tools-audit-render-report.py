"""Pixel measurements of original native QA renders; not a native backend assertion."""
from pathlib import Path
import json
import hashlib
from PIL import Image, ImageChops, ImageDraw

base = Path(__file__).resolve().parent.parent / 'artifacts/tools-audit'
gradient = sorted((base/'gradient-native').glob('*/result.json'))[-1].parent
recipes = ['aurora', 'silk', 'halo', 'satin', 'duotone', 'mist', 'prism']
result = {'kind': 'offline PNG analysis', 'gradientRun': str(gradient), 'loops': [], 'backendControlComparisons': [], 'particles': []}
sheet = Image.new('RGB', (960, 630), '#181818')
draw = ImageDraw.Draw(sheet)
for index, recipe in enumerate(recipes):
    for depth in [8, 16, 32]:
        first = Image.open(gradient/f'{recipe}-{depth}bpc-request1-0s.png').convert('RGBA')
        last = Image.open(gradient/f'{recipe}-{depth}bpc-request1-6s.png').convert('RGBA')
        identical = first.tobytes() == last.tobytes()
        result['loops'].append({'recipe': recipe, 'bits': depth, 'status': 'PASS' if identical else 'FAIL', 'identicalPixels': identical})
    thumb = Image.open(gradient/f'{recipe}-8bpc-request1-3s.png').convert('RGB').resize((320,180))
    x, y = (index % 3)*320, (index // 3)*210
    sheet.paste(thumb, (x,y+26)); draw.text((x+8,y+7), recipe, fill='white')
for depth in [8, 16, 32]:
    for control in [2, 3]:
        reference = Image.open(gradient/f'aurora-{depth}bpc-request1-3s.png').convert('RGB')
        candidate = Image.open(gradient/f'aurora-{depth}bpc-request{control}-3s.png').convert('RGB')
        extrema = ImageChops.difference(reference,candidate).getextrema()
        result['backendControlComparisons'].append({'bits': depth, 'requestedControl':control,'max8bitChannelDifference':max(channel[1] for channel in extrema),'actualBackend':'NOT RUN'})
sheet.save(base/'gradient-contact-sheet.png')
particle_sheet = Image.new('RGB', (960,420), '#181818')
particle_draw = ImageDraw.Draw(particle_sheet)
for index, filename in enumerate(sorted((base/'particles-native').glob('*.png'))):
    image = Image.open(filename).convert('RGBA')
    alpha = image.getchannel('A')
    result['particles'].append({'mode': filename.stem, 'width': image.width, 'height': image.height, 'alphaRange': alpha.getextrema(), 'visiblePixels': sum(alpha.histogram()[1:]), 'sha256': hashlib.sha256(filename.read_bytes()).hexdigest()})
    thumb = Image.new('RGBA', image.size, '#242424')
    thumb.alpha_composite(image)
    x, y = (index % 3)*320, (index // 3)*210
    particle_sheet.paste(thumb.convert('RGB').resize((320,180)), (x,y+26))
    particle_draw.text((x+8,y+7), filename.stem, fill='white')
particle_sheet.save(base/'particles-contact-sheet.png')
result['status'] = 'PASS' if all(row['identicalPixels'] for row in result['loops']) else 'FAIL'
(base/'render-analysis.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({'status':result['status'],'loopComparisons':len(result['loops']),'particleImages':len(result['particles'])}))

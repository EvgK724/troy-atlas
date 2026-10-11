#!/usr/bin/env python3
"""Build the self-contained TROY atlas using the Python standard library."""
import argparse
import base64
import json
import re
from pathlib import Path
from versioning import stamp

ROOT = Path(__file__).resolve().parents[1]
SRC, DOCS = ROOT / 'src', ROOT / 'docs'

def uri(name):
    return 'data:image/png;base64,' + base64.b64encode((DOCS/'assets'/name).read_bytes()).decode()

def svg(name,prefix):
    art=(DOCS/'assets'/name).read_text()
    for ident in re.findall(r'\bid="([^"]+)"',art):
        art=art.replace('id="'+ident+'"','id="'+prefix+ident+'"')
        art=art.replace('#'+ident+')','#'+prefix+ident+')')
        art=art.replace('href="#'+ident+'"','href="#'+prefix+ident+'"')
        art=re.sub(r'(aria-(?:labelledby|describedby)="[^"]*)\b'+re.escape(ident)+r'\b',lambda m:m.group(1)+prefix+ident,art)
    return art

def build(export=None):
    content=json.loads((ROOT/'content.json').read_text())
    sources=json.loads((ROOT/'sources.json').read_text())
    topics={t['id'] for t in content['topics']}
    people={p['id'] for p in content['people']}
    for group in content.values():
        for item in group:
            assert all(s in sources for s in item.get('sources',[])),item
    for card in content['cards']:
        assert card['topic'] in topics and set(card['related'])<=topics and card['kind'] in ('fact','link','case'),card
    for t in content['topics']:assert set(t['links'])<=topics
    for p in content['people']:assert all(l['id'] in people for l in p['links'])
    for b in content['connections']:assert b['from'] in topics and b['to'] in topics
    for group in ['topics','people','cards','connections','phases']:
        assert len({x['id'] for x in content[group]})==len(content[group])
    data='const CONTENT = '+json.dumps(content,ensure_ascii=False).replace('<','\\u003c')+';\nconst SOURCES = '+json.dumps(sources,ensure_ascii=False).replace('<','\\u003c')+';'
    parts={
        '/*__CSS__*/':'\n'.join((SRC/name).read_text() for name in ['style.css','troy.css','updater.css']),
        '__ICON__':uri('mark-96.png'),
        '<!--__CITY__-->':svg('troy-citadel.svg','city-'),
        '<!--__LAYERS_HERO__-->':svg('troy-strata.svg','hero-'),
        '<!--__LAYERS_DETAIL__-->':svg('troy-strata.svg','detail-'),
        '<!--__GEOGRAPHY__-->':svg('troy-connections.svg','geo-'),
        '<!--__QR__-->':(DOCS/'assets/qr.svg').read_text(),
        '/*__DATA__*/':data,
        '/*__LEARNING__*/':(SRC/'learning.js').read_text(),
        '/*__APP__*/':(SRC/'app.js').read_text(),
        '/*__UPDATER__*/':(SRC/'updater.js').read_text(),
    }
    html=(SRC/'shell.html').read_text()
    for key,value in parts.items():
        assert key in html,key
        html=html.replace(key,value)
    html=stamp(html,'troy',DOCS)
    assert '/*__' not in html and '<!--__' not in html
    found=re.findall(r'\bid="([^"]+)"',html.split('<script>const CONTENT')[0])
    assert len(found)==len(set(found)),'Duplicate HTML/SVG IDs'
    assert 'palermo' not in html.lower()
    (DOCS/'index.html').write_text(html)
    offline=html.replace('<link rel="manifest" href="site.webmanifest">','')
    for name in ['favicon-32.png','apple-touch-icon.png']:
        offline=offline.replace('href="assets/'+name+'"','href="'+uri(name)+'"')
    offline=offline.replace('<a class="secondary-button" href="TROY.html" download>Скачать офлайн-версию ↓</a>','<p>Открыта автономная копия приложения.</p>')
    (DOCS/'TROY.html').write_text(offline)
    (DOCS/'.nojekyll').touch()
    if export:
        export.mkdir(parents=True,exist_ok=True)
        (export/'TROY.html').write_text(offline)
    print(f'Built {len(html.encode()):,} bytes; {len(content["cards"])} recall cards; {len(sources)} sources.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--export',type=Path);build(p.parse_args().export)

import os, re, json, subprocess, shutil, urllib.request, urllib.parse
from pathlib import Path

repo = Path('/home/claworc/fluentt-design-sol')
out = repo / 'agent-visual-references'
out.mkdir(exist_ok=True)
(tmp := repo / '.tmp-agent-ref').mkdir(exist_ok=True)

sources = [
    ('pixel-agents', 'https://github.com/pablodelucca/pixel-agents'),
    ('pixel-agents-cursor', 'https://github.com/pablodelucca/pixel-agents-cursor'),
    ('pixel-agents-gemini', 'https://github.com/pablodelucca/pixel-agents-gemini'),
    ('pixel-agents-agent-friday', 'https://github.com/FutureSpeakAI/pixel-agents-agent-friday'),
    ('petclaw-ai', 'https://petclaw.ai/'),
    ('notchi', 'https://github.com/sk-ruban/notchi'),
    ('clawpal', 'https://github.com/zhixianio/clawpal'),
    ('openclaw-virtual-office', 'https://github.com/ketangope/openclaw-virtual-office'),
    ('openclaw-office', 'https://github.com/WW-AI-Lab/openclaw-office'),
    ('claw-empire', 'https://github.com/GreenSheep01201/claw-empire'),
    ('agent-town', 'https://github.com/geezerrrr/agent-town'),
]

img_exts = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
prefer_names = ['screenshot', 'demo', 'preview', 'hero', 'cover', 'character', 'avatar', 'office', 'pixel', 'agent']
manifest = []

for slug, url in sources:
    item_dir = out / slug
    item_dir.mkdir(exist_ok=True)
    imgs = []
    note = ''
    if 'github.com' in url and '/search?' not in url:
        m = re.match(r'https://github\.com/([^/]+/[^/]+)/?$', url)
        if m:
            full = m.group(1)
            clone_dir = tmp / slug
            if clone_dir.exists():
                shutil.rmtree(clone_dir)
            try:
                subprocess.run(['git', 'clone', '--depth', '1', f'https://github.com/{full}.git', str(clone_dir)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
                candidates = []
                for p in clone_dir.rglob('*'):
                    if p.is_file() and p.suffix.lower() in img_exts:
                        rel = str(p.relative_to(clone_dir)).lower()
                        score = 0
                        for name in prefer_names:
                            if name in rel:
                                score += 3
                        if 'node_modules' in rel or '.git/' in rel:
                            continue
                        try:
                            size = p.stat().st_size
                        except Exception:
                            size = 0
                        if size < 2000:
                            continue
                        score += min(size / 100000, 5)
                        candidates.append((score, p))
                candidates.sort(reverse=True, key=lambda x: x[0])
                for i, (_, p) in enumerate(candidates[:6], start=1):
                    dest = item_dir / f'{i:02d}{p.suffix.lower()}'
                    shutil.copy2(p, dest)
                    imgs.append(dest.name)
                for readme_name in ['README.md', 'readme.md']:
                    rp = clone_dir / readme_name
                    if rp.exists():
                        txt = rp.read_text(errors='ignore')[:1000]
                        note = re.sub(r'\s+', ' ', txt).strip()[:240]
                        break
                if not imgs:
                    note = (note + ' 이미지 파일 후보를 자동으로 찾지 못함.').strip()
            except Exception as e:
                note = f'수집 실패: {e}'
    else:
        try:
            html = urllib.request.urlopen(url, timeout=20).read().decode('utf-8', 'ignore')
            patterns = [
                r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
                r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)'
            ]
            found = None
            for pat in patterns:
                mm = re.search(pat, html, re.I)
                if mm:
                    found = urllib.parse.urljoin(url, mm.group(1))
                    break
            if found:
                ext = os.path.splitext(urllib.parse.urlparse(found).path)[1] or '.png'
                dest = item_dir / f'01{ext}'
                urllib.request.urlretrieve(found, dest)
                imgs.append(dest.name)
            note = '사이트 대표 이미지(og:image) 기준 수집.' if imgs else '대표 이미지를 자동으로 찾지 못함.'
        except Exception as e:
            note = f'수집 실패: {e}'
    manifest.append({'name': slug, 'source': url, 'images': imgs, 'note': note})

searches = [
    ('agent-simulation-search', 'https://github.com/search?q=agent+simulation+pixel'),
    ('pixel-agent-search', 'https://github.com/search?q=pixel+agent'),
    ('ai-agent-character-search', 'https://github.com/search?q=ai+agent+character'),
    ('desktop-ai-companion-search', 'https://github.com/search?q=desktop+ai+companion'),
]
for slug, url in searches:
    (out / slug).mkdir(exist_ok=True)
    manifest.append({'name': slug, 'source': url, 'images': [], 'note': '검색 링크만 저장. 직접 훑어보며 후보를 더 고르면 좋음.'})

(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
md = ['# Agent Visual References', '', '에이전트 캐릭터/시각화 레퍼런스를 모아둔 폴더예요.', '']
for item in manifest:
    md.append(f"## {item['name']}")
    md.append(f"- Source: {item['source']}")
    md.append(f"- Saved images: {', '.join(item['images']) if item['images'] else '없음'}")
    if item['note']:
        md.append(f"- Note: {item['note']}")
    md.append('')
(out / 'README.md').write_text('\n'.join(md))
print('done')

#!/usr/bin/env python3
"""إثراء بيانات الكتب: جلب أغلفة حقيقية من Google Books وروابط PDF حقيقية من archive.org.
يعمل عبر GitHub Actions حيث الوصول للإنترنت متاح."""
import json, os, re, time, urllib.parse, sys
import requests

DATA_FILES = [
    'data/books-sample.json',
    'data/books-extra-1.json',
    'data/books-extra-2.json',
    'data/books-extra-3.json',
]
MODE = os.environ.get('MODE', 'covers+pdfs')
DO_COVERS = 'covers' in MODE
DO_PDFS = 'pdfs' in MODE

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'TaybaaLibrary-Bot/1.0 (+https://github.com/tsallabi/TAYBAA-LIBRARY)'})

def gbooks_cover(title, author):
    q = f'intitle:"{title}"'
    if author:
        q += f' inauthor:"{author}"'
    try:
        r = SESSION.get('https://www.googleapis.com/books/v1/volumes',
                        params={'q': q, 'maxResults': 5, 'printType': 'books',
                                'fields': 'items(volumeInfo(title,authors,imageLinks))'},
                        timeout=15)
        if r.status_code != 200: return None
        for item in r.json().get('items', [])[:5]:
            info = item.get('volumeInfo', {})
            links = info.get('imageLinks', {})
            url = links.get('extraLarge') or links.get('large') or links.get('medium') or links.get('thumbnail')
            if url:
                return url.replace('http://', 'https://').replace('&edge=curl', '').replace('zoom=1', 'zoom=2')
    except Exception as e:
        print(f'  gbooks error: {e}')
    return None

def archive_pdf(title, author):
    q_terms = [f'title:({title})']
    if author:
        q_terms.append(f'creator:({author})')
    q_terms.append('mediatype:texts')
    q_terms.append('(format:"PDF" OR format:"Text PDF")')
    q = ' AND '.join(q_terms)
    try:
        r = SESSION.get('https://archive.org/advancedsearch.php',
                        params={'q': q, 'fl[]': 'identifier,title,creator,language,downloads',
                                'sort[]': 'downloads desc', 'rows': 5, 'output': 'json'},
                        timeout=15)
        if r.status_code != 200: return None
        docs = r.json().get('response', {}).get('docs', [])
        for d in docs:
            ident = d.get('identifier')
            if not ident: continue
            return f'https://archive.org/embed/{ident}'
    except Exception as e:
        print(f'  archive error: {e}')
    return None

def is_real_cover(url):
    if not url: return False
    # صور Pollinations ليست حقيقية
    if 'pollinations.ai' in url: return False
    return True

def enrich(book):
    changes = []
    title = book.get('title', '').strip()
    author = book.get('author', '').strip()
    if not title: return changes

    if DO_COVERS and not is_real_cover(book.get('cover', '')):
        real = gbooks_cover(title, author)
        if real:
            book['cover'] = real
            changes.append('cover')
    
    if DO_PDFS and not book.get('pdf'):
        real = archive_pdf(title, author)
        if real:
            book['pdf'] = real
            changes.append('pdf')

    return changes

def main():
    total_updated = 0
    for path in DATA_FILES:
        if not os.path.exists(path):
            print(f'[skip] {path}')
            continue
        print(f'\n=== {path} ===')
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        updated = 0
        for book in data.get('books', []):
            changes = enrich(book)
            if changes:
                updated += 1
                total_updated += 1
                print(f"  ✓ {book.get('title')[:50]} → {','.join(changes)}")
            time.sleep(0.6)  # إحترام حدود الـ API
        if updated:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f'[saved] {updated} updated in {path}')
        else:
            print('[no changes]')
    print(f'\nTotal updated books: {total_updated}')

if __name__ == '__main__':
    main()

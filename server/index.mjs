#!/usr/bin/env node
/**
 * المكتبة الطيبة — Backend API
 *
 * Endpoints:
 *   GET  /api/health            — service health check
 *   GET  /api/stats             — library statistics (counts per category)
 *   GET  /api/books             — list books (search, filter, paginate)
 *   GET  /api/books/:id         — single book details
 *   GET  /api/books/random      — random book (for "surprise me")
 *   GET  /api/categories        — categories with counts
 *   GET  /api/quote             — daily inspirational quote
 *   GET  /api/featured          — curated featured books
 *   GET  /api/journeys          — reading journeys (curated collections)
 *
 * Run on VPS:
 *   cd /opt/taybaa-library/server
 *   npm install
 *   PORT=3000 node index.mjs
 *
 * Or with PM2 (auto-restart):
 *   pm2 start index.mjs --name taybaa-api
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '5mb' }));

// =====================================================
// Books in-memory cache (reloads every 5 min)
// =====================================================
let booksCache = null;
let booksCacheTime = 0;
const BOOKS_FILES = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];

async function loadBooks(force = false) {
    const now = Date.now();
    if (!force && booksCache && (now - booksCacheTime) < 5 * 60 * 1000) return booksCache;
    const all = [];
    const archiveIds = new Set();
    for (const f of BOOKS_FILES) {
        try {
            const data = JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8'));
            for (const b of (data.books || [])) {
                const id = String(b.id);
                if (archiveIds.has(id)) continue;
                archiveIds.add(id);
                all.push(b);
            }
        } catch (e) { console.warn('Failed to load', f, e.message); }
    }
    booksCache = all;
    booksCacheTime = now;
    console.log(`📚 Loaded ${all.length} books`);
    return all;
}

// =====================================================
// Daily quotes (curated)
// =====================================================
const QUOTES = [
    { text: 'العلم في الصغر كالنقش في الحجر', author: 'الحسن البصري' },
    { text: 'الحكمة ضالّة المؤمن، فحيث وجدها فهو أحقّ بها', author: 'الحديث الشريف' },
    { text: 'إن للقلوب صدأً كصدأ الحديد، وجلاؤها الذكر وتلاوة القرآن', author: 'ابن تيمية' },
    { text: 'الكتاب في الوحدة صديق، وفي السفر رفيق', author: 'الجاحظ' },
    { text: 'في التأنّي السلامة وفي العجلة الندامة', author: 'ثابت بن أوفى' },
    { text: 'وما لجرح إذا أرضاك من ألم', author: 'المتنبّي' },
    { text: 'إنّما الأمم الأخلاق ما بقيتْ فإن همُ ذهبتْ أخلاقُهم ذهبُوا', author: 'أحمد شوقي' },
    { text: 'لو أنّ الحياة تبقى لحيٍّ لعددتُ فيها جميع الأحياء أمواتاً', author: 'أبو العلاء المعرّي' },
    { text: 'خير جليسٍ في الأنام كتاب', author: 'المتنبّي' },
    { text: 'إنّ أفضل الإخوان من إذا استغنيتَ عنه لم يزداد أنفة، وإذا احتجتَ إليه لم يتغيّر', author: 'علي بن أبي طالب' }
];

// =====================================================
// Curated reading journeys
// =====================================================
const JOURNEYS = [
    {
        id: 'classics-arabic',
        title: 'جواهر الأدب العربي',
        description: 'رحلة في تراث الأدب العربي الخالد',
        icon: '📜',
        difficulty: 'متوسّط',
        durationWeeks: 8,
        bookSearchKeywords: ['ديوان', 'دلائل الإعجاز', 'أبو الطيّب', 'الجاحظ']
    },
    {
        id: 'islamic-foundations',
        title: 'أسس الفكر الإسلامي',
        description: 'للمبتدئين في فهم الدين',
        icon: '🕌',
        difficulty: 'مبتدئ',
        durationWeeks: 6,
        bookSearchKeywords: ['العقيدة الواسطية', 'علوم القرآن', 'رياض الصالحين']
    },
    {
        id: 'entrepreneurship-arabic',
        title: 'ريادة الأعمال للمبتدئين',
        description: 'من الفكرة إلى السوق',
        icon: '🚀',
        difficulty: 'مبتدئ',
        durationWeeks: 4,
        bookSearchKeywords: ['ريادة الأعمال', 'مشروع', 'التسويق']
    },
    {
        id: 'arab-mind-20c',
        title: 'العقل العربي في القرن العشرين',
        description: 'فلاسفة ومفكّرون غيّروا وجه الثقافة',
        icon: '🧠',
        difficulty: 'متقدّم',
        durationWeeks: 12,
        bookSearchKeywords: ['طه حسين', 'جبران', 'أركون', 'الجابري']
    }
];

// =====================================================
// API Routes
// =====================================================
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'المكتبة الطيبة API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/stats', async (_req, res) => {
    const books = await loadBooks();
    const byCategory = {};
    const bySource = {};
    let withCover = 0, withPdf = 0;
    for (const b of books) {
        byCategory[b.category] = (byCategory[b.category] || 0) + 1;
        bySource[b.source || 'sample'] = (bySource[b.source || 'sample'] || 0) + 1;
        if (b.cover) withCover++;
        if (b.pdf) withPdf++;
    }
    res.json({
        totalBooks: books.length,
        withCover,
        withPdf,
        categories: Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
        sources: Object.entries(bySource)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }))
    });
});

app.get('/api/categories', async (_req, res) => {
    const books = await loadBooks();
    const counts = {};
    for (const b of books) counts[b.category] = (counts[b.category] || 0) + 1;
    res.json(
        Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }))
    );
});

app.get('/api/books', async (req, res) => {
    const books = await loadBooks();
    const { q, category, source, sortBy = 'views', order = 'desc', limit = 50, offset = 0 } = req.query;

    let filtered = books;
    if (q) {
        const qLower = String(q).toLowerCase();
        filtered = filtered.filter(b =>
            (b.title || '').toLowerCase().includes(qLower) ||
            (b.author || '').toLowerCase().includes(qLower) ||
            (b.description || '').toLowerCase().includes(qLower)
        );
    }
    if (category) filtered = filtered.filter(b => b.category === category);
    if (source) filtered = filtered.filter(b => b.source === source);

    filtered.sort((a, b) => {
        const av = a[sortBy] || 0;
        const bv = b[sortBy] || 0;
        return order === 'asc' ? av - bv : bv - av;
    });

    const offsetNum = Math.max(0, Number(offset));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));

    res.json({
        total: filtered.length,
        offset: offsetNum,
        limit: limitNum,
        books: filtered.slice(offsetNum, offsetNum + limitNum)
    });
});

app.get('/api/books/random', async (_req, res) => {
    const books = await loadBooks();
    const withPdf = books.filter(b => b.pdf);
    if (!withPdf.length) return res.status(404).json({ error: 'No books available' });
    const book = withPdf[Math.floor(Math.random() * withPdf.length)];
    res.json(book);
});

app.get('/api/books/:id', async (req, res) => {
    const books = await loadBooks();
    const book = books.find(b => String(b.id) === String(req.params.id));
    if (!book) return res.status(404).json({ error: 'Book not found' });

    // Related books: same category, exclude self
    const related = books
        .filter(b => b.category === book.category && b.id !== book.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);

    res.json({ ...book, related });
});

app.get('/api/quote', (_req, res) => {
    // Daily quote: deterministic based on date
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const quote = QUOTES[dayOfYear % QUOTES.length];
    res.json({ ...quote, date: new Date().toISOString().slice(0, 10) });
});

app.get('/api/featured', async (_req, res) => {
    const books = await loadBooks();
    // Top by views, weighted by recency
    const featured = books
        .filter(b => b.pdf && b.cover)
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 20);
    res.json(featured);
});

app.get('/api/journeys', async (req, res) => {
    const books = await loadBooks();
    // For each journey, find matching books from keywords
    const journeys = JOURNEYS.map(j => {
        const matchedBooks = books.filter(b => {
            const haystack = (b.title + ' ' + b.author + ' ' + (b.description || '')).toLowerCase();
            return j.bookSearchKeywords.some(kw => haystack.includes(kw.toLowerCase()));
        }).slice(0, j.durationWeeks * 2);  // ~2 books per week
        return { ...j, bookCount: matchedBooks.length, books: matchedBooks.slice(0, 8) };
    });
    res.json(journeys);
});

// =====================================================
// Error handlers
// =====================================================
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error', message: err.message });
});

// =====================================================
// Startup
// =====================================================
await loadBooks(true);  // Preload
app.listen(PORT, () => {
    console.log(`┌────────────────────────────────┐`);
    console.log(`│  📚 المكتبة الطيبة API   │`);
    console.log(`│  Port: ${PORT}                       │`);
    console.log(`└────────────────────────────────┘`);
    console.log(`Endpoints:`);
    console.log(`  GET  /api/health`);
    console.log(`  GET  /api/stats`);
    console.log(`  GET  /api/categories`);
    console.log(`  GET  /api/books?q=...&category=...&limit=50&offset=0`);
    console.log(`  GET  /api/books/:id`);
    console.log(`  GET  /api/books/random`);
    console.log(`  GET  /api/quote`);
    console.log(`  GET  /api/featured`);
    console.log(`  GET  /api/journeys`);
});

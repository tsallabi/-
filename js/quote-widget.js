/**
 * Daily Quote Widget — يعرض اقتباس اليوم على الصفحة الرئيسيّة
 *
 * تجربة الإلهام المتجدّدة — كل يوم حكمة مختلفة.
 */

const DAILY_QUOTES = [
    { text: 'العلم في الصغر كالنقش في الحجر', author: 'الحسن البصري' },
    { text: 'الحكمة ضالّة المؤمن، فحيث وجدها فهو أحقّ بها', author: 'الحديث الشريف' },
    { text: 'إن للقلوب صدأً كصدأ الحديد، وجلاؤها الذكر وتلاوة القرآن', author: 'ابن تيمية' },
    { text: 'الكتاب في الوحدة صديق، وفي السفر رفيق', author: 'الجاحظ' },
    { text: 'في التأنّي السلامة وفي العجلة الندامة', author: 'ثابت بن أوفى' },
    { text: 'وما لجرح إذا أرضاك من ألم', author: 'المتنبّي' },
    { text: 'إنّما الأمم الأخلاق ما بقيتْ فإن همُ ذهبتْ أخلاقُهم ذهبُوا', author: 'أحمد شوقي' },
    { text: 'خير جليسٍ في الأنام كتاب', author: 'المتنبّي' },
    { text: 'إنّ أفضل الإخوان من إذا استغنيتَ عنه لم يزداد أنفة، وإذا احتجتَ إليه لم يتغيّر', author: 'علي بن أبي طالب' },
    { text: 'لو أنّ الحياة تبقى لحيٍّ لعددتُ فيها جميع الأحياء أمواتاً', author: 'أبو العلاء المعرّي' },
    { text: 'العقل للحكمة كالعين للرؤية', author: 'الفارابي' },
    { text: 'إنّ العلم أفضل من المال، إنّ العلم يحرسك وأنت تحرس المال', author: 'علي بن أبي طالب' },
    { text: 'الدنيا أربعة أشياء: علم وأدب، وصناعة، وتجارة', author: 'ابن خلدون' },
    { text: 'فلأجمعنّ علمًا في الصدور يدوم، ولأفتحنّ للجهلاء بابًا', author: 'الإمام الشافعي' }
];

function getDailyQuote() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function renderQuoteWidget(container) {
    if (!container) return;
    const quote = getDailyQuote();
    container.innerHTML = `
        <div class="daily-quote-card">
            <div class="quote-mark">❝</div>
            <p class="quote-text font-amiri">${quote.text}</p>
            <div class="quote-divider"></div>
            <p class="quote-author">— ${quote.author}</p>
        </div>
    `;
}

function injectQuoteStyles() {
    if (document.getElementById('quote-widget-styles')) return;
    const s = document.createElement('style');
    s.id = 'quote-widget-styles';
    s.textContent = `
        .daily-quote-card {
            background: var(--bg-elevated, #FFFEFA);
            border: 1px solid var(--gold-line, #B89968);
            border-radius: var(--radius-lg, 24px);
            padding: 2.5rem 2rem;
            text-align: center;
            position: relative;
            overflow: hidden;
            box-shadow: var(--shadow-md, 0 4px 12px rgba(15,27,45,.06));
            animation: fade-up 380ms cubic-bezier(.25,.8,.25,1) both;
        }
        .daily-quote-card::before {
            content: '';
            position: absolute; top: 0; left: 0; right: 0;
            height: 3px;
            background: linear-gradient(90deg, transparent 0%, var(--gold-line, #B89968) 50%, transparent 100%);
        }
        .daily-quote-card::after {
            content: '❞';
            position: absolute;
            bottom: 1rem; left: 1rem;
            font-size: 3rem;
            color: var(--gold-line, #B89968);
            opacity: .2;
            font-family: 'Aref Ruqaa', serif;
        }
        .quote-mark {
            font-size: 3rem;
            color: var(--gold-line, #B89968);
            opacity: .35;
            font-family: 'Aref Ruqaa', serif;
            line-height: 1;
            margin-bottom: .5rem;
        }
        .quote-text {
            font-family: 'Amiri', 'Aref Ruqaa', serif;
            font-size: clamp(1.2rem, 3vw, 1.65rem);
            line-height: 1.7;
            color: var(--text, #0F1B2D);
            margin: 0 0 1.5rem;
            font-weight: 600;
            position: relative;
            z-index: 1;
        }
        .quote-divider {
            width: 80px;
            height: 1px;
            background: var(--gold-line, #B89968);
            margin: 0 auto 1rem;
            opacity: .5;
        }
        .quote-author {
            font-family: 'Aref Ruqaa', serif;
            color: var(--text-muted, #4A5878);
            font-size: 1rem;
            margin: 0;
            font-weight: 600;
            letter-spacing: 0.02em;
        }
        @keyframes fade-up {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(s);
}

// Auto-inject on load
document.addEventListener('DOMContentLoaded', () => {
    injectQuoteStyles();
    const target = document.getElementById('dailyQuote');
    if (target) renderQuoteWidget(target);
});

window.QuoteWidget = { render: renderQuoteWidget, getQuote: getDailyQuote };

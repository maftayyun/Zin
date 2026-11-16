/* The fourth trial version's lessons («الجامعة») inside the site (version 5; see build.py). The site calls D4.show for a lesson
   of its path that is one of these, and D4.hide whenever it draws anything else. Nothing here judges: the checker only finds the
   exercise's words in a reading of a whole ayah, and the ear decides. */
window.D4 = (() => {
  const { D, $, esc, AR, CTX, LES, vName, lit, qt, glyph, parts } = Z, box = document.getElementById('d4');
  let T = null, cur = null, api = null, mode = '';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
  const I = {
    mic: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    stop: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
    play: (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
    ok: (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>`,
    both: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 5v14l8-7zM18 5v14"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  };
  const mark = s => qt(s).replace(/(بزمن\s*=\s*)(\(?\s*\d[^)]*\)\s*حرك\S*|حركة(?: واحدة)?\s*\+\s*بعض حركة|حركة واحدة|حركتان|\d+\s*حركات|حركة)/g, '$1<b>$2</b>').replace(/(لا تُلفظ)/g, '<b>$1</b>');
  // a letter's time as cells: one for each حركة, half for «بعض حركة», an empty one for a letter not said; «2 أو 4 أو 6»: two and four open
  const cellsOf = v => v === '2|4|6' ? '<i></i><i></i>' + '<i class="c-op"></i>'.repeat(4) : (n => n ? '<i></i>'.repeat(Math.floor(n)) + (n % 1 ? '<i class="c-hf"></i>' : '') : '<i class="c-z"></i>')(Number(v));
  function timeOf(x) {
    if (x.kind === 'verdict') return `<span class="d4-vd">${esc(x.ans)}</span>`;
    if (x.kind !== 'time' || x.v == null) return '';
    if (x.v.includes('+')) { const p = parts(glyph(x)), v = x.v.split('+');
      return `<span class="d4-tb" role="img" aria-label="${esc(vName(x.v))}"><span class="d4-g">${esc(p[0])}</span><span class="d4-cells">${cellsOf(v[0])}</span><span class="d4-g">${esc(p[1])}</span><span class="d4-cells">${cellsOf(v[1])}</span>${esc(vName(x.v))}</span>`; }
    return `<span class="d4-tb"><span class="d4-cells" role="img" aria-label="${esc(vName(x.v))}">${cellsOf(x.v)}</span>${esc(vName(x.v))}</span>`;
  }
  const said = x => { const s = Z.saidOf(x); return s ? `<span>${Z.saidLabel(x)}</span><span class="qq" lang="ar">${esc(s)}</span>` : ''; };
  const chip = x => x.ctx ? `<span class="d4-cx d4-${x.ctx}">${CTX[x.ctx]}</span>` : '';
  const litWord = x => lit(x.w, x.f, x.v === '0' ? 'gh' : '');
  // her examples, each in its ayah; the last whole ayah read bare, its word and letter shown after the reading
  function steps(L) {
    const all = Z.examples(L).filter(x => x.kind !== 'ayah'), k = all.map(x => !!(x.ay && !x.ay.part)).lastIndexOf(true);
    if (k < 1) return all;
    return all.filter((_, i) => i !== k).concat([Object.assign({}, all[k], { test: true })]);
  }
  const where = () => { const c = api.CHI[cur.ch]; return c && c.n ? 'الباب ' + AR(c.n) : 'المدخل'; };
  const tablesOf = id => Object.entries(window.D4MAP.t).filter(([, v]) => v === id).map(([k]) => Number(k));

  /* ---------- the lesson: her rule and her examples ---------- */
  function lesson() {
    const L = LES[cur.t4], ex = L.cases.map(c => c.items[0]), timed = ex.some(x => x.kind === 'time'), k = tablesOf(cur.t4)[0];
    box.innerHTML = `<div class="wrap d4-l">
      <p class="crumb"><a href="#map">الفهرس</a><span aria-hidden="true">/</span><a href="#c/${cur.ch}">${where()}</a><span aria-hidden="true">/</span><span>الدرس ${AR(cur.n)}</span></p>
      <h1 class="d4-h">${qt(L.title)}</h1>
      <div class="d4-rule">${Z.ruleLines(L).map(t => `<p>${mark(t)}</p>`).join('')}${cur.t4 === 'L0' ? `<p class="d4-u">${esc(D.unit)}</p>` : ''}</div>
      <div class="d4-tbl"><h2><span>${timed ? 'زمن الحرف المضيء' : 'الحرف المضيء'}</span>${timed ? '<span>الخانة = حركة</span>' : ''}</h2>
        ${ex.map(x => `<div class="d4-tr"><span class="d4-w" lang="ar">${litWord(x)}</span>${timeOf(x)}${chip(x) || said(x) ? `<div class="d4-sub">${chip(x)}${said(x)}</div>` : ''}</div>`).join('')}
        ${k != null ? `<a class="lnk d4-all" href="#c/${cur.ch}/tb${k}">الجدول كاملًا، بأمثلته كلها</a>` : ''}</div>
      <div class="d4-go"><a class="btn pri" href="#l/${cur.ch}/${cur.n}/p">${I.mic}اسمع القارئ واقرأ بعده</a><small>${AR(steps(L).length)} آيات، آخرها بلا علامات</small></div>
    </div>`;
  }

  /* ---------- reading after the reader ---------- */
  function track(pk, max, c, zones) {
    const len = pk ? pk.to - pk.from : 0, w = pk && max ? Math.max(12, Math.round(100 * len / max)) : 100;
    return `<div class="d4-wv"><div style="width:${w}%">${Z.wave(pk, { n: Math.max(10, Math.round(50 * w / 100)), h: 34, bw: 3, gap: 2, c, zones })}</div></div>`;
  }
  function heard(x) {
    if (!T.rec) return '';
    const rd = T.reader(), rpk = rd ? T.readerPk() : null, mpk = T.rec.pk, find = Z.canLocate(x);
    const max = Math.max(rpk ? rpk.to - rpk.from : 0, mpk ? mpk.to - mpk.from : 0), ac = css('--brand'), dim = css('--line-2');
    return `<div class="d4-ear">
        <div class="d4-tk">${rd ? `<b>${x.recited ? 'المنشاوي' : 'القارئ'}</b>${track(rpk, max, css('--ink-3'))}` : ''}<b>تلاوتك</b>${track(mpk, max, T.span ? dim : ac, T.span ? [{ a: T.span[0], b: T.span[1], c: ac }] : [])}</div>
        <p>${rd ? 'اسمع القارئ ثم صوتك: هل قرأتَ مثله؟' : 'اسمع صوتك، وقابله بالقاعدة: هل أصبتَ؟'}</p>
        <div class="d4-acts">${rd ? `<button type="button" class="btn" data-d4="both">${I.both}اسمع الصوتين</button>` : ''}
          <button type="button" class="btn" data-d4="mine"${rd ? '' : ' style="grid-column:1/-1"'}>${I.play()}${T.span ? 'الكلمة من تلاوتك' : 'تلاوتك'}</button>
          <button type="button" class="btn pri d4-y" data-d4="ok">${I.ok()}أصبتُ</button></div>
        ${T.finding ? '<p class="d4-small" role="status">يبحث الفاحص عن الكلمة في تلاوتك…</p>' : T.err ? `<p class="d4-small">${esc(Z.errText(T.err))} فاسمع تلاوتك كاملة.</p>` : T.looked && !T.span ? '<p class="d4-small">لم يجد الفاحص الكلمة في تلاوتك، فاسمعها كاملة.</p>' : ''}
        ${find ? '<p class="d4-small">الفاحص هنا يجد موضع الكلمة في تلاوتك فقط، ولا يحكم عليها.</p>' : ''}</div>`;
  }
  function draw() {
    if (mode !== 'p' || !T) return;
    const x = T.cur(), n = T.items.length;
    if (T.end) {
      api.lesMark(cur.ch, cur.n);
      const ls = api.lessons(cur.ch), nx = ls[cur.n];
      box.innerHTML = `<div class="wrap d4-end"><span class="d4-ok">${I.ok(40)}</span><h1>أتممتَ الدرس</h1><p>${qt(LES[cur.t4].title)}</p>
        ${nx ? `<a class="btn pri" href="#l/${cur.ch}/${nx.n}">الدرس التالي</a>` : ''}<a class="lnk" href="#c/${cur.ch}">إلى دروس الباب</a></div>`;
      T = null; return;
    }
    const bare = x.test && !T.rec, text = x.ay ? (bare ? esc(x.ay.text) : Z.ayahLit(x)) : litWord(x), len = (x.ay ? x.ay.text : x.w).length, rd = T.reader();
    box.innerHTML = `<div class="wrap d4-p">
      <div class="d4-top"><a class="d4-x" href="#l/${cur.ch}/${cur.n}" aria-label="رجوع إلى الدرس">${I.back}</a><b>الدرس ${AR(cur.n)}</b><span>${AR(T.i + 1)} من ${AR(n)}</span>
        <div class="d4-pr" aria-hidden="true"><i style="width:${Math.round(100 * (T.i + 1) / n)}%"></i></div></div>
      ${x.test ? `<div class="d4-test">${bare ? 'الأخيرة: اقرأ الآية وليس عليها علامة، ثم تظهر الكلمة وحرفها.' : 'هذه الكلمة وحرفها: هل قرأتَها على القاعدة؟'}</div>` : ''}
      <p class="d4-how">${x.ay ? Z.ayahLabel(x) : 'اقرأ'}${bare ? '' : chip(x)}</p>
      <p class="d4-ay${len > 60 ? ' d4-long' : ''}" lang="ar">${text}</p>
      ${bare || !(timeOf(x) || said(x)) ? '' : `<div class="d4-place"><span class="qq" lang="ar"><em>${esc(glyph(x))}</em></span>${timeOf(x)}${said(x)}</div>`}
      ${bare ? '<div class="d4-nor">تسمع القارئ بعد أن تقرأ.</div>' : rd ? `<div class="d4-pl"><button type="button" class="d4-pb" data-d4="rd" aria-label="اسمع القارئ">${I.play(15)}</button><span class="d4-who">اسمع القارئ<small>${x.recited ? Z.TMP : 'القارئ'}</small></span></div>`
        : '<div class="d4-nor">لم يُسجَّل صوت القارئ لهذا المثال بعد. اقرأه أنت، وقابله بالقاعدة.</div>'}
      ${T.on ? '<div class="d4-recng" role="status"><i></i>يُسجَّل الآن. اقرأ ثم أوقف.</div>' : ''}
      ${T.msg ? `<div class="d4-nor" role="alert">${esc(T.msg)}</div>` : ''}
      ${!Z.canRec ? '<div class="d4-nor">هذا المتصفح لا يسجّل الصوت. افتح الصفحة في Safari أو Chrome.</div>' : ''}
      ${heard(x)}
      <div class="d4-dock"><button type="button" class="btn pri d4-cta${T.on ? ' d4-on' : ''}" data-d4="mic" data-mic>${T.on ? I.stop + 'أوقف' : I.mic + (T.rec ? 'اقرأ مرة أخرى' : 'اقرأ')}</button><button type="button" class="btn" data-d4="next" data-next>${T.i + 1 < n ? 'التالية' : 'أنهِ الدرس'}</button></div>
    </div>`;
  }

  function show(l, practice, a) {
    api = a; cur = l; mode = practice ? 'p' : 'l'; box.style.display = '';
    if (practice) { if (!T || T.L !== LES[l.t4]) { T = Z.sitting(LES[l.t4], steps(LES[l.t4]), draw, { ear: true }); T.n = 50; T.load(); } draw(); }
    else lesson();
    window.scrollTo(0, 0);
  }
  function hide() { mode = ''; box.style.display = 'none'; Z.stop(); if (T && T.on) T.mic(); T = null; box.innerHTML = ''; }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-d4]'); if (!b || !T) return;
    const k = b.dataset.d4;
    if (k === 'rd') return Z.play(T.reader());
    if (k === 'mic') return T.mic();
    if (k === 'mine') return T.span ? Z.play(T.rec.url, { from: Math.max(0, T.span[0] - .15), to: T.span[1] + .2 }) : Z.play(T.rec.url);
    if (k === 'both') return Z.playBoth(T.reader(), T.rec.url);
    if (k === 'ok' || k === 'next') return T.next();
  });
  window.__t = () => T;
  return { show, hide };
})();

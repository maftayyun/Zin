/* Version 5: the reader and the checker inside every exercise of a lesson (the owner, 18 November 2026: «ضمن كل تمرين وليس
   في مكان منفصل»). Once an exercise is answered, under its card: the exercise's word in its ayah, al-Minshawi reading it
   (murattal), the learner reading it, comparing by ear, then the checker: the order of the council of ten (the reader first,
   the learner's own judgement before the checker's), the checker on the device alone (Quran Lab's model; nothing is sent).
   The words: the trial examples (data.js, ayat.js) and the site's own exercise words (ayat-site.js, site_ayat.py). The site's
   lesson flow calls D5.sync from lsAct, whenever its one button is drawn. */
window.D5 = (() => {
  const { D, esc, AR, CTX } = Z;
  const I = {
    mic: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    stop: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    ok: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  };
  const N = s => String(s || '').normalize('NFC').replace(/ـ/g, '').replace(/\s+/g, ' ').trim();

  /* every word that can be read in its ayah: the trial examples first (they carry the reader's own word and the lesson's rule),
     then the site's words; by context and word, and by word alone */
  const BY = {}, ANY = {};
  const put = (x, ctx = x.ctx, w = x.w) => { const k = (ctx || '') + '|' + N(w); if (!BY[k]) BY[k] = x; (ANY[N(w)] = ANY[N(w)] || []).push(x); };
  D.lessons.forEach(L => L.cases.forEach(c => c.items.forEach(x => { if (x.kind !== 'ayah' && (x.ay || x.zf || x.au)) put(x); })));
  Object.entries(window.AYAT_SITE || {}).forEach(([k, a]) => {
    const i = k.indexOf('|'), ctx = k.slice(0, i), w = k.slice(i + 1);
    if (BY[ctx + '|' + N(w)]) return;
    // the book's «a word, then how it is said stopped» is read as its first word, stopped (site_ayat.py keeps it so in a.x)
    const o = a.x || {}, x = { w: o.w || w, ctx: o.ctx != null ? o.ctx : ctx, f: o.f || null, kind: o.kind || '', v: o.v || null, ay: a, site: true };
    if (a.forms) { x.zf = a.forms; x.chk = ['zf', x.ctx]; }
    if (a.src && !a.part) { x.au = 'a:' + a.s + ':' + a.a; D.audio[x.au] = a.src; x.recited = true; }
    put(x, ctx, w);
  });

  // the words an exercise is about, as its cards and table rows write them
  function wordsOf(s, L, api) {
    const out = [], add = (ctx, w) => { if (w) out.push([ctx || '', w]); };
    // a row's words: its example cell first, then the others (a table of letters puts the letter alone in its first cell)
    const qs = cell => cell ? cell.lines.flat().filter(u => u.k === 'q').map(u => u.t) : [];
    const rowWords = (k, r, c) => { const R = api.T[k] && api.T[k].rows[r]; if (!R) return []; return (c != null ? qs(R[c]) : []).concat(...R.map(qs)); };
    const cards = [s.c, s.q && s.q.card, s.cm, s.a, s.b].concat(s.vd || [], (s.items || []).map(i => i.c || (i.q && i.q.card))).filter(Boolean);
    cards.forEach(c => (c.ex || []).forEach(w => add(c.ctx, w)));
    cards.forEach(c => { if (c.k != null && c.r != null) rowWords(c.k, c.r, c.c).forEach(w => add(c.ctx, w)); });
    if (s.f && s.f.k != null) rowWords(s.f.k, s.f.r).forEach(w => add('', w));
    if (s.k != null && s.r != null) rowWords(s.k, s.r).forEach(w => add('', w));
    (s.pr || []).forEach(p => add('', p[0][0]));
    // a game over several words (sort): its lesson's table, row by row
    if (!out.length && L.k != null && api.T[L.k]) api.T[L.k].rows.slice(1).forEach((_, r) => rowWords(L.k, r + 1).forEach(w => add('', w)));
    return out;
  }
  // the reading of an exercise: its own context first, al-Minshawi's ayah before one to record alone
  function itemFor(ws) {
    const tries = [ws.map(([c, w]) => BY[c + '|' + N(w)]), ws.flatMap(([, w]) => ANY[N(w)] || [])].map(a => a.filter(Boolean));
    for (const pool of tries) { const x = pool.find(x => x.au && D.audio[x.au]) || pool.find(x => x.zf); if (x) return x; }
    return null;
  }
  // the exercises, once the rule is taught (a guess before the teaching is not one of them)
  const READS = new Set(['worked', 'contrast', 'look', 'free', 'q', 'review', 'find', 'sort', 'beads', 'pairs', 'self']);

  let T = null, key = '', x = null;
  function sync(LS, ready, api) {
    const s = LS && LS.steps[LS.i], sec = document.querySelector('.lsf-st.cur'), card = sec && sec.querySelector('.card.ls');
    const k = LS ? LS.L.ch + '/' + LS.L.n + '/' + LS.i : '';
    if (k !== key) {
      if (T && T.on) T.mic(); Z.stop();
      key = k; T = null; x = null;
      if (s && READS.has(s.t)) { x = itemFor(wordsOf(s, LS.L, api)); if (x) { T = Z.sitting({ id: 'd5' }, [x], draw); T.n = 46; T.load(); } }
    }
    if (!T || !card) return;
    // answered: the step's own button goes on to the next step (not the worked example's next stage); then it stays open
    const p = card.querySelector('.lsf-px');
    T.ready = T.ready || (ready && (!p || p.dataset.ls === 'next' || p.tagName === 'A'));
    if (!T.ready) { const old = document.getElementById('d5'); if (old) old.remove(); return; }
    if (!document.getElementById('d5')) { const d = document.createElement('div'); d.id = 'd5'; d.className = 'd5'; card.after(d); draw(); }
  }

  function steps() {
    const rd = !!T.reader(), chk = !!x.zf && Z.S().zf !== -1;
    const st = (rd ? [['اسمع', T.heard || !!T.rec]] : []).concat([['اقرأ', !!T.rec], ['قارن', !!T.self]], chk ? [['الفحص', !!T.self && !!T.res]] : []);
    const now = st.findIndex(([, d]) => !d);
    return `<ol class="d4-steps" aria-label="خطوات القراءة">${st.map(([t, d], i) => `<li class="${d ? 'd4-done' : i === now ? 'd4-now' : ''}"${i === now ? ' aria-current="step"' : ''}><i>${d ? I.ok : AR(i + 1)}</i>${t}</li>`).join('')}</ol>`;
  }
  function draw() {
    const box = document.getElementById('d5'); if (!box || !T) return;
    const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.d4 : '';
    const rd = !!T.reader(), chip = x.ctx ? `<span class="d4-cx d4-${x.ctx}">${CTX[x.ctx]}</span>` : '';
    const text = x.ay ? Z.ayahLit(x) : esc(x.w), long = (x.ay ? x.ay.text : x.w).length > 60;
    const mic = T.on ? `<button type="button" class="btn pri d4-on" data-d4="mic">${I.stop}أوقف</button>`
      : `<button type="button" class="btn${rd && !T.heard && !T.rec ? '' : ' pri'}" data-d4="mic">${I.mic}${T.rec ? 'اقرأ مرة أخرى' : 'اقرأ'}</button>`;
    box.innerHTML = `<div class="d5-h"><b>اقرأها في آيتها</b>${chip}</div>
      ${steps()}
      <p class="d4-how">${x.ay ? Z.ayahLabel(x) : 'اقرأ'}</p>
      <p class="d4-ay d4-sm${long ? ' d4-long' : ''}" lang="ar">${text}</p>
      <div class="d4-lis">${rd ? `<button type="button" class="btn${T.heard || T.rec ? '' : ' pri'}" data-d4="rd">${I.play}اسمع المنشاوي<small>${esc(Z.TMP)}</small></button>` : ''}${mic}</div>
      ${!rd ? '<p class="d4-nor">لم يُسجَّل المنشاوي لهذه القراءة. اقرأها أنت، وقابلها بالقاعدة.</p>' : ''}
      ${T.on ? '<div class="d4-recng" role="status"><i></i><span>يُسجَّل الآن. اقرأ ثم أوقف.</span><span class="d4-sec" data-zsec></span><span class="d4-lv" data-zlv aria-hidden="true"><b></b></span></div>' : ''}
      ${T.msg ? `<div class="d4-nor" role="alert">${esc(T.msg)}</div>` : ''}
      ${!Z.canRec ? '<div class="d4-nor">هذا المتصفح لا يسجّل الصوت. افتح الصفحة في Safari أو Chrome.</div>' : ''}
      ${D4.ear(x, T)}`;
    if (f) { const e = box.querySelector(`[data-d4="${f}"]`); if (e) e.focus({ preventScroll: true }); }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#d5 [data-d4]'); if (!b || !T) return;
    const k = b.dataset.d4;
    if (k === 'rd') { T.heard = true; draw(); return Z.play(T.reader()); }
    if (k === 'mic') { if (!T.on) { T.self = null; T.ans = null; } return T.mic(); }
    if (k === 'mine') return Z.play(T.rec.url);
    if (k === 'both') { T.heard = true; return Z.playBoth(T.reader() || T.rec.url, T.rec.url); }
    if (k.startsWith('a-')) {
      T.ans = k.slice(2); T.self = T.ans === 'same' ? 'ok' : 'again'; D4.keepRead(x, T.self, (key.split('/')[0]) || ''); draw();
      const v = document.querySelector('#d5 .d4-chk'); if (v) v.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    if (k === 'zon') { Z.setCheck(true); if (T.rec && x.chk) T.check(); return draw(); }
  });
  window.__d5 = () => ({ T, x, key });
  // whether an exercise has a reading under it (for the tests: window.__zin carries T and cellText)
  const has = (s, L, api) => !!(s && READS.has(s.t) && itemFor(wordsOf(s, L, api)));
  return { sync, has };
})();

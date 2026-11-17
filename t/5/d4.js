/* The fourth trial version's practice («الجامعة») inside the site (version 5; see build.py): after a lesson of the site drawn
   from a table, the site calls D4.show for its practice (…/p), D4.sada for «صدى» and D4.halqa for «دفتر الحلقة»; D4.hide
   whenever it draws anything else. The reading follows the council of ten (17 November 2026): the reader's word first, then the
   learner reads, then compares by ear and answers, and only then the checker, on the device alone (nothing is sent). */
window.D4 = (() => {
  const { D, $, esc, AR, CTX, LES, vName, lit, qt, glyph, parts } = Z, box = document.getElementById('d4');
  let T = null, cur = null, api = null, mode = '', inLesson = null;   // inLesson: the site's lesson this reading is a step of
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
  /* the examples of the site's lesson: those of the trial lesson that are in the lesson's own table (a trial lesson can hold
     several tables, each a lesson of the site), a case after a case as the trial versions take them, eight at most */
  const BARE = t => String(t || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s*]/g, '');
  function examplesOf(L, k) {
    if (k == null || !api.T[k]) return Z.examples(L);
    const text = BARE(api.T[k].rows.slice(1).map(R => R.map(api.cellText).join(' ')).join(' '));
    const cs = L.cases.map(c => c.items.filter(x => text.includes(BARE(x.w)))).filter(c => c.length);
    if (!cs.length) return Z.examples(L);
    const out = [], n = Math.max(...cs.map(c => c.length));
    for (let i = 0; i < n; i++) cs.forEach(c => { if (c[i]) out.push(c[i]); });
    return out.slice(0, 8);
  }
  function steps(L, k) {
    const all = examplesOf(L, k).filter(x => x.kind !== 'ayah'), at = all.map(x => !!(x.ay && !x.ay.part)).lastIndexOf(true);
    if (at < 1) return all;
    return all.filter((_, i) => i !== at).concat([Object.assign({}, all[at], { test: true })]);
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
      <div class="d4-tbl"><h2><span>${timed ? 'زمن الحرف المضيء' : 'الحرف المضيء'}</span>${timed ? '<span>الخرزة = حركة</span>' : ''}</h2>
        ${ex.map(x => `<div class="d4-tr"><span class="d4-w" lang="ar">${litWord(x)}</span>${timeOf(x)}${chip(x) || said(x) ? `<div class="d4-sub">${chip(x)}${said(x)}</div>` : ''}</div>`).join('')}
        ${k != null ? `<a class="lnk d4-all" href="#c/${cur.ch}/tb${k}">الجدول كاملًا، بأمثلته كلها</a>` : ''}</div>
      <div class="d4-go"><a class="btn pri" href="#l/${cur.ch}/${cur.n}/p">${I.mic}اسمع القارئ واقرأ بعده</a><small>${AR(steps(L, cur.k).length)} آيات، آخرها بلا علامات</small></div>
    </div>`;
  }

  /* ---------- what the learner read, kept on this device: their own answer for each example, and when it comes back ---------- */
  const RK = 'zin5.reads', IV = [0, 1, 3, 7, 14, 30];
  const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dkey(new Date());
  const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dkey(new Date(y, m - 1, d + n)); };
  let R = { r: {}, days: [] };
  try { R = Object.assign({ r: {}, days: [] }, JSON.parse(localStorage.getItem(RK) || '{}')); } catch (e) {}
  const keepR = () => { try { localStorage.setItem(RK, JSON.stringify(R)); } catch (e) {} };
  const rkey = x => (x.ctx || '') + '|' + x.w;
  /* «ok»: read like the reader, by the learner's own ear; «again»: not yet; «skip»: passed over. The box rises only on its day and
     once a day (the council's rule for spaced review); not yet comes back the next day, a skip the same day */
  function keepRead(x, how) {
    const k = rkey(x), o = R.r[k] || { b: 0, n: 0 }, now = today();
    if (how === 'ok') { if ((!o.due || o.due <= now) && o.t !== now) o.b = Math.min(5, (o.b || 0) + 1); o.due = addDays(now, IV[o.b] || 1); }
    else if (how === 'again') { o.b = 0; o.due = addDays(now, 1); }
    else { o.due = now; }
    Object.assign(o, { last: how, n: (o.n || 0) + 1, t: now, ch: cur.ch, w: x.w, ctx: x.ctx || '', ay: x.ay ? [x.ay.sura, x.ay.a] : null });
    if (how === 'again') delete o.taught;
    R.r[k] = o;
    if (how !== 'skip' && !R.days.includes(now)) R.days.push(now);
    keepR();
  }
  const dueReads = () => Object.values(R.r).filter(o => o.due && o.due <= today()).length;

  /* ---------- reading after the reader ---------- */
  function track(pk, max, c, zones) {
    const len = pk ? pk.to - pk.from : 0, w = pk && max ? Math.max(12, Math.round(100 * len / max)) : 100;
    return `<div class="d4-wv"><div style="width:${w}%">${Z.wave(pk, { n: Math.max(10, Math.round(50 * w / 100)), h: 34, bw: 3, gap: 2, c, zones })}</div></div>`;
  }
  // the reader's word: the site's reader saying it alone where recorded, else the ayah
  const wordUrl = x => x.wau && D.audio[x.wau] ? D.audio[x.wau] : '';
  const refUrl = x => wordUrl(x) || T.reader();
  /* the madd: the device's timing separates a short madd from a long one and no more (by this method al-Minshawi's natural madd
     came out 1.3 to 2.0 harakat and his joined and separated ones 4.3 to 9.4, over 605 of his madds), so it says short or long;
     four or six is left to the ear until it is measured on readers with known mistakes */
  const LONG = 3.2;
  function maddSay(x, m) {
    if (m.count == null) return ['neu', 'لم يتبيّن الفاحص المدّ في التسجيل: اسمع الصوتين.'];
    if (x.v === '2|4|6') return ['neu', 'يجوز في هذا المدّ حركتان أو أربع أو ست، فقابله بمدّ القارئ.'];
    if (x.v === '2') return m.count > LONG ? ['warn', 'يبدو المدّ أطول من حركتين.'] : ['neu', 'يبدو المدّ قصيرًا، بحركتين.'];
    return m.count < LONG ? ['warn', `يبدو المدّ أقصر من القاعدة: ${esc(vName(x.v))}.`] : ['neu', 'يبدو المدّ ممدودًا. أمّا مقداره فلا يميّزه الفاحص بعد: قابله بمدّ القارئ.'];
  }
  /* the checker's word, after the learner's own: one line for each thing asked, none of them green, for none is measured yet on
     readings with known mistakes (the council: a verdict shows only where its accuracy is known); unsure is said */
  function verdict(x) {
    const head = '<b>الفاحص</b>', note = `<p class="d4-ai">${esc(Z.NOTE)}</p>`;
    if (!x.zf) return `<div class="d4-chk">${head}<p>${esc(Z.errText({ local: true }))} فالحكم هنا لأذنك.</p></div>`;
    if (Z.S().zf === -1) return `<div class="d4-chk">${head}<p>اخترتَ أن تحكم بأذنك.</p><button type="button" class="lnk d4-zon" data-d4="zon">افحص على جهازي</button></div>`;
    if (T.busy) return `<div class="d4-chk" role="status">${head}<p>يسمع الفاحص تلاوتك…</p></div>`;
    if (T.err) return `<div class="d4-chk" role="status">${head}<p>${esc(Z.errText(T.err))}</p></div>`;
    if (!T.res) return '';
    const h = Z.heard(x, T.res), out = [], g = `<span class="qq">${esc(glyph(x))}</span>`;
    if (!h.is) out.push(['warn', 'لا يبدو أن التسجيل لهذه الكلمات. اقرأها كما في الآية، ثم أعد.']);
    else {
      if (x.ctx && h.h && h.h !== 'same' && CTX[h.h]) {
        if (!h.sure) out.push(['neu', 'لم أتأكد أوصلتَ أم وقفتَ: اسمع الصوتين.']);
        else if (h.ok) out.push(['neu', `يبدو أنك قرأتها ${CTX[h.h]}، كالمطلوب.`]);
        else out.push(['warn', `يبدو أنك قرأتها ${CTX[h.h]}، والمطلوب ${CTX[x.ctx]}.`]);
      }
      const m = T.res.madd; if (Z.maddOf(x) && m) out.push(maddSay(x, m));
      const q = T.res.qalq;
      if (Z.qalqOf(x) && q && q.heard != null) out.push(q.heard ? ['neu', `يبدو أنك أظهرتَ القلقلة في ${g}.`] : ['warn', `لم يسمع الفاحص القلقلة في ${g}: أظهِر اهتزاز الحرف، ثم اسمع القارئ.`]);
      if (!out.length) out.push(['neu', 'سمع الفاحص كلمات المثال. وما سوى ذلك لأذنك: اسمع الصوتين.']);
    }
    const m = T.res.madd, det = [];
    if (m && m.count != null) det.push(`المدّ نحو ${Z.num(Math.round(m.count * 2) / 2)} حركة، والحركة زمن حرف بحركته في قراءتك${m.own ? '' : ' السابقة'}.`);
    if (h.is && h.ms) det.push(`زمن ${g} نحو ${AR(Math.round(h.ms / 10) * 10)} ملّي ثانية.`);
    det.push('سمعها نموذج Quran Lab على جهازك، ولم يُرسَل التسجيل إلى أحد.');
    return `<div class="d4-chk" role="status">${head}${out.map(([st, t]) => `<p class="d4-v d4-${st}"><i aria-hidden="true">${st === 'warn' ? '!' : ''}</i><span>${t}</span></p>`).join('')}
      <details class="d4-det"><summary>تفصيل</summary>${det.map(t => `<p>${t}</p>`).join('')}</details>${note}</div>`;
  }
  // after a reading: the two voices, the learner's own answer first, then the checker
  function ear(x) {
    if (!T.rec) return '';
    const rd = !!refUrl(x), rpk = rd && !wordUrl(x) ? T.readerPk() : null, mpk = T.rec.pk;
    const max = Math.max(rpk ? rpk.to - rpk.from : 0, mpk ? mpk.to - mpk.from : 0);
    const md = rd && Z.maddOf(x);
    const ask = !rd ? 'اسمع صوتك، وقابله بالقاعدة: هل قرأتَها عليها؟' : md ? 'اسمع القارئ ثم صوتك: مدّك أقصر من مدّه، أم مثله، أم أطول؟' : 'اسمع القارئ ثم صوتك: هل قرأتَها مثله؟';
    const ans = md ? [['short', 'أقصر'], ['same', 'مثله'], ['long', 'أطول']] : [['same', rd ? 'قرأتُها مثله' : 'قرأتُها عليها'], ['again', 'ليس بعد']];
    return `<div class="d4-ear">
        <div class="d4-tk">${rpk ? `<b>${x.recited ? 'المنشاوي' : 'القارئ'}</b>${track(rpk, max, css('--ink-3'))}` : ''}<b>تلاوتك</b>${track(mpk, max, css('--brand'))}</div>
        <div class="d4-acts">${rd ? `<button type="button" class="btn" data-d4="both">${I.both}${wordUrl(x) ? 'الكلمة: القارئ، ثم أنت' : 'القارئ، ثم أنت'}</button>` : ''}
          <button type="button" class="btn" data-d4="mine"${rd ? '' : ' style="grid-column:1/-1"'}>${I.play()}تلاوتك</button></div>
        <p class="d4-ask">${ask}</p>
        <div class="d4-ans${ans.length === 3 ? ' d4-3' : ''}" role="group" aria-label="جوابك">${ans.map(([k, t]) => `<button type="button" class="btn${T.ans === k ? ' d4-sel' : ''}" data-d4="a-${k}" aria-pressed="${T.ans === k}">${t}</button>`).join('')}</div>
        ${T.self ? verdict(x) : ''}</div>`;
  }
  // focus stays where it was when the screen is drawn again (keyboard and screen readers)
  const focused = () => { const a = document.activeElement; return a && box.contains(a) && a.dataset && a.dataset.d4 ? a.dataset.d4 : ''; };
  const refocus = f => { if (!f) return; const e = box.querySelector(`[data-d4="${f}"]`) || box.querySelector('.d4-dock [data-d4]'); if (e) e.focus({ preventScroll: true }); };
  const endWord = () => cur.sada ? 'أنهِ الوِرد' : inLesson ? 'إلى الخلاصة' : 'أنهِ الدرس';
  function draw() {
    if ((mode !== 'p' && mode !== 'sada') || !T) return;
    const f = focused(), x = T.cur(), n = T.items.length;
    if (T.end && cur.sada) {
      const d = dueReads();
      box.innerHTML = `<div class="wrap d4-end"><span class="d4-ok">${I.ok(40)}</span><h1>انتهى وِرد صدى</h1><p>قرأتَ ${AR(n)} من الآيات بعد القارئ.${d ? ` ويعود إليك اليوم ${AR(d)}.` : ''}</p>
        <button type="button" class="btn pri" data-d4="more">وِرد آخر</button><a class="lnk" href="#halqa">دفتر الحلقة</a><a class="lnk" href="#sada">اختر بابًا</a></div>`;
      T = null; return;
    }
    if (T.end && inLesson) { const go = inLesson.done; T = null; setTimeout(go, 0); return; }
    if (T.end) {
      api.lesMark(cur.ch, cur.n);
      const ls = api.lessons(cur.ch), nx = ls[cur.n];
      box.innerHTML = `<div class="wrap d4-end"><span class="d4-ok">${I.ok(40)}</span><h1>أتممتَ الدرس</h1><p>${qt(LES[cur.t4].title)}</p>
        ${nx ? `<a class="btn pri" href="#l/${cur.ch}/${nx.n}">الدرس التالي</a>` : ''}<a class="lnk" href="#halqa">دفتر الحلقة</a><a class="lnk" href="#c/${cur.ch}">إلى دروس الباب</a></div>`;
      T = null; return;
    }
    const bare = x.test && !T.rec, text = x.ay ? (bare ? esc(x.ay.text) : Z.ayahLit(x)) : litWord(x), len = (x.ay ? x.ay.text : x.w).length;
    const rd = !!T.reader(), wd = !!wordUrl(x), last = T.i + 1 >= n, echo = T.echo && T.echo.i === T.i && T.echo.until > Date.now();
    const place = bare || !(timeOf(x) || said(x)) ? '' : `<div class="d4-place"><span class="qq" lang="ar"><em>${esc(glyph(x))}</em></span>${timeOf(x)}${said(x)}</div>`;
    // the word large with its letter lit, the reader's word beside it; the ayah under it
    const word = !bare && x.ay ? `<div class="d4-wc"><p class="d4-big" lang="ar">${litWord(x)}</p>${place}</div>` : place;
    const listen = bare ? '<div class="d4-nor">تسمع القارئ بعد أن تقرأ.</div>'
      : rd || wd ? `<div class="d4-lis">${wd ? `<button type="button" class="btn pri" data-d4="wd">${I.play(15)}اسمع الكلمة</button>` : ''}${rd ? `<button type="button" class="btn${wd ? '' : ' pri'}" data-d4="rd">${I.play(15)}${wd ? 'اسمع الآية' : 'اسمع القارئ'}<small>${x.recited ? Z.TMP : 'القارئ'}</small></button>` : ''}</div>
        ${echo ? `<div class="d4-echo" aria-live="polite"><span>ردّد الآن</span><i style="animation-duration:${T.echo.dur.toFixed(2)}s"></i></div>` : ''}`
      : '<div class="d4-nor">لم يُسجَّل صوت القارئ لهذا المثال بعد. اقرأه أنت، وقابله بالقاعدة.</div>';
    const main = T.on ? `<button type="button" class="btn pri d4-cta d4-on" data-d4="mic" data-mic>${I.stop}أوقف</button>`
      : !T.rec ? `<button type="button" class="btn pri d4-cta" data-d4="mic" data-mic>${I.mic}اقرأ</button>`
      : !T.self ? `<button type="button" class="btn d4-cta" data-d4="mic" data-mic>${I.mic}اقرأ مرة أخرى</button>`
      : T.self === 'ok' ? `<button type="button" class="btn pri d4-cta" data-d4="next" data-next>${last ? endWord() : 'التالية'}</button><button type="button" class="btn" data-d4="mic" data-mic>${I.mic}مرة أخرى</button>`
      : `<button type="button" class="btn pri d4-cta" data-d4="redo">${I.play(15)}اسمع واقرأ مرة أخرى</button><button type="button" class="btn" data-d4="next" data-next>${last ? endWord() : 'التالية'}</button>`;
    box.innerHTML = `<div class="wrap d4-p">
      <div class="d4-top">${cur.sada ? `<a class="d4-x" href="#sada" aria-label="رجوع إلى صدى">${I.back}</a><b>صدى</b>` : `<a class="d4-x" href="#c/${cur.ch}" aria-label="رجوع إلى دروس الباب">${I.back}</a><b>الدرس ${AR(cur.n)}${inLesson ? '، اقرأ مع القارئ' : ''}</b>`}<span>${AR(T.i + 1)} من ${AR(n)}</span>
        <div class="d4-pr" aria-hidden="true"><i style="width:${Math.round(100 * (T.i + 1) / n)}%"></i></div></div>
      ${bare ? '' : track3(x)}
      ${x.test ? `<div class="d4-test">${bare ? 'الأخيرة: اقرأ الآية وليس عليها علامة، ثم تظهر الكلمة وحرفها.' : 'هذه الكلمة وحرفها: هل قرأتَها على القاعدة؟'}</div>` : ''}
      ${word}${listen}
      <p class="d4-how">${x.ay ? Z.ayahLabel(x) : 'اقرأ'}${bare ? '' : chip(x)}</p>
      <p class="d4-ay${x.ay && !bare ? ' d4-sm' : ''}${len > 60 ? ' d4-long' : ''}" lang="ar">${text}</p>
      ${T.on ? '<div class="d4-recng" role="status"><i></i><span>يُسجَّل الآن. اقرأ ثم أوقف.</span><span class="d4-sec" data-zsec></span><span class="d4-lv" data-zlv aria-hidden="true"><b></b></span></div>' : ''}
      ${T.msg ? `<div class="d4-nor" role="alert">${esc(T.msg)}</div>` : ''}
      ${!Z.canRec ? '<div class="d4-nor">هذا المتصفح لا يسجّل الصوت. افتح الصفحة في Safari أو Chrome.</div>' : ''}
      ${ear(x)}
      <div class="d4-dock">${main}</div>
      ${!T.on && !T.self ? `<button type="button" class="d4-skip" data-d4="skip">تخطَّ الآن<small>تعود إليك في المراجعة</small></button>` : ''}
    </div>`;
    refocus(f);
  }

  /* the steps of every reading: hear the reader, read, compare by ear, then the checker (only where the device checks it) */
  function track3(x) {
    const rd = !!(T.reader() || wordUrl(x)), heardIt = T.heardAt === T.i, rec = !!T.rec, chk = !!x.zf && Z.S().zf !== -1;
    const st = (rd ? [['اسمع', heardIt || rec]] : []).concat([['اقرأ', rec], ['قارن', !!T.self]], chk ? [['الفحص', !!T.self && !!T.res]] : []);
    const now = st.findIndex(([, done]) => !done);
    return `<ol class="d4-steps" aria-label="الخطوات">${st.map(([t, done], i) => `<li class="${done ? 'd4-done' : i === now ? 'd4-now' : ''}"${i === now ? ' aria-current="step"' : ''}><i>${done ? I.ok(11) : AR(i + 1)}</i>${t}</li>`).join('')}</ol>`;
  }

  /* «صدى»: what comes back today first (not yet, then due), then the examples of the chapters the learner has studied, those
     with the reader's recitation first; seven at a time */
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  function poolOf(ch) {
    const ids = Object.entries(window.D4MAP.ch).filter(([, c]) => ch === 'all' || c === ch).map(([id]) => id);
    return ids.flatMap(id => LES[id] ? LES[id].cases.flatMap(c => c.items.map(x => (x.ch4 = window.D4MAP.ch[id], x))) : []).filter(x => x.kind !== 'ayah');
  }
  const studied = () => api.CH.filter(c => api.lessons(c.id).some(l => api.lesDone(c.id, l.n))).map(c => c.id);
  const examples = n => n === 1 ? 'مثال واحد' : n === 2 ? 'مثالان' : n <= 10 ? AR(n) + ' أمثلة' : AR(n) + ' مثالًا';
  function sadaIntro() {
    const chs = api.CH.map(c => [c, poolOf(c.id).length]).filter(([, n]) => n), st = studied(), d = dueReads();
    box.innerHTML = `<div class="wrap d4-l">
      <h1 class="d4-h">صدى: اسمع، اقرأ، قارن</h1>
      <p class="d4-lead">تسمع القارئ، ثم تقرأ ويُسجَّل صوتك، ثم تسمع صوتك بعد صوته وتحكم بأذنك، ثم يقول الفاحص ما سمعه.</p>
      <div class="d4-go"><a class="btn pri" href="#sada/all">${I.mic}ابدأ: سبع آيات ${st.length ? 'من الأبواب التي درستها' : 'من الأبواب كلها'}</a>${d ? `<small>يعود إليك اليوم ${AR(d)}، فتبدأ بها.</small>` : ''}</div>
      <ol class="d4-chs">${chs.map(([c, n]) => `<li><a href="#sada/${c.id}"><b>${c.n ? 'الباب ' + AR(c.n) : 'المدخل'}</b><span>${esc(api.split(c.title)[0])}</span><small>${examples(n)}</small></a></li>`).join('')}</ol>
      <p class="d4-small">يُفحص تسجيلك على جهازك، ولا يُرسَل إلى أحد. والفاحص نموذج ذكاء اصطناعي قد يخطئ. <a href="#halqa">دفتر الحلقة</a></p>
    </div>`;
  }
  function sada(ch, a) {
    api = a; mode = 'sada'; box.style.display = ''; cur = { ch, sada: true }; inLesson = null;
    if (!ch) { T = null; sadaIntro(); window.scrollTo(0, 0); return; }
    let all = poolOf(ch);
    if (ch === 'all') { const st = studied(); if (st.length) all = all.filter(x => st.includes(x.ch4)); }
    const now = today(), back = o => o && o.due && o.due <= now;
    const due = all.filter(x => back(R.r[rkey(x)])).sort((p, q) => (R.r[rkey(q)].last === 'again') - (R.r[rkey(p)].last === 'again'));
    const rest = all.filter(x => !back(R.r[rkey(x)])), voiced = x => x.au && D.audio[x.au] && x.ay;
    const seen = new Set(), items = due.concat(shuffle(rest.filter(voiced)), shuffle(rest.filter(x => !voiced(x)))).filter(x => !seen.has(rkey(x)) && seen.add(rkey(x))).slice(0, 7);
    T = Z.sitting({ id: 'sada-' + ch, cases: [] }, items, draw); T.n = 50; T.load();
    draw(); window.scrollTo(0, 0);
  }

  /* «دفتر الحلقة»: what was read after the reader on this device, for the learner to read to a teacher in person; the teacher's
     mark is put here by hand. Nothing in it is sent anywhere */
  const dayName = k => { const [y, m, d] = k.split('-').map(Number); return AR(d) + '/' + AR(m); };
  function halqa(a) {
    api = a; mode = 'halqa'; box.style.display = ''; cur = { ch: '' }; inLesson = null; T = null;
    const rows = Object.entries(R.r), again = rows.filter(([, o]) => o.last === 'again'), skip = rows.filter(([, o]) => o.last === 'skip'), ok = rows.filter(([, o]) => o.last === 'ok');
    const item = ([k, o]) => `<li><span class="d4-hw qq" lang="ar">${esc(o.w)}</span><span class="d4-hm">${[o.ctx ? CTX[o.ctx] : '', o.ay ? esc(o.ay[0]) + ' ' + AR(o.ay[1]) : ''].filter(Boolean).join('، ')}<small>${dayName(o.t)}</small></span>${o.last === 'again' ? (o.taught ? `<span class="d4-ht">${I.ok(13)}قرأها على معلّمه ${dayName(o.taught)}</span>` : `<button type="button" class="btn" data-d4="taught" data-k="${esc(k)}">قرأتُها على معلّمي</button>`) : ''}</li>`;
    const chs = api.CH.map(c => { const ls = api.lessons(c.id); return [c, ls.filter(l => api.lesDone(c.id, l.n)).length, ls.length]; }).filter(([, d]) => d);
    box.innerHTML = `<div class="wrap d4-l d4-halqa">
      <h1 class="d4-h">دفتر الحلقة</h1>
      <p class="d4-lead">ما قرأتَه بعد القارئ على هذا الجهاز. اعرضه على معلّمك: اقرأ عليه ما قلتَ فيه «ليس بعد»، فإذا سمعك بأذنه فضع علامته. لا يُرسَل من هذا الدفتر شيء.</p>
      <p class="d4-hd">${R.days.length ? `قرأتَ في ${R.days.length === 1 ? 'يوم واحد' : R.days.length === 2 ? 'يومين' : AR(R.days.length) + (R.days.length <= 10 ? ' أيام' : ' يومًا')}: ${R.days.slice(-10).map(dayName).join('، ')}` : 'لم تقرأ بعد بعد القارئ. ابدأ بدرس أو بـ«صدى».'}</p>
      ${again.length ? `<h2>اقرأها على معلّمك (${AR(again.length)})</h2><ul class="d4-hl">${again.map(item).join('')}</ul>` : ''}
      ${skip.length ? `<h2>تخطّيتها (${AR(skip.length)})</h2><ul class="d4-hl">${skip.map(item).join('')}</ul>` : ''}
      ${ok.length ? `<h2>قرأتَها مثل القارئ (${AR(ok.length)})</h2><ul class="d4-hl">${ok.slice(-12).map(item).join('')}</ul>` : ''}
      ${chs.length ? `<h2>الدروس</h2><ul class="d4-hc">${chs.map(([c, d, n]) => `<li><b>${c.n ? 'الباب ' + AR(c.n) : 'المدخل'}</b><span>${esc(api.split(c.title)[0])}</span><small>${AR(d)} من ${AR(n)}</small></li>`).join('')}</ul>` : ''}
      <div class="d4-go"><a class="btn pri" href="#sada">${I.mic}صدى</a></div>
    </div>`;
    window.scrollTo(0, 0);
  }

  function show(l, practice, a, o = {}) {
    api = a; cur = l; mode = practice ? 'p' : 'l'; box.style.display = ''; inLesson = o.lesson ? o : null;
    if (practice) { if (!T || T.L !== LES[l.t4] || T.k !== l.k) { T = Z.sitting(LES[l.t4], steps(LES[l.t4], l.k), draw); T.k = l.k; T.n = 50; T.load(); } draw(); }
    else lesson();
    window.scrollTo(0, 0);
  }
  function hide() { mode = ''; inLesson = null; box.style.display = 'none'; Z.stop(); if (T && T.on) T.mic(); T = null; box.innerHTML = ''; }
  // the reader's word, then a silence as long as it for the learner to say it after him
  function playWord(x) {
    const u = wordUrl(x); if (!u) return;
    const t0 = Date.now(), i = T.i;
    T.heardAt = T.i; draw();
    Z.play(u, { end: () => { if (!T || T.i !== i) return; const dur = Math.max(.6, (Date.now() - t0) / 1000); T.echo = { i, dur, until: Date.now() + dur * 1000 }; draw(); setTimeout(() => { if (T && T.echo && T.echo.i === i) { T.echo = null; draw(); } }, dur * 1000 + 50); } });
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-d4]'); if (!b) return;
    const k = b.dataset.d4;
    if (k === 'more' && cur && cur.sada) return sada(cur.ch, api);
    if (k === 'taught') { const o = R.r[b.dataset.k]; if (o) { o.taught = today(); keepR(); halqa(api); } return; }
    if (!T) return;
    const x = T.cur();
    if (k === 'wd') return playWord(x);
    if (k === 'rd') { T.heardAt = T.i; draw(); return Z.play(T.reader()); }
    if (k === 'mic') { if (!T.on) { T.self = null; T.ans = null; } return T.mic(); }
    if (k === 'mine') return Z.play(T.rec.url);
    if (k === 'both') { T.heardAt = T.i; return Z.playBoth(refUrl(x), T.rec.url); }
    if (k.startsWith('a-')) {
      T.ans = k.slice(2); T.self = T.ans === 'same' ? 'ok' : 'again'; keepRead(x, T.self); draw();
      const v = box.querySelector('.d4-chk'); if (v) v.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    if (k === 'redo') { T.self = null; T.ans = null; T.rec = null; T.res = T.err = null; T.heardAt = -1; draw(); return wordUrl(x) ? playWord(x) : (T.heardAt = T.i, Z.play(T.reader())); }
    if (k === 'zon') { Z.setCheck(true); if (T.rec && x.chk) T.check(); return draw(); }
    if (k === 'skip') { keepRead(x, 'skip'); T.self = null; T.ans = null; return T.next(); }
    if (k === 'next') { if (T.rec && !T.self) keepRead(x, 'skip'); T.self = null; T.ans = null; return T.next(); }
  });
  window.__t = () => T;
  return { show, hide, sada, halqa };
})();

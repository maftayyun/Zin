/* The fourth trial version's practice («الجامعة») inside the site (version 5; see build.py): after a lesson of the site drawn
   from a table, the site calls D4.show for its practice (…/p), and D4.sada for «صدى»; D4.hide whenever it draws anything else.
   The checker is the first version's: on the device, and Quran Muaalem in the Space beside it. */
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
      <div class="d4-tbl"><h2><span>${timed ? 'زمن الحرف المضيء' : 'الحرف المضيء'}</span>${timed ? '<span>الخانة = حركة</span>' : ''}</h2>
        ${ex.map(x => `<div class="d4-tr"><span class="d4-w" lang="ar">${litWord(x)}</span>${timeOf(x)}${chip(x) || said(x) ? `<div class="d4-sub">${chip(x)}${said(x)}</div>` : ''}</div>`).join('')}
        ${k != null ? `<a class="lnk d4-all" href="#c/${cur.ch}/tb${k}">الجدول كاملًا، بأمثلته كلها</a>` : ''}</div>
      <div class="d4-go"><a class="btn pri" href="#l/${cur.ch}/${cur.n}/p">${I.mic}اسمع القارئ واقرأ بعده</a><small>${AR(steps(L, cur.k).length)} آيات، آخرها بلا علامات</small></div>
    </div>`;
  }

  /* ---------- reading after the reader ---------- */
  function track(pk, max, c, zones) {
    const len = pk ? pk.to - pk.from : 0, w = pk && max ? Math.max(12, Math.round(100 * len / max)) : 100;
    return `<div class="d4-wv"><div style="width:${w}%">${Z.wave(pk, { n: Math.max(10, Math.round(50 * w / 100)), h: 34, bw: 3, gap: 2, c, zones })}</div></div>`;
  }
  /* the checker, as in the first version: joined or stopped heard on the device by Quran Lab's model, the madd measured by its
     timing in the learner's own haraka, the qalqalah by its probability, and Quran Muaalem's word beside them (Z.maddLine) */
  function checked(x) {
    if (T.busy) return '<div class="d4-chk" role="status"><b>الفاحص</b><p>يقيس تلاوتك…</p></div>';
    if (T.res) {
      const h = Z.heard(x, T.res), g = esc(glyph(x));
      const head = !h.is ? '<p class="d4-v d4-no">لا يبدو أن التسجيل لهذه الكلمة. أعد القراءة.</p>'
        : h.h === 'same' ? `<p class="d4-v d4-yes">${I.ok()}سُمِعت الكلمة.</p>`
        : `<p class="d4-v ${h.ok ? 'd4-yes' : 'd4-no'}">${h.ok ? I.ok() : ''}سُمِعت ${CTX[h.h]}${h.ok ? '' : `، والمطلوب ${CTX[x.ctx]}`}</p>${h.sure ? '' : '<p class="d4-small">الحكم غير مؤكد.</p>'}`;
      const ms = h.is && h.ms ? `<p>زمن <span class="qq">${g}</span> في تلاوتك: ${AR(h.ms)} ملّي ثانية <small>(قياس تقريبي)</small></p>` : '';
      const lines = (Z.maddLine(T, x) || []).map(l => `<p class="d4-md d4-md-${l.st}">${esc(l.text)}</p>`).join('');
      const ear = h.is && h.ms == null && x.kind === 'time' && !Z.maddOf(x) ? `<p class="d4-small">الفاحص يسمع الوصل والوقف، ولا يقيس زمن <span class="qq">${g}</span> بعد: ${T.reader() ? 'اسمع القارئ ثم صوتك' : 'قابل صوتك بالقاعدة'}.</p>` : '';
      return `<div class="d4-chk"><b>الفاحص</b>${head}${ms}${lines}${ear}<p class="d4-ai">${esc(Z.NOTE)}</p></div>`;
    }
    if (T.err) return `<div class="d4-chk"><b>الفاحص</b><p>${esc(Z.errText(T.err))}</p></div>`;
    if (T.rec && !x.chk) return '<div class="d4-chk"><b>الفاحص</b><p>لا يفحص الفاحص هذا المثال بعد، فالحكم هنا لأذنك.</p></div>';
    return '';
  }
  function heard(x) {
    if (!T.rec) return '';
    const rd = T.reader(), rpk = rd ? T.readerPk() : null, mpk = T.rec.pk;
    const max = Math.max(rpk ? rpk.to - rpk.from : 0, mpk ? mpk.to - mpk.from : 0);
    return `<div class="d4-ear">
        <div class="d4-tk">${rd ? `<b>${x.recited ? 'المنشاوي' : 'القارئ'}</b>${track(rpk, max, css('--ink-3'))}` : ''}<b>تلاوتك</b>${track(mpk, max, css('--brand'))}</div>
        ${checked(x)}
        <p>${rd ? 'اسمع القارئ ثم صوتك: هل قرأتَ مثله؟' : 'اسمع صوتك، وقابله بالقاعدة: هل أصبتَ؟'}</p>
        <div class="d4-acts">${rd ? `<button type="button" class="btn" data-d4="both">${I.both}اسمع الصوتين</button>` : ''}
          <button type="button" class="btn" data-d4="mine"${rd ? '' : ' style="grid-column:1/-1"'}>${I.play()}تلاوتك</button>
          <button type="button" class="btn pri d4-y" data-d4="ok">${I.ok()}أصبتُ</button></div></div>`;
  }
  function draw() {
    if ((mode !== 'p' && mode !== 'sada') || !T) return;
    const x = T.cur(), n = T.items.length;
    if (T.end && cur.sada) {
      box.innerHTML = `<div class="wrap d4-end"><span class="d4-ok">${I.ok(40)}</span><h1>انتهى وِرد صدى</h1><p>قرأتَ ${AR(n)} من الآيات بعد القارئ.</p>
        <button type="button" class="btn pri" data-d4="more">وِرد آخر</button><a class="lnk" href="#sada">اختر بابًا</a></div>`;
      T = null; return;
    }
    if (T.end) {
      api.lesMark(cur.ch, cur.n);
      const ls = api.lessons(cur.ch), nx = ls[cur.n];
      box.innerHTML = `<div class="wrap d4-end"><span class="d4-ok">${I.ok(40)}</span><h1>أتممتَ الدرس</h1><p>${qt(LES[cur.t4].title)}</p>
        ${nx ? `<a class="btn pri" href="#l/${cur.ch}/${nx.n}">الدرس التالي</a>` : ''}<a class="lnk" href="#c/${cur.ch}">إلى دروس الباب</a></div>`;
      T = null; return;
    }
    const bare = x.test && !T.rec, text = x.ay ? (bare ? esc(x.ay.text) : Z.ayahLit(x)) : litWord(x), len = (x.ay ? x.ay.text : x.w).length, rd = T.reader();
    box.innerHTML = `<div class="wrap d4-p">
      <div class="d4-top">${cur.sada ? `<a class="d4-x" href="#sada" aria-label="رجوع إلى صدى">${I.back}</a><b>صدى</b>` : `<a class="d4-x" href="#c/${cur.ch}" aria-label="رجوع إلى دروس الباب">${I.back}</a><b>الدرس ${AR(cur.n)}</b>`}<span>${AR(T.i + 1)} من ${AR(n)}</span>
        <div class="d4-pr" aria-hidden="true"><i style="width:${Math.round(100 * (T.i + 1) / n)}%"></i></div></div>
      ${bare ? '' : track3(x)}
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

  /* the three steps of every reading: hear the reader, read, then the check (the checker finds the word in the reading, and
     the ear judges it beside the reader's); with no recording of the reader, the last two */
  function track3(x) {
    const rd = !!T.reader(), heardIt = T.heardAt === T.i, rec = !!T.rec;
    const st = (rd ? [['اسمع القارئ', heardIt || rec]] : []).concat([['اقرأ', rec], ['الفحص', rec && !T.busy && !!(T.res || T.err || !x.chk)]]);
    const now = st.findIndex(([, done]) => !done);
    return `<ol class="d4-steps" aria-label="الخطوات">${st.map(([t, done], i) => `<li class="${done ? 'd4-done' : i === now ? 'd4-now' : ''}"${i === now ? ' aria-current="step"' : ''}><i>${done ? I.ok(11) : AR(i + 1)}</i>${t}</li>`).join('')}</ol>`;
  }

  /* «صدى»: the same three steps, on the examples of the trial lessons of a chapter (or of all), those with the reader's
     recitation first, seven at a time */
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  function poolOf(ch) {
    const ids = Object.entries(window.D4MAP.ch).filter(([, c]) => ch === 'all' || c === ch).map(([id]) => id);
    return ids.flatMap(id => LES[id] ? LES[id].cases.flatMap(c => c.items) : []).filter(x => x.kind !== 'ayah');
  }
  // a count of examples, as Arabic says it
  const examples = n => n === 1 ? 'مثال واحد' : n === 2 ? 'مثالان' : n <= 10 ? AR(n) + ' أمثلة' : AR(n) + ' مثالًا';
  function sadaIntro() {
    const chs = api.CH.map(c => [c, poolOf(c.id).length]).filter(([, n]) => n);
    box.innerHTML = `<div class="wrap d4-l">
      <h1 class="d4-h">صدى: اسمع، اقرأ، ثم الفحص</h1>
      <p class="d4-lead">تسمع القارئ يقرأ الآية، ثم تقرؤها أنت ويُسجَّل صوتك، ثم الفحص: يسمع الفاحص تلاوتك، فيحكم في الوصل والوقف، ويقيس زمن المدّ بالحركات، ويسمع القلقلة، ومعه «المعلّم القرآني».</p>
      <div class="d4-go"><a class="btn pri" href="#sada/all">${I.mic}ابدأ: سبع آيات من الأبواب كلها</a></div>
      <ol class="d4-chs">${chs.map(([c, n]) => `<li><a href="#sada/${c.id}"><b>${c.n ? 'الباب ' + AR(c.n) : 'المدخل'}</b><span>${esc(api.split(c.title)[0])}</span><small>${examples(n)}</small></a></li>`).join('')}</ol>
      <p class="d4-small">يُفحص تسجيلك على جهازك بنموذج Quran Lab، ويُرسَل إلى «المعلّم القرآني» ليسمعه، بعد أن تأذن بذلك أول مرة. والفاحص نموذج ذكاء اصطناعي قد يخطئ.</p>
    </div>`;
  }
  function sada(ch, a) {
    api = a; mode = 'sada'; box.style.display = ''; cur = { ch, sada: true };
    if (!ch) { T = null; sadaIntro(); window.scrollTo(0, 0); return; }
    const all = poolOf(ch), heard = shuffle(all.filter(x => x.au && D.audio[x.au] && x.ay)), rest = shuffle(all.filter(x => !(x.au && D.audio[x.au] && x.ay)));
    T = Z.sitting({ id: 'sada-' + ch, cases: [] }, heard.concat(rest).slice(0, 7), draw); T.n = 50; T.load();
    draw(); window.scrollTo(0, 0);
  }

  function show(l, practice, a) {
    api = a; cur = l; mode = practice ? 'p' : 'l'; box.style.display = '';
    if (practice) { if (!T || T.L !== LES[l.t4] || T.k !== l.k) { T = Z.sitting(LES[l.t4], steps(LES[l.t4], l.k), draw); T.k = l.k; T.n = 50; T.load(); } draw(); }
    else lesson();
    window.scrollTo(0, 0);
  }
  function hide() { mode = ''; box.style.display = 'none'; Z.stop(); if (T && T.on) T.mic(); T = null; box.innerHTML = ''; }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-d4]'); if (!b) return;
    const k = b.dataset.d4;
    if (k === 'more' && cur && cur.sada) return sada(cur.ch, api);
    if (!T) return;
    if (k === 'rd') { T.heardAt = T.i; draw(); return Z.play(T.reader()); }
    if (k === 'mic') return T.mic();
    if (k === 'mine') return Z.play(T.rec.url);
    if (k === 'both') { T.heardAt = T.i; return Z.playBoth(T.reader(), T.rec.url); }
    if (k === 'ok' || k === 'next') return T.next();
  });
  window.__t = () => T;
  return { show, hide, sada };
})();

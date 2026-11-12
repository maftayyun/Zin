/* What the three trial versions share: the lessons (data.js), the reader's recordings, the learner's microphone, the drawing of a
   real recording, and the checker. Each version draws these in its own way. */
window.Z = (() => {
  const D = window.ZIN;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  const CTX = { wasl: 'وصلًا', waqf: 'وقفًا', ibtida: 'ابتداءً' };
  const LES = Object.fromEntries(D.lessons.map(l => [l.id, l]));
  // an exercise whose two forms (joined, stopped) were built from the mushaf (zf_forms.py) is checked on the learner's device
  const FORMS = window.ZF_FORMS || {};
  D.lessons.forEach(l => l.cases.forEach(c => c.items.forEach(x => { const f = FORMS[x.ctx + '|' + x.w]; if (f) { x.zf = f; x.chk = ['zf', x.ctx]; } })));
  const vName = v => AR(D.name[v] || v);
  const lit = (w, f, cls) => esc(w.slice(0, f[0])) + `<em${cls ? ` class="${cls}"` : ''}>` + esc(w.slice(f[0], f[1])) + '</em>' + esc(w.slice(f[1]));
  // marks of the mushaf inside a line of the book are drawn in the mushaf's own font
  const qt = t => esc(t).replace(/[^\s،,:؛()=+*]*[ٓۖ-ۭٱٰ][^\s،,:؛()=+*]*/g, m => `<span class="q">${/^[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]+$/.test(m) ? 'ـ' + m : m}</span>`);
  const glyph = x => x.w.slice(x.f[0], x.f[1]).replace(/[ۖ-ۛ]/g, '');
  // a time as small dots: one for each حركة, half a dot for «بعض حركة», an empty crossed one for a letter not said
  function dots(v) {
    if (v == null) return '';
    const part = p => { const n = Number(p); return n ? (n % 1 ? '<i class="h"></i>' : '') + '<i></i>'.repeat(Math.floor(n)) : '<i class="z"></i>'; };
    return `<span class="dts" role="img" aria-label="${esc(vName(v))}">${v === '2|4|6' ? '<i></i><i></i>' : v.split('+').reverse().map(part).join('<b></b>')}</span>`;
  }
  // «قّ = قۡ + قُ»: the doubled letter as the two letters it is said as
  const parts = c => { const b = c[0], m = [...c.slice(1)].filter(k => k !== 'ّ' && k !== 'ـ' && !/[ۖ-ۛ]/.test(k)).join(''); return [b + 'ۡ', b + m]; };

  /* ---------- progress, kept on the device ---------- */
  const KEY = 'zin-trial-' + (document.documentElement.dataset.v || '');
  let S = (() => { try { return Object.assign({ done: {}, ai: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { done: {}, ai: 0 }; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const ayahText = a => a.w.map(w => w.map(u => u.c).join('')).join(' ');
  const ayahItem = L => ({ ayah: L.ayah, marks: L.marks, chk: ['align', L.ayah.s, L.ayah.a], kind: 'ayah', ctx: '', w: ayahText(L.ayah) });
  /* ---------- what a lesson practises ---------- */
  // its examples, each reading beside the other; then its ayah where the checker measures the rule
  function examples(L) {
    const out = [], n = Math.max(...L.cases.map(c => c.items.length));
    for (let i = 0; i < n; i++) L.cases.forEach(c => { if (c.items[i]) out.push(c.items[i]); });
    const some = out.slice(0, 8);
    if (L.measured) some.push(ayahItem(L));
    return some;
  }
  // the book's sentences that state a lesson's rule: the headings of its examples, or its rule paragraphs where a heading says little
  function ruleLines(L) {
    const seen = new Set(), out = [];
    L.cases.forEach(c => c.items.slice(0, 1).forEach(x => { const t = x.kind === 'verdict' ? `${x.src} ${x.cond}`.trim() : x.src; if (t && t.length > 8 && !seen.has(t)) { seen.add(t); out.push(t); } }));
    return out.length ? out : L.book.slice(0, 2);
  }
  // how an example is said, where the book writes it: the said form, or the way the word is begun
  const saidOf = x => x.kind === 'form' || x.kind === 'start' ? x.ans : x.said && x.said !== x.w ? x.said : '';
  const saidLabel = x => x.kind === 'start' ? 'الابتداء' : 'تُلفظ';
  // the lessons by the chapters of the book, in its order
  function chapters(ids) {
    const out = [];
    ids.forEach(id => { const L = LES[id]; let c = out[out.length - 1]; if (!c || c.no !== L.no) out.push(c = { no: L.no, title: L.chapter, ids: [] }); c.ids.push(id); });
    return out;
  }

  /* ---------- sound ---------- */
  let au = null, stopAt = null;
  function stop() { if (au) { au.onended = null; au.ontimeupdate = null; au.pause(); au = null; } }
  function play(url, o = {}) {
    stop(); if (!url) { o.end && o.end(); return; }
    const a = au = new Audio(url);
    const done = () => { if (au === a) au = null; o.end && o.end(); };
    a.onended = done;
    if (o.from != null) { a.addEventListener('loadedmetadata', () => { try { a.currentTime = o.from; } catch (e) {} }, { once: true }); }
    if (o.to != null) a.ontimeupdate = () => { if (a.currentTime >= o.to) { a.pause(); a.ontimeupdate = null; done(); } };
    a.play().catch(done);
  }
  const playBoth = (u1, u2, end) => play(u1, { end: () => setTimeout(() => play(u2, { end }), 250) });
  const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let mr = null, stream = null, bits = [];
  async function recStart() {
    stop();
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mr = new MediaRecorder(stream); bits = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) bits.push(e.data); };
    mr.start();
  }
  function recStop() {
    return new Promise(res => {
      if (!mr) return res(null);
      const m = mr;
      m.onstop = () => { stream.getTracks().forEach(t => t.stop()); const blob = new Blob(bits, { type: m.mimeType || 'audio/webm' }); mr = null; res({ blob, url: URL.createObjectURL(blob) }); };
      m.stop();
    });
  }
  // the shape of a recording: its loud part cut into `n` bars; `from` and `to` are where the voice begins and ends, in seconds
  let AC = null;
  async function peaks(src, n) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const buf = src instanceof Blob ? await src.arrayBuffer() : await (await fetch(src)).arrayBuffer();
      const a = await new Promise((ok, no) => { const p = AC.decodeAudioData(buf, ok, no); if (p && p.then) p.then(ok, no); });
      const d = a.getChannelData(0), sr = a.sampleRate, hop = Math.max(1, Math.floor(sr * .01)), fr = [];
      for (let i = 0; i + hop <= d.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += d[j] * d[j]; fr.push(Math.sqrt(s / hop)); }
      const mx = Math.max(...fr, 1e-6), thr = mx * .06;
      let a0 = fr.findIndex(x => x > thr), b0 = fr.length - 1 - [...fr].reverse().findIndex(x => x > thr);
      if (a0 < 0) { a0 = 0; b0 = fr.length - 1; }
      a0 = Math.max(0, a0 - 3); b0 = Math.min(fr.length - 1, b0 + 3);
      const bars = [], w = (b0 - a0 + 1) / n;
      for (let k = 0; k < n; k++) { let m = 0; for (let j = Math.floor(a0 + k * w); j < Math.max(Math.floor(a0 + k * w) + 1, Math.floor(a0 + (k + 1) * w)); j++) m = Math.max(m, fr[j] || 0); bars.push(Math.max(.06, Math.min(1, m / mx))); }
      return { bars, from: a0 * hop / sr, to: (b0 + 1) * hop / sr, dur: a.duration };
    } catch (e) { return null; }
  }
  // the bars of a recording, the first sound on the right as the writing runs; `zones` light a stretch of it: [{a, b, c}] in seconds
  function wave(pk, o = {}) {
    const n = o.n || 44, h = o.h || 34, bw = o.bw || 3, gap = o.gap || 2, step = bw + gap, W = n * step - gap, base = o.c || '#999';
    const bars = pk ? pk.bars : Array.from({ length: n }, (_, i) => .1 + .06 * ((i * 7) % 3));
    const span = pk ? pk.to - pk.from : 1, at = t => Math.max(0, Math.min(1, (t - (pk ? pk.from : 0)) / span));
    let out = '';
    for (let i = 0; i < bars.length; i++) {
      const t = (i + .5) / bars.length, z = (o.zones || []).find(z => pk && t >= at(z.a) && t <= at(z.b)), bh = bars[i] * h, x = W - (i + 1) * step + gap;
      out += `<rect x="${x}" y="${(h - bh) / 2}" width="${bw}" height="${bh}" rx="${bw / 2}" fill="${z ? z.c : base}"${pk ? '' : ' opacity=".45"'}/>`;
    }
    return `<svg class="wsvg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
  }
  const pct = (pk, t) => pk ? Math.max(0, Math.min(100, 100 * (t - pk.from) / (pk.to - pk.from))) : 0;

  /* ---------- the checker ---------- */
  const CHK = 'https://yamanamr-zin-checker.hf.space';
  const NOTE = 'الفاحص نموذج ذكاء اصطناعي قد يخطئ؛ فهو للإعانة فقط ولا يُعتمد عليه، وليس بديلاً عن معلّمٍ مُتقِنٍ مُجاز؛ لأنّ القرآن لا يُؤخذ إلا بالمشافهة.';
  const NOTE_EN = 'This Quranic Teacher is an artificial-intelligence model that may make mistakes. It is intended for assistance only and must not be relied upon. It is not a replacement for a proficient, authorized teacher, because the Quran is only received through oral transmission (mushafahah).';
  function aiOK(here) {
    if (here ? S.zf : S.ai) return true;
    const what = here ? 'يُفحص تسجيلك على جهازك ولا يُرسَل إلى أحد. ويُنزَّل نموذج التعرّف (73 ميغابايت) أول مرة فقط، ثم يعمل بلا إنترنت.'
                      : 'يُرسَل تسجيلك إلى الفاحص ليقيسه، ولا يُحفظ.';
    if (!confirm(what + '\n\n' + NOTE + '\n\n' + NOTE_EN)) return false;
    if (here) S.zf = 1; else S.ai = 1;
    save(); return true;
  }
  /* Quran Lab's phoneme recogniser (zipformer_p-arabic-v3.1, NPL-1.2) run in the browser by assets/zf.js with onnxruntime-web;
     the model is kept in the browser's cache after the first time */
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
  const load = src => new Promise((ok, no) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); });
  let ZR = null;
  function recogniser() {
    if (!ZR) ZR = (async () => {
      if (!window.ort) await load(ORT + 'ort.wasm.min.js');
      ort.env.wasm.wasmPaths = ORT; ort.env.wasm.numThreads = 1;
      if (!window.ZF) await load('../assets/zf.js');
      return ZF.load('../m/');
    })().catch(e => { ZR = null; throw { model: true }; });
    return ZR;
  }
  async function checkHere(x, blob) {
    const R = await recogniser();
    let pcm;
    try { pcm = await ZF.samples(blob); } catch (e) { throw { text: 'تعذّرت قراءة التسجيل.' }; }
    if (pcm.length < 16000 * 0.3) throw { text: 'التسجيل أقصر من أن يُقاس.' };
    return ZF.judge(await R.hear(pcm), x.zf);
  }
  async function check(args, blob, x) {
    if (window.__mock) return window.__mock(args);
    if (x && x.zf) return checkHere(x, blob);
    const [fn, ...rest] = args;
    let txt;
    try {
      const fd = new FormData(); fd.append('files', blob, 'tilawa.' + ((blob.type.split('/')[1] || 'webm').split(';')[0]));
      const up = await (await fetch(CHK + '/gradio_api/upload', { method: 'POST', body: fd })).json();
      const ev = await (await fetch(CHK + '/gradio_api/call/' + fn, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [{ path: up[0], meta: { _type: 'gradio.FileData' } }, ...rest] }) })).json();
      txt = await (await fetch(CHK + '/gradio_api/call/' + fn + '/' + ev.event_id)).text();
    } catch (e) { throw { blocked: true }; }
    const ok = txt.match(/event: complete\s*\ndata: (.*)/), bad = txt.match(/event: error\s*\ndata: (.*)/);
    if (ok) { try { return JSON.parse(ok[1])[1]; } catch (e) { throw { text: '' }; } }
    let t = ''; try { t = String(((bad && JSON.parse(bad[1])) || {}).error || ''); } catch (e) {}
    throw { text: t, quota: /quota|limit/i.test(t) };
  }
  const errText = e => e.declined ? 'لم يُرسَل التسجيل إلى الفاحص.' : e.model ? 'تعذّر تنزيل نموذج التعرّف الآن. تحقّق من الاتصال ثم أعد المحاولة.' : e.quota ? 'بلغ الفاحص حدّ استعماله الآن. حاول بعد قليل.' : e.blocked ? 'تعذّر الوصول إلى الفاحص الآن.' : e.text ? 'لم يُتمّ الفاحص القياس: ' + e.text : 'لم يُتمّ الفاحص القياس.';
  // a word or two read after the reader: was it heard joined or stopped, and how long was its last letter
  function heard(x, res) {
    const h = res.heard_as, t = res.timing;
    return { is: res.matches_example !== false, h, ok: res.matches_example !== false && (h === 'same' || h === x.ctx), ms: t ? t.ms : null, a: t ? t.start_s : null, b: t ? t.end_s : null, sure: Math.abs(res.margin || 0) >= 2 || h === 'same' };
  }
  // the book's time for a long sound the checker timed in an ayah (as in the site: by the letter's sign, from the tagged ayah)
  function expect(m, a) {
    const w = a.w[m.word - 1] || [], last = a.w.flat().filter(u => !['sil', 'zro', 'zrr', 'sym'].includes(u.k)).slice(-1)[0];
    if (m.at_stop) return last && last.k === 'mad' ? '2' : '2|4|6';
    const u = w.find(x => x.k === 'mad' && x.t != null && D.prules[x.t] && D.prules[x.t].v);
    if (u && !u.ms) return D.prules[u.t].v;
    if (w.some(x => x.d && !x.ms) && D.prules['31']) return D.prules['31'].v;
    return String(m.script_counts);
  }
  function measured(res, a) {
    const byS = res.unit_ms_from_short_vowels != null;
    const rows = (res.madds || []).map(m => {
      const v = expect(m, a), got = byS ? m.counts_by_short_unit : m.counts_by_madd_unit, want = v === '2|4|6' ? [2, 4, 6] : [Number(v)];
      const near = got == null ? null : want.reduce((b, x) => Math.abs(got - x) < Math.abs(got - b) ? x : b, want[0]);
      const st = got == null ? 'none' : Math.abs(got - near) <= .5 ? 'good' : got < near ? 'short' : 'long';
      return { text: m.text, word: m.word, v, got: got == null ? null : Math.round(got * 2) / 2, near, st, stop: m.at_stop, a: m.start_s, b: m.end_s };
    });
    return { is: res.similarity >= .5, rows, good: rows.filter(r => r.st === 'good').length, unit: res.unit_ms_from_short_vowels, dur: res.duration_s, symbols: res.symbols || [] };
  }
  const num = n => AR(String(n).replace('.', '٫'));
  const stWord = { good: 'في زمنه', short: 'أقصر', long: 'أطول', none: 'لم يُقَس' };
  // where a word of the learner's ayah begins and ends in the recording
  function wordSpan(symbols, w) { const s = symbols.filter(x => x.word === w); return s.length ? [s[0].start_s, s[s.length - 1].end_s] : null; }

  /* ---------- one practice sitting: the same steps in the three versions ---------- */
  function sitting(L, items, redraw) {
    const T = { L, items, i: 0, rec: null, res: null, err: null, busy: false, on: false, ear: null, msg: '', rpk: {} };
    const cur = () => T.items[T.i], same = (i, r) => T.i === i && T.rec === r;
    const loadReader = () => { const x = cur(); if (x.au && D.audio[x.au] && !(x.au in T.rpk)) { T.rpk[x.au] = null; peaks(D.audio[x.au], T.n || 44).then(p => { T.rpk[x.au] = p; redraw(); }); } };
    T.cur = cur;
    T.reader = () => { const x = cur(); return x.au && D.audio[x.au] ? D.audio[x.au] : ''; };
    T.readerPk = () => T.rpk[cur().au] || null;
    T.load = loadReader;
    T.mic = async () => {
      if (T.on) {
        const r = await recStop(); T.on = false; if (!r) return redraw();
        T.rec = r; T.res = T.err = null; T.ear = null; redraw();
        const i = T.i; r.pk = await peaks(r.blob, T.n || 44); if (!same(i, r)) return; redraw();
        if (cur().chk) T.check();
      } else {
        T.msg = '';
        try { await recStart(); T.on = true; T.rec = null; T.res = T.err = null; T.ear = null; } catch (e) { T.msg = 'تعذّر الوصول إلى الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.'; }
        redraw();
      }
    };
    T.check = async () => {
      const i = T.i, r = T.rec; if (!r || T.busy) return;
      if (!aiOK(!!cur().zf)) { T.err = { declined: true }; return redraw(); }
      T.busy = true; T.err = null; redraw();
      let res = null, err = null;
      try { res = await check(cur().chk, r.blob, cur()); } catch (e) { err = e || {}; }
      if (!same(i, r)) return;
      T.busy = false; T.res = res; T.err = err; redraw();
    };
    T.go = n => { stop(); T.i = n; T.rec = T.res = T.err = null; T.ear = null; T.busy = false; T.on = false; T.msg = ''; loadReader(); redraw(); };
    T.next = () => { if (T.i + 1 < T.items.length) T.go(T.i + 1); else { S.done[L.id] = 1; save(); T.end = true; stop(); redraw(); } };
    T.judge = ok => { T.ear = ok ? 'ok' : 'redo'; if (!ok) { T.rec = null; T.res = T.err = null; } redraw(); };
    loadReader();
    return T;
  }
  return { D, $, $$, esc, AR, CTX, LES, vName, lit, qt, ruleLines, saidOf, saidLabel, chapters, glyph, dots, parts, examples, ayahText, ayahItem, S: () => S, save, play, playBoth, stop, canRec, peaks, wave, pct,
    NOTE, NOTE_EN, errText, heard, measured, num, stWord, wordSpan, sitting };
})();

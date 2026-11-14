/* Zin al-Harf: the phoneme recogniser on the reader's own device (window.ZF).
   The same work as checker-quran-lab/zipformer.py, in the browser: 80-dim kaldi fbank of 16 kHz audio, then the streaming
   CTC zipformer2 of Quran Lab run chunk by chunk with onnxruntime-web, every new_<cache> fed back as <cache>, then greedy
   decoding. Once the model is in the browser's cache, nothing leaves the device and no connection is needed.
   The model's layout (T, decode_chunk_len, blank, the caches and their shapes) comes from zf-manifest.json, written from the
   model file by checker-quran-lab/web_manifest.py, because onnxruntime-web does not read a model's metadata.
   The model is Quran Lab's, under NPL-1.2: no charge for it or for anything it powers; what it writes is not a ruling on
   anyone's recitation; automatic tajweed feedback can be wrong and does not replace a qualified teacher. */
(function () {
  'use strict';
  const SR = 16000, FL = 400, FS = 160, NFFT = 512, NB = 80, TAIL = 0.66;
  /* silence before the reading: without it the model loses the first and last sounds of a recording that begins on the word */
  const LEAD = 0.5;
  const EPS = 1.1920928955078125e-7;
  let WIN = null, MEL = null, COS = null, SIN = null, REV = null;

  function setup() {
    if (WIN) return;
    WIN = new Float64Array(FL);
    for (let i = 0; i < FL; i++) WIN[i] = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FL - 1)), 0.85);
    const mel = f => 1127 * Math.log(1 + f / 700);
    const lo = mel(20), hi = mel(SR / 2 - 400), d = (hi - lo) / (NB + 1);
    MEL = [];
    for (let b = 0; b < NB; b++) {
      const l = lo + b * d, c = l + d, r = c + d, w = [];
      let k0 = -1;
      for (let k = 0; k < NFFT / 2; k++) {
        const m = mel(k * SR / NFFT);
        if (m > l && m < r) {
          if (k0 < 0) k0 = k;
          w.push(m <= c ? (m - l) / (c - l) : (r - m) / (r - c));
        }
      }
      MEL.push({ k0, w: Float64Array.from(w) });
    }
    COS = new Float64Array(NFFT / 2); SIN = new Float64Array(NFFT / 2);
    for (let i = 0; i < NFFT / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / NFFT); SIN[i] = -Math.sin(2 * Math.PI * i / NFFT); }
    REV = new Uint16Array(NFFT);
    const bits = Math.log2(NFFT);
    for (let i = 0; i < NFFT; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); REV[i] = r; }
  }

  function fft(re, im) {
    for (let i = 0; i < NFFT; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= NFFT; size *= 2) {
      const half = size / 2, step = NFFT / size;
      for (let i = 0; i < NFFT; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step, a = i + j, b = a + half;
          const tr = re[b] * COS[k] - im[b] * SIN[k], ti = re[b] * SIN[k] + im[b] * COS[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  /* kaldi fbank as kaldi-native-fbank computes it for sherpa-onnx: snip_edges false (edges reflected), no dither, DC removed,
     pre-emphasis 0.97, povey window, 512-point power spectrum, 80 mel bins from 20 Hz to 7600 Hz, natural log */
  const W = { w: new Float64Array(FL), re: new Float64Array(NFFT), im: new Float64Array(NFFT), p: new Float64Array(NFFT / 2) };
  /* frame f of the samples x[0..n), written to out at o. A frame whose window passes the end is reflected there, as kaldi does */
  function frame(x, n, f, out, o) {
    const { w, re, im, p } = W, s0 = f * FS - (FL - FS) / 2;
    let mean = 0;
    for (let i = 0; i < FL; i++) {
      let s = s0 + i;
      while (s < 0 || s >= n) s = s < 0 ? -s - 1 : 2 * n - 1 - s;
      w[i] = x[s]; mean += w[i];
    }
    mean /= FL;
    for (let i = 0; i < FL; i++) w[i] -= mean;
    for (let i = FL - 1; i > 0; i--) w[i] -= 0.97 * w[i - 1];
    w[0] -= 0.97 * w[0];
    re.fill(0); im.fill(0);
    for (let i = 0; i < FL; i++) re[i] = w[i] * WIN[i];
    fft(re, im);
    for (let k = 0; k < NFFT / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    for (let b = 0; b < NB; b++) {
      const { k0, w: ws } = MEL[b];
      let e = 0;
      for (let j = 0; j < ws.length; j++) e += ws[j] * p[k0 + j];
      out[o + b] = Math.log(Math.max(e, EPS));
    }
  }

  /* kaldi fbank as kaldi-native-fbank computes it for sherpa-onnx: snip_edges false (edges reflected), no dither, DC removed,
     pre-emphasis 0.97, povey window, 512-point power spectrum, 80 mel bins from 20 Hz to 7600 Hz, natural log */
  function fbank(x) {
    setup();
    const n = x.length, nf = Math.floor((n + FS / 2) / FS), out = new Float32Array(nf * NB);
    for (let f = 0; f < nf; f++) frame(x, n, f, out, f * NB);
    return { data: out, frames: nf };
  }

  /* from the microphone's rate to 16 kHz, piece by piece: a windowed sinc low-passed at 7.6 kHz (the top of the fbank) */
  function resampler(rate) {
    if (rate === SR) return { push: x => Float32Array.from(x), flush: () => new Float32Array(0) };
    const H = 24, step = rate / SR, fc = 7600 / rate;
    let buf = new Float32Array(0), base = 0, j = 0;   // buf[0] is input sample number `base`; j is the next output sample
    const tap = t => { if (t === 0) return 2 * fc; const a = Math.PI * t; const w = 0.42 + 0.5 * Math.cos(a / H) + 0.08 * Math.cos(2 * a / H);
      return Math.sin(2 * Math.PI * fc * t) / a * w; };
    function run(final) {
      const out = [];
      for (;;) {
        const pos = j * step, c = Math.floor(pos);
        if (!final && c + H >= base + buf.length) break;
        if (final && c >= base + buf.length) break;
        let y = 0;
        for (let k = c - H + 1; k <= c + H; k++) { const i = k - base; if (i >= 0 && i < buf.length) y += buf[i] * tap(pos - k); }
        out.push(y); j++;
      }
      const keep = Math.max(0, Math.floor(j * step) - H - base);   // samples no later output can reach
      if (keep > 0) { buf = buf.slice(keep); base += keep; }
      return Float32Array.from(out);
    }
    return {
      push(x) { const b = new Float32Array(buf.length + x.length); b.set(buf); b.set(x, buf.length); buf = b; return run(false); },
      flush() { return run(true); },
    };
  }

  async function cached(url, onProgress) {
    /* the model is kept in the browser's cache after the first visit, so later visits need no connection */
    let c = null;
    try {
      c = await caches.open('zin-zf-v1');
      const hit = await c.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch (e) { c = null; }
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    const total = +r.headers.get('content-length') || 0;
    let bytes;
    if (r.body && r.body.getReader && onProgress) {
      const rd = r.body.getReader(), parts = [];
      let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(got, total); }
      bytes = new Uint8Array(got); let o = 0; for (const q of parts) { bytes.set(q, o); o += q.length; }
    } else bytes = new Uint8Array(await r.arrayBuffer());
    if (c) try { await c.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) { /* a full or blocked cache only costs the next download */ }
    return bytes;
  }

  async function load(base, opts) {
    opts = opts || {};
    const ort = opts.ort || window.ort;
    if (!ort) throw new Error('onnxruntime-web is not loaded');
    const man = await (await fetch(base + 'zf-manifest.json')).json();
    const tok = {};
    for (const line of (await (await fetch(base + man.tokens)).text()).split('\n')) {
      if (!line.trim()) continue;
      const t = line.trim(), sp = t.lastIndexOf(' ');
      if (sp < 0) tok[+t] = ' '; else tok[+t.slice(sp + 1)] = line.slice(0, line.lastIndexOf(' '));
    }
    const bytes = await cached(base + man.model, opts.progress);
    const s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return new Recogniser(ort, s, man, tok);
  }

  function zeros(ort, i) {
    const size = i.shape.reduce((a, b) => a * b, 1);
    return i.type === 'int64' ? new ort.Tensor('int64', new BigInt64Array(size), i.shape)
                              : new ort.Tensor('float32', new Float32Array(size), i.shape);
  }

  class Recogniser {
    constructor(ort, s, man, tok) { this.ort = ort; this.s = s; this.m = man; this.tokens = tok; this.blank = man.blank; }

    async logProbs(x) {
      const ort = this.ort, m = this.m;
      const lead = Math.round(LEAD * SR), xs = new Float32Array(lead + x.length + Math.round(TAIL * SR)); xs.set(x, lead);
      const { data, frames } = fbank(xs);
      let state = {};
      for (const i of m.inputs) if (i.name !== 'x') state[i.name] = zeros(ort, i);
      const rows = [];
      let V = 0, per = 0;
      for (let st = 0; st + m.T <= frames; st += m.step) {
        const feeds = Object.assign({ x: new ort.Tensor('float32', data.slice(st * NB, (st + m.T) * NB), [1, m.T, NB]) }, state);
        const out = await this.s.run(feeds);
        const lp = out.log_probs;
        per = lp.dims[1]; V = lp.dims[2];
        rows.push(lp.data.slice());
        const next = {};
        for (const k in state) next[k] = out['new_' + k];
        state = next;
      }
      const all = new Float32Array(rows.length * per * V);
      rows.forEach((r, i) => all.set(r, i * per * V));
      return { lp: all, frames: rows.length * per, V, frame: per ? m.step * 0.01 / per : 0.04 };
    }

    greedy({ lp, frames, V, frame }) {
      const out = [];
      let prev = this.blank;
      for (let t = 0; t < frames; t++) {
        let k = 0, best = -Infinity;
        for (let v = 0; v < V; v++) if (lp[t * V + v] > best) { best = lp[t * V + v]; k = v; }
        if (k !== this.blank && k !== prev) out.push({ id: k, p: this.tokens[k] ?? '?', start: t, end: t + 1, peak: t });
        else if (k !== this.blank && out.length) {
          const s = out[out.length - 1]; s.end = t + 1;
          if (lp[t * V + k] > lp[s.peak * V + k]) s.peak = t;
        }
        prev = k;
      }
      for (const s of out) {
        /* as Quran Lab's decode_with_confidence.py: confidence is the mean probability over the frames that emitted the
           symbol; the margin is the gap to the runner-up at its peak frame (it agrees across runtimes) */
        const row = Array.from(lp.subarray(s.peak * V, (s.peak + 1) * V)).map(Math.exp).sort((a, b) => b - a);
        let c = 0;
        for (let t = s.start; t < s.end; t++) c += Math.exp(lp[t * V + s.id]);
        s.conf = +(c / (s.end - s.start)).toFixed(3);
        s.margin = +(row[0] - row[1]).toFixed(3);
        s.start = +Math.max(0, s.start * frame - LEAD).toFixed(3); s.end = +Math.max(0, s.end * frame - LEAD).toFixed(3);
        delete s.peak;
      }
      return out;
    }

    /* the recogniser fed while the learner reads: push 16 kHz samples as they come; finish() decodes the rest. Frames whose window
       lies wholly in what has come are the batch's own frames, and each chunk runs as soon as its frames are there, so after the
       last word only the tail is left to do. The answer is the same as hear() on the whole recording. */
    stream() {
      setup();
      const ort = this.ort, m = this.m, me = this;
      let x = new Float32Array(SR * 8), n = Math.round(LEAD * SR), feats = new Float32Array(NB * 800), nf = 0, st = 0, chain = Promise.resolve(), per = 0, V = 0, failed = null;
      let state = {};
      for (const i of m.inputs) if (i.name !== 'x') state[i.name] = zeros(ort, i);
      const rows = [];
      const grow = (a, need) => { if (need <= a.length) return a; const b = new Float32Array(Math.max(need, a.length * 2)); b.set(a); return b; };
      const chunk = s0 => async () => {
        if (failed) return;
        try {
          const feeds = Object.assign({ x: new ort.Tensor('float32', feats.slice(s0 * NB, (s0 + m.T) * NB), [1, m.T, NB]) }, state);
          const out = await me.s.run(feeds);
          per = out.log_probs.dims[1]; V = out.log_probs.dims[2];
          rows.push(out.log_probs.data.slice());
          const next = {};
          for (const k in state) next[k] = out['new_' + k];
          state = next;
        } catch (e) { failed = e; }
      };
      const pump = last => {
        const upto = last ? Math.floor((n + FS / 2) / FS) : Math.max(0, Math.floor((n - FL + (FL - FS) / 2) / FS) + 1);
        feats = grow(feats, upto * NB);
        for (; nf < upto; nf++) frame(x, n, nf, feats, nf * NB);
        for (; st + m.T <= nf; st += m.step) chain = chain.then(chunk(st));
      };
      return {
        push(a) { if (!a || !a.length) return; x = grow(x, n + a.length); x.set(a, n); n += a.length; pump(false); },
        async finish() {
          const tail = Math.round(TAIL * SR); x = grow(x, n + tail); x.fill(0, n, n + tail); n += tail; pump(true);
          await chain;
          if (failed) throw failed;
          const all = new Float32Array(rows.length * per * V);
          rows.forEach((r, i) => all.set(r, i * per * V));
          const lp = { lp: all, frames: rows.length * per, V, frame: per ? m.step * 0.01 / per : 0.04 }, heard = me.greedy(lp);
          return { heard, text: heard.map(s => s.p).join(''), samples: n - tail - Math.round(LEAD * SR), lp };
        },
      };
    }

    async hear(x) {
      const r = await this.logProbs(x);
      const heard = this.greedy(r);
      return { heard, text: heard.map(s => s.p).join(''), frame: r.frame, lp: r };
    }

    /* the madd's length as Quran Lab advise: from timing, by forced alignment with the model itself, not from the symbols it
       writes. The same as site/src/tests/madd_ref.py (checked against it in zf_web.py):
         the path      : the best CTC path through the log-probs for the form the reading was heard as; a madd symbol of any
                         length may stand at the madd, so the reader's own length does not pull the alignment
         a madd's span : from the onset of the syllable that carries it (its letter with the short vowel) to the onset of the next
                         sound; at a stop, to the madd's own symbol (written as the madd ends), and END past it
         the unit      : the reader's own short syllable in the same reading, onset to onset (the median of two or more), a letter
                         with its short vowel followed by a short sound (a long one is written as it ends); a haraka
                         is the time of a letter with its vowel. With fewer, `unit` (seconds), the reader's earlier readings, else the one there is
         the count     : span / unit, approximate
       A place the model is not sure of does not anchor a span. The madd itself need not be heard: a madd read short is measured
       short. Returns {count, ms, unit, own, why} for the first madd from `at` to before `end` (places in the form without its
       spaces: the phonetizer writes words that merge in speech as one, so a word number would not do), or null if there is none. */
    maddTime(L, form, at, unit, end) {
      if (!L || !L.frames) return null;
      if (!this.ids) { this.ids = {}; for (const k in this.tokens) if (+k !== this.blank && this.tokens[k] !== ' ') this.ids[this.tokens[k]] = +k; }
      const ids = this.ids, longest = Math.max(...Object.keys(ids).map(t => t.length)), enc = [];
      let o = 0;
      form.split(' ').forEach(w => {
        for (let i = 0; i < w.length;) {
          let n = Math.min(longest, w.length - i);
          for (; n > 0; n--) if (ids[w.slice(i, i + n)] !== undefined) break;
          if (!n) throw new Error('no symbol for ' + w[i]);
          enc.push([o + i, ids[w.slice(i, i + n)]]); i += n;
        }
        o += w.length;
      });
      const names = enc.map(e => this.tokens[e[1]]);
      const fam = names.map(t => isMadd(t) ? Object.keys(ids).filter(u => isMadd(u) && u[0] === t[0]).map(u => ids[u]).sort((a, b) => a - b) : [ids[t]]);
      const first = align(L, fam, this.blank), V = L.V;
      const ends = first.slice(1).concat([L.frames]);
      const sure = first.map((f, i) => {
        let best = -Infinity;
        for (let t = f; t < Math.max(ends[i], f + 1); t++) for (const k of fam[i]) if (L.lp[t * V + k] > best) best = L.lp[t * V + k];
        return Math.exp(best) >= ASURE;
      });
      const on = first.map(f => f * L.frame), syl = [];
      for (let i = 0; i + 1 < names.length; i++) if (names[i].length === 2 && isCV(names[i]) && isShort(names[i + 1]) && sure[i] && sure[i + 1]) syl.push(on[i + 1] - on[i]);
      // the reading's own (two or more), else the reader's earlier readings, else the one syllable this reading has
      const own = syl.length >= 2 ? median(syl) : syl.length && !unit ? syl[0] : null, u = own || unit || null;
      for (let i = 1; i < names.length; i++) {
        if (!isMadd(names[i]) || enc[i][0] < at) continue;
        if (end != null && enc[i][0] >= end) return null;
        let span, ok;
        if (i + 1 < names.length) { span = on[i + 1] - on[i - 1]; ok = sure[i - 1] && sure[i + 1]; }
        else { span = on[i] - on[i - 1] + END; ok = sure[i - 1] && sure[i]; }
        const n = u ? span / u : null, good = ok && n != null && n > 0 && n <= TOP;
        return { count: good ? Math.round(n * 10) / 10 : null, ms: Math.round(span * 1000), unit: u ? Math.round(u * 1000) : null, own: !!own, syl: syl.length,
                 why: good ? null : !ok ? 'unsure' : !u ? 'unit' : 'range' };
      }
      return null;
    }
  }

  const MADD = 'اۥۦ', ASURE = 0.3, END = 0.08, TOP = 12;
  const isMadd = t => !!t && MADD.includes(t[0]) && Array.from(t).every(c => (MADD + 'ۜ').includes(c));
  const isCV = t => t.length >= 2 && 'َُِ'.includes(t[t.length - 1]) && !isMadd(t);
  // one letter with its short vowel, or one letter: a sound whose symbol comes as it begins (a long one is written as it ends)
  const isShort = t => (t.length === 2 && isCV(t)) || (t.length === 1 && !isMadd(t));
  const median = a => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  /* the best CTC path through log-probs L for places whose allowed ids are fam[i]; the first frame of each place */
  function align(L, fam, blank) {
    const T = L.frames, V = L.V, lp = L.lp, n = fam.length, S = 2 * n + 1, NEG = -1e30;
    const D = new Float64Array(T * S).fill(NEG), B = new Int32Array(T * S);
    const em = (t, s) => {
      if (!(s & 1)) return lp[t * V + blank];
      let best = -Infinity;
      for (const k of fam[s >> 1]) if (lp[t * V + k] > best) best = lp[t * V + k];
      return best;
    };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    D[0] = em(0, 0); if (S > 1) D[1] = em(0, 1);
    for (let t = 1; t < T; t++) for (let s = 0; s < S; s++) {
      const p = (t - 1) * S;
      let best = D[p + s], b = s;
      if (s >= 1 && D[p + s - 1] > best) { best = D[p + s - 1]; b = s - 1; }
      if ((s & 1) && s >= 3 && !same(fam[s >> 1], fam[(s >> 1) - 1]) && D[p + s - 2] > best) { best = D[p + s - 2]; b = s - 2; }
      D[t * S + s] = best + em(t, s); B[t * S + s] = b;
    }
    let s = D[(T - 1) * S + S - 1] >= D[(T - 1) * S + S - 2] ? S - 1 : S - 2;
    const first = new Array(n).fill(0);
    for (let t = T - 1; t >= 0; t--) { if (s & 1) first[s >> 1] = t; s = B[t * S + s]; }
    return first;
  }

  /* a recording (a Blob from MediaRecorder) as 16 kHz mono samples */
  async function samples(blob) {
    const ab = await blob.arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ac.decodeAudioData(ab);
    ac.close && ac.close();
    const n = Math.ceil(buf.duration * SR);
    const oc = new OfflineAudioContext(1, n, SR);
    const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
    return (await oc.startRendering()).getChannelData(0);
  }

  /* ---------- what was heard, set against the ways the words can be said (as checker-quran-lab/checker.py, Checker.listen) ---------- */
  const SURE = 0.5, MATCH = 0.3;
  /* letters, for comparing heard and written whatever the symbols; a madd's length is left out (Quran Lab: the recogniser's
     lengths are not to be trusted), so a run of a madd letter counts as long, and a run of waw or ya past a double as one madd */
  function flat(script, marg) {
    const pairs = [];
    Array.from(script).forEach((c, i) => { if (c !== ' ') pairs.push([c, marg ? marg[i] : 1]); });
    const out = [], ms = [];
    for (let i = 0; i < pairs.length;) {
      let j = i;
      while (j < pairs.length && pairs[j][0] === pairs[i][0]) j++;
      const c = pairs[i][0];
      const keep = 'اۥۦ'.includes(c) ? Math.min(j - i, 2) : 'وي'.includes(c) ? Math.min(j - i, 3) : j - i;
      for (let k = i; k < i + keep; k++) { out.push(pairs[k][0]); ms.push(pairs[k][1]); }
      i = j;
    }
    return [out, ms];
  }
  function diff(a, b) {
    const n = a.length, m = b.length, d = Array.from({ length: n + 1 }, (_, i) => { const r = new Int32Array(m + 1); r[0] = i; return r; });
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    const steps = [];
    let i = n, j = m;
    while (i || j) {
      if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)) { steps.push({ op: a[i - 1] === b[j - 1] ? 'same' : 'sub', i: i - 1, j: j - 1 }); i--; j--; }
      else if (i && d[i][j] === d[i - 1][j] + 1) { steps.push({ op: 'del', i: i - 1, j: null }); i--; }
      else { steps.push({ op: 'ins', i: null, j: j - 1 }); j--; }
    }
    return steps.reverse();
  }
  /* the answer in the shape the remote checker gives (heard_as, margin, matches_example), from {wasl, waqf} scripts */
  function judge(h, forms) {
    const [hl, hm] = flat(h.text, h.heard.flatMap(s => Array.from(s.p).map(() => s.margin)));
    const out = {};
    for (const name of ['wasl', 'waqf']) {
      const text = forms[name];
      if (!text) continue;
      const said = [], word = [];
      text.split(' ').forEach((w, k) => flat(w)[0].forEach(c => { said.push(c); word.push(k + 1); }));
      const steps = diff(said, hl), wrong = steps.filter(x => x.op !== 'same'), words = new Set();
      for (const x of wrong) {
        x.sure = !(x.j != null && hm[x.j] < SURE);   // a letter the model was unsure of is not taken as a mistake
        if (!x.sure || !said.length) continue;
        let i = x.i;
        if (i == null) { const y = steps.slice(steps.indexOf(x)).find(y => y.i != null); i = y ? y.i : said.length - 1; }
        words.add(word[Math.min(i, said.length - 1)]);
      }
      out[name] = { per: wrong.length / Math.max(1, said.length), words: [...words].sort((a, b) => a - b) };
    }
    const same = flat(forms.wasl || '')[0].join('') === flat(forms.waqf || '')[0].join('');
    const nearest = (out.wasl ? out.wasl.per : 9) <= (out.waqf ? out.waqf.per : 9) ? 'wasl' : 'waqf', best = out[nearest];
    return { heard_as: same ? 'same' : nearest, margin: same ? 0 : Math.round(((out.waqf ? out.waqf.per : 1) - (out.wasl ? out.wasl.per : 1)) * 1000) / 10,
             matches_example: best.per <= MATCH, similarity: Math.max(0, 1 - best.per), timing: null, symbols: [],
             engine: 'quran-lab-zipformer (on this device)', recogniser: { heard: h.text, nearest, forms: out } };
  }

  /* the length of a madd as Quran Lab's recogniser writes it: its script writes a madd as its letter repeated once for each
     count (اا two, اااا four, ۥۥۥۥۥۥ six). The madd of the asked word is found in the form nearest to what was heard, and the
     run that stands for it in what was heard is counted. 0: the madd was not heard (read as a short vowel). Nothing is
     measured here: the number is the model's own. */
  const MADDL = 'اۥۦ';
  const runs = t => { const r = []; for (const c of Array.from(t.replace(/ /g, ''))) { if (r.length && r[r.length - 1][0] === c) r[r.length - 1][1]++; else r.push([c, 1]); } return r; };
  function maddHeard(heard, form, wordIndex) {
    const words = form.split(' ');
    if (wordIndex >= words.length) return null;
    // the madd run in the asked word, as an index into the runs of the whole form
    const before = runs(words.slice(0, wordIndex).join('')).length, mine = runs(words[wordIndex]);
    const k = mine.findIndex(([c, n]) => MADDL.includes(c) && n >= 2);
    if (k < 0) return null;
    const said = runs(form), got = runs(heard), at = before + k;
    // runs set against runs by their letter alone, whatever their length
    const steps = diff(said.map(r => r[0]), got.map(r => r[0]));
    const st = steps.find(x => x.i === at);
    if (!st || st.op === 'del' || st.op === 'sub') return { counts: 0, said: said[at][1] };
    return { counts: got[st.j][1], said: said[at][1] };
  }

  /* the same measure from Quran Muaalem's answer (the Space's /hear: its symbols, one letter or mark each, with their times in
     the recording): the asked madd is found by its letters, as in maddHeard; its span runs from the onset of the letter before its
     short vowel to the onset of the next sound (at a stop, to the end of its last symbol); the unit is the reader's short
     syllable there (a letter, its short vowel, then a letter: onset to onset).
     `same`: the haraka Quran Lab's model measured on this very reading (seconds). The haraka is the reader's, not the model's:
     measured by each model apart, the two came out some 15% apart while the madd's time agreed (1320 and 1360 ms), and the
     counts with them. Given, it is used, so the two models differ only where they hear the madd's time differently. */
  const VOW = 'َُِ';
  function maddSymbols(syms, form, from, unit, same, until) {
    if (!syms || !syms.length || syms.some(s => s.start == null)) return null;
    // the first madd from `from` to before `until` (places in the form without its spaces, as for maddTime)
    const said = runs(form), bare = form.replace(/ /g, ''), before = runs(bare.slice(0, from)).length;
    const upto = until == null ? said.length : runs(bare.slice(0, until)).length;
    const k = said.slice(before, upto).findIndex(([c, n]) => MADDL.includes(c) && n >= 2);
    if (k < 0) return null;
    const at = before + k;
    if (at < 2 || !VOW.includes(said[at - 1][0])) return null;
    // the heard symbols as runs of one letter, each with the times of its first and last symbol
    const hr = [];
    syms.forEach(s => Array.from(s.p || '').forEach(c => { const r = hr[hr.length - 1]; if (r && r.c === c) { r.n++; r.end = s.end; } else hr.push({ c, n: 1, start: s.start, end: s.end }); }));
    const steps = diff(said.map(r => r[0]), hr.map(r => r.c)), to = i => { const st = steps.find(x => x.i === i); return st && st.j != null ? hr[st.j] : null; };
    const syl = [];
    for (let j = 0; j + 2 < hr.length; j++) if (hr[j].n === 1 && hr[j + 2].n === 1 && !VOW.includes(hr[j].c) && !MADDL.includes(hr[j].c) && VOW.includes(hr[j + 1].c) && !VOW.includes(hr[j + 2].c) && !MADDL.includes(hr[j + 2].c)) syl.push(hr[j + 2].start - hr[j].start);
    const own = same ? null : syl.length >= 2 ? median(syl) : syl.length && !unit ? syl[0] : null, u = same || own || unit || null;
    const c0 = to(at - 2), m = to(at), nx = at + 1 < said.length ? to(at + 1) : null;
    let span = null;
    if (c0 && nx) span = nx.start - c0.start;
    else if (c0 && at + 1 >= said.length && m && MADDL.includes(m.c)) span = m.end - c0.start;
    const n = span != null && u ? span / u : null, good = n != null && n > 0 && n <= TOP;
    return { count: good ? Math.round(n * 10) / 10 : null, ms: span == null ? null : Math.round(span * 1000), unit: u ? Math.round(u * 1000) : null, own: !!(own || same),
             why: good ? null : span == null ? 'unsure' : !u ? 'unit' : 'range' };
  }

  /* the qalqalah of the asked word, as Quran Muaalem heard it: each of its symbols carries `qalq`, its qalqalah head's
     probability of «مقلقل» there (the Space's /hear). The form's first ڇ from `from` to before `until` is the qalqalah asked; the
     heard letter before it and the heard ڇ (where there is one) are found by their letters, and the higher of their `qalq` says.
     Quran Lab's recogniser is not asked: it writes a qalqalah wherever the mushaf has one, heard or not. */
  const QALQ = 0.6;
  function qalqSymbols(syms, form, from, until) {
    if (!syms || !syms.length || syms.every(s => s.qalq == null)) return null;
    const said = runs(form), bare = form.replace(/ /g, ''), before = runs(bare.slice(0, from)).length;
    const upto = until == null ? said.length : runs(bare.slice(0, until)).length;
    const k = said.slice(before, upto).findIndex(([c]) => c === 'ڇ');
    if (k < 0 || before + k < 1) return null;
    const at = before + k;
    const hr = [];
    syms.forEach(s => Array.from(s.p || '').forEach(c => { const r = hr[hr.length - 1]; const q = s.qalq || 0; if (r && r.c === c) { r.q = Math.max(r.q, q); } else hr.push({ c, q }); }));
    const steps = diff(said.map(r => r[0]), hr.map(r => r.c)), to = i => { const st = steps.find(x => x.i === i); return st && st.j != null && st.op === 'same' ? hr[st.j] : null; };
    const letter = to(at - 1), mark = to(at);
    if (!letter && !mark) return { heard: null, q: null };
    const q = Math.max(letter ? letter.q : 0, mark ? mark.q : 0);
    return { heard: q >= QALQ, q: Math.round(q * 100) / 100 };
  }

  window.ZF = { fbank, load, samples, judge, resampler, maddHeard, maddSymbols, qalqSymbols, NOTICE: 'التصحيح الآلي للتجويد قد يخطئ، ولا يغني عن معلّم متقن.' };
})();

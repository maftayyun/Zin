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
  function fbank(x) {
    setup();
    const n = x.length, nf = Math.floor((n + FS / 2) / FS), out = new Float32Array(nf * NB);
    const w = new Float64Array(FL), re = new Float64Array(NFFT), im = new Float64Array(NFFT), p = new Float64Array(NFFT / 2);
    for (let f = 0; f < nf; f++) {
      const s0 = f * FS - (FL - FS) / 2;
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
        out[f * NB + b] = Math.log(Math.max(e, EPS));
      }
    }
    return { data: out, frames: nf };
  }

  async function cached(url) {
    /* the model is kept in the browser's cache after the first visit, so later visits need no connection */
    let c = null;
    try {
      c = await caches.open('zin-zf-v1');
      const hit = await c.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch (e) { c = null; }
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    if (c) try { await c.put(url, r.clone()); } catch (e) { /* a full or blocked cache only costs the next download */ }
    return new Uint8Array(await r.arrayBuffer());
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
    const bytes = await cached(base + man.model);
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
      const xs = new Float32Array(x.length + Math.round(TAIL * SR)); xs.set(x);
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
        s.start = +(s.start * frame).toFixed(3); s.end = +(s.end * frame).toFixed(3);
        delete s.peak;
      }
      return out;
    }

    async hear(x) {
      const r = await this.logProbs(x);
      const heard = this.greedy(r);
      return { heard, text: heard.map(s => s.p).join(''), frame: r.frame };
    }
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

  window.ZF = { fbank, load, samples, judge, NOTICE: 'التصحيح الآلي للتجويد قد يخطئ، ولا يغني عن معلّم متقن.' };
})();

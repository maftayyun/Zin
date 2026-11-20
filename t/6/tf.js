/* «زِنِ الحَرْفَ» — TajweedFormer V4 (Quran Lab, a waqf; licence NPL-1.2), used to measure how long a learner held a madd.
   The model runs on the learner's device in Quran Lab's frame; this page never sees the model and sends no audio anywhere.
   It is off until a web key is set in quranlab.js (sdk.quranlab.ai, origin https://maftayyun.github.io). Nothing is
   downloaded until the learner taps «قِس مدّك»: the first time, the SDK downloads the model once (55.5 MB).

   What is measured, and how (Quran Lab's model card, «How the results are read from the heads», step 6): the held sound
   of each long vowel from the timing head, over the take's median short vowel, mapped to 2, 4 or 6 counts by the cuts in
   the calibration that comes with the model when it has them. The SDK judges nothing; this page only reports the count it
   reads, beside the book's, with the sentence Quran Lab asks for. Madd lazim (6 counts) is off in the model's calibration,
   so the page never offers to measure it. */
(() => {
  'use strict';
  const CFG = window.ZIN_QURANLAB || {};
  const KEY = (CFG.key || '').trim();
  const LOADER = 'https://web.quranlab.ai/4/loader.js';
  const NOTE = 'الملاحظات الآلية على التجويد قد تخطئ. وهي لا تغني عن معلم مؤهل.';
  const LONG = ['aa', 'ii', 'uu'], SHORT = ['a', 'i', 'u'];
  let modelP = null;

  const loadLoader = () => window.QuranLab ? Promise.resolve() : new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = LOADER; s.crossOrigin = 'anonymous';
    s.onload = () => window.QuranLab ? ok() : no({ code: 'loader' }); s.onerror = () => no({ code: 'loader' });
    document.head.appendChild(s);
  });

  function model(onState) {
    if (!modelP) modelP = (async () => {
      onState && onState('loading');
      await loadLoader();
      const client = await window.QuranLab.TajweedClient.create({ key: KEY });
      onState && onState('downloading');
      return client.model();
    })().catch(e => { modelP = null; throw e; });
    return modelP;
  }

  /* the cuts from durations (in short vowels) to 2 | 4 | 6 counts, read from the calibration when it carries them */
  function cuts(m) {
    const fallback = [3, 5];
    try {
      const j = m.calibration && m.calibration.json;
      if (!j) return fallback;
      let found = null;
      const walk = (o, path) => {
        if (found || !o || typeof o !== 'object') return;
        for (const [k, v] of Object.entries(o)) {
          const p = (path + '.' + k).toLowerCase();
          if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number') && /madd/.test(p) && /cut/.test(p)) { found = v.slice().sort((a, b) => a - b); return; }
          walk(v, p);
        }
      };
      walk(j, '');
      return found && found[0] > 1 && found[1] > found[0] && found[1] < 10 ? found : fallback;
    } catch (e) { return fallback; }
  }

  const median = xs => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

  /* one take: the learner reads, the take ends after a short silence; returns what was measured */
  async function measure(onState) {
    const m = await model(onState);
    onState && onState('listening');
    const session = await m.listen({ endOnSilenceMs: 1300, heads: ['log_probs', 'inter1_log_probs', 'timing_log_probs', 'conf'] });
    for await (const c of session.chunks) { if (c.speech) onState && onState('hearing'); }
    const heads = await session.finish();
    const name = id => m.tokens.name(id);
    const held = heads.greedy('timing_log_probs').map(t => ({ n: name(t.id), ms: t.lastMs - t.firstMs + 20, at: t.firstMs }));
    const shorts = held.filter(t => SHORT.includes(t.n)).map(t => t.ms);
    const longs = held.filter(t => LONG.includes(t.n));
    const heard = heads.decoded().text;
    if (!longs.length || shorts.length < 2) return { ok: false, heard, why: !longs.length ? 'nolong' : 'short' };
    const unit = median(shorts), lng = longs.reduce((a, b) => (b.ms > a.ms ? b : a));
    const r = lng.ms / unit, [c1, c2] = cuts(m);
    const counts = r < c1 ? 2 : r < c2 ? 4 : 6;
    return { ok: true, heard, ratio: Math.round(r * 10) / 10, counts, ms: lng.ms, unitMs: Math.round(unit) };
  }

  const words = e => {
    const c = e && (e.code || e.name || '');
    if (c === 'microphone_denied') return 'لم يُسمح باستعمال الميكروفون. اسمح به من إعدادات المتصفح، ثم أعد.';
    if (c === 'microphone_unavailable') return 'لا يوجد ميكروفون في هذا الجهاز.';
    if (c === 'loader' || c === 'needs_connection' || c === 'network') return 'تعذّر الاتصال بـ Quran Lab. تحقّق من الاتصال، ثم أعد.';
    if (c === 'key_refused' || c === 'invalid_key' || c === 'origin_not_allowed') return 'لم يقبل Quran Lab مفتاح هذا الموقع.';
    if (c === 'browser_unsupported' || c === 'unsupported') return 'هذا المتصفح لا يشغّل النموذج. جرّب Chrome أو Safari الحديث.';
    return 'تعذّر القياس هذه المرة. أعد المحاولة.';
  };

  window.ZinTF = { available: () => !!KEY && window.isSecureContext && 'WebAssembly' in window, measure, words, NOTE };
})();

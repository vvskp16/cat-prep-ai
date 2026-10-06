#!/usr/bin/env node
// Node 18+; no packages required. Read-only test and optional attempt data.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const PLAYER = 'https://test-player.imsindia.com';
const API = 'https://api.test-player.imsindia.com';
const help = `Usage: node dev_scripts/extraction/ims_export.mjs [options]
  --input FILE        Export an already saved /test/info JSON response offline.
  --with-statistics   Also fetch /test-attempts/attempt-info (one extra request).
  --attempt-input FILE  Merge a saved attempt-info response without fetching it.
  --output DIRECTORY  Default: ims_exports/<title>-<test-id>
  --download-images   Save referenced HTTPS images for offline reading.
  --help              Show this help.
Live mode reads IMS_TEST_URL or IMS_TEST_TOKEN, or prompts with hidden input.
Exports questions.json, questions.html, videos.json, raw_test.json and images.json.
With statistics, also exports statistics.json and raw_attempt.json.
No test-start, answer-save, submit, video-OTP or DRM endpoints are called.`;

export function decodeContent(value) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error('Unexpected non-string content field.');
  const compact = value.replace(/\s/g, '');
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) return value;
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.toString('base64') !== compact) return value;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(decoded) ? value : decoded;
  } catch { return value; }
}

function imageUrls(html) {
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map(match => match[1].replace(/&amp;/g, '&'));
}

export function normalize(payload) {
  if (payload.success === false) throw new Error('IMS reported an unsuccessful response.');
  const test = payload.data ?? payload;
  if (!Array.isArray(test.groups)) throw new Error('Unrecognized IMS schema: groups is missing.');
  const questions = [];
  const sections = [];
  const videos = new Map();
  for (const group of test.groups) {
    if (!Array.isArray(group.sections)) throw new Error('Unrecognized IMS schema: sections is missing.');
    for (const section of group.sections) {
      if (!Array.isArray(section.questions)) throw new Error('Unrecognized IMS schema: question blocks are missing.');
      const before = questions.length;
      for (const block of section.questions) {
        const data = block.question_data;
        if (!Array.isArray(data?.questions)) throw new Error('Unrecognized IMS schema: question_data.questions is missing.');
        // A DILR set's video is often attached only to its first question.
        const setVideos = [...new Set(data.questions.map(q => q.review?.video).filter(Boolean))];
        for (const q of data.questions) {
          if (q.question == null || !q.question_id) throw new Error('Question text or ID is missing.');
          const options = (q.options ?? []).map((option, index) => ({
            index: index + 1,
            html: decodeContent(typeof option === 'string' ? option : option.text),
            is_correct: typeof option === 'object' ? option.is_correct ?? null : null,
          }));
          const ownVideo = q.review?.video || null;
          const relatedVideos = ownVideo ? [ownVideo] : data.is_group ? setVideos : [];
          const row = {
            number: questions.length + 1,
            question_id: q.question_id,
            authoring_question_id: q.authoring_question_id ?? null,
            identifier: q.identifier ?? null,
            group_id: group._id,
            group: group.name,
            section_id: section._id,
            section: section.name,
            block_id: block._id,
            block_position: block.position ?? null,
            question_order: q.order ?? null,
            is_group: !!data.is_group,
            type: q.type ?? null,
            answer_format: q.answer_format ?? null,
            passage_html: decodeContent(data.passage),
            direction_html: decodeContent(q.question_direction),
            question_html: decodeContent(q.question),
            options,
            correct_answer: q.correct_answer ?? null,
            solution_html: decodeContent(q.review?.text),
            video_id: ownVideo,
            related_video_ids: relatedVideos,
            video_reference_source: ownVideo ? 'question' : relatedVideos.length ? 'shared_set' : null,
            topic: q.topic ?? null,
            area: q.area ?? null,
            sub_topic: q.sub_topic ?? null,
            scoring: block.scoring ?? section.config?.scoring ?? group.config?.scoring ?? null,
          };
          row.image_urls = [...new Set([row.passage_html, row.direction_html, row.question_html,
            row.solution_html, ...options.map(o => o.html)].flatMap(imageUrls))];
          questions.push(row);
          for (const videoId of relatedVideos) {
            if (!videos.has(videoId)) videos.set(videoId, { video_id: videoId,
              provider: 'VdoCipher', question_numbers: [], question_ids: [],
              download_url: null, playback: 'Open the completed test in IMS to watch.' });
            const video = videos.get(videoId);
            video.question_numbers.push(row.number);
            video.question_ids.push(row.question_id);
          }
        }
      }
      sections.push({ id: section._id, name: section.name, question_count: questions.length - before });
    }
  }
  if (!questions.length) throw new Error('No questions returned. Open the test normally in IMS; this exporter will not start it.');
  if (test.question_count != null && Number(test.question_count) !== questions.length) {
    throw new Error(`Incomplete response: expected ${test.question_count} questions, found ${questions.length}.`);
  }
  return { schema_version: 1, source: PLAYER, exported_at: new Date().toISOString(),
    test: { id: test._id, title: test.title, status: test.status, layout: test.layout },
    sections, question_count: questions.length, questions, videos: [...videos.values()] };
}

export function mergeStatistics(data, payload) {
  if (payload.success === false) throw new Error('IMS reported an unsuccessful statistics response.');
  const attempt = payload.data ?? payload;
  if (!Array.isArray(attempt.groups)) throw new Error('Unrecognized statistics schema: groups is missing.');
  const byId = new Map();
  for (const group of attempt.groups) {
    if (!Array.isArray(group.sections)) throw new Error('Unrecognized statistics schema: sections is missing.');
    for (const section of group.sections) {
      if (!Array.isArray(section.questions)) throw new Error('Unrecognized statistics schema: questions is missing.');
      for (const row of section.questions) {
        const id = row._id;
        if (!id || byId.has(id)) throw new Error('Missing or duplicate question ID in statistics response.');
        if (row.advance_statistics?.question_id && row.advance_statistics.question_id !== id) {
          throw new Error('Statistics question ID does not match its attempt record.');
        }
        byId.set(id, { row, sectionId: section._id });
      }
    }
  }
  const questionIds = new Set(data.questions.map(q => q.question_id));
  if ([...byId.keys()].some(id => !questionIds.has(id))) {
    throw new Error('Statistics contain questions outside the exported test. Check the input files.');
  }
  const cohort = source => source ? {
    attempt_percentage: source.attempt_percentage ?? null,
    accuracy_percentage: source.accuracy_percentage ?? null,
    p_value: source.p_value ?? null,
    average_time_taken_ms: source.average_time_taken ?? null,
  } : null;
  let matched = 0;
  let withStatistics = 0;
  for (const q of data.questions) {
    const record = byId.get(q.question_id);
    q.statistics = null;
    q.attempt = null;
    if (!record) continue;
    if (record.sectionId !== q.section_id) throw new Error('Statistics section ID does not match its question.');
    matched++;
    const { row } = record;
    q.attempt = { status: row.status ?? null, time_taken_ms: row.time_taken ?? null,
      non_evaluated: row.non_evaluated ?? null };
    const source = row.advance_statistics;
    if (source) {
      withStatistics++;
      q.statistics = { question_type: source.question_type ?? null,
        toppers_statistics: cohort(source.toppers_statistics),
        overall_statistics: cohort(source.overall_statistics) };
    }
  }
  if (!matched) throw new Error('No statistics question IDs match the exported test.');
  data.statistics_summary = { source_endpoint: `${API}/test-attempts/attempt-info`,
    matched_question_count: matched, questions_with_statistics: withStatistics,
    missing_question_count: data.question_count - matched,
    time_unit: 'milliseconds', percentage_unit: 'percent (0–100)',
    classification: 'IMS question_type is preserved as supplied; no difficulty thresholds are inferred.' };
  return data;
}

export function parseToken(input) {
  let token = input.trim();
  if (/^https?:\/\//i.test(token)) {
    const url = new URL(token);
    if (url.origin !== PLAYER || url.pathname !== '/') throw new Error('Expected an IMS test-player URL.');
    if (url.searchParams.get('isCyoq') === 'true') throw new Error('CYOQ uses a different API and is not supported.');
    token = url.searchParams.get('token') ?? '';
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('Expected the full test-player URL or JWT.');
  // Decoding is only an input check, not signature verification. IMS verifies it.
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid token payload.'); }
  if (!claims.test_id) throw new Error('Token does not identify a test.');
  if (claims.exp && claims.exp * 1000 <= Date.now()) throw new Error('Link has expired. Open a fresh link from your IMS account.');
  return { token, testId: claims.test_id };
}

async function hiddenInput() {
  if (!process.stdin.isTTY) throw new Error('Set IMS_TEST_URL or IMS_TEST_TOKEN, or use --input.');
  process.stdout.write('Paste the IMS test URL (hidden), then press Enter: ');
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  return new Promise((resolveInput, reject) => {
    let value = '';
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      error ? reject(error) : resolveInput(value);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function fetchIMS(path, token, fetcher, sessionId) {
  let response;
  try {
    response = await fetcher(`${API}${path}`, { method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`,
        'session-id': sessionId, Accept: 'application/json' } });
  } catch { throw new Error('Network request failed. Check your connection and environment network permissions.'); }
  if (!response.ok) {
    const reason = { 401: 'Refresh your IMS link.', 403: 'IMS refused access; use your account normally or contact IMS.',
      409: 'IMS reports a session conflict; close the conflicting session normally.',
      429: 'Rate limited; wait before trying again.' }[response.status] ?? 'Open the test normally in IMS.';
    throw new Error(`IMS returned HTTP ${response.status}. ${reason}`);
  }
  try { return await response.json(); } catch { throw new Error('IMS did not return JSON.'); }
}

export function fetchTest(token, fetcher = fetch, sessionId = randomUUID()) {
  return fetchIMS('/test/info', token, fetcher, sessionId);
}

export function fetchAttemptInfo(token, fetcher = fetch, sessionId = randomUUID()) {
  return fetchIMS('/test-attempts/attempt-info', token, fetcher, sessionId);
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatTime = ms => {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function statisticsTable(q) {
  if (!q.statistics && !q.attempt) return '';
  const percent = value => value == null ? '—' : `${escapeHtml(value)}%`;
  const row = (label, stats) => `<tr><th>${label}</th><td>${formatTime(stats?.average_time_taken_ms)}</td><td>${percent(stats?.attempt_percentage)}</td><td>${percent(stats?.accuracy_percentage)}</td><td>${stats?.p_value == null ? '—' : escapeHtml(Number(stats.p_value).toFixed(2))}</td></tr>`;
  return `<div class="statistics"><p><b>IMS type:</b> ${escapeHtml(q.statistics?.question_type ?? 'Unavailable')} · <b>Your status:</b> ${escapeHtml(q.attempt?.status ?? 'Unavailable')} · <b>Your time:</b> ${formatTime(q.attempt?.time_taken_ms)}</p>
    <table><thead><tr><th>Cohort</th><th>Average time</th><th>Attempt</th><th>Accuracy</th><th>p-value</th></tr></thead><tbody>
    ${row('Toppers', q.statistics?.toppers_statistics)}${row('All test takers', q.statistics?.overall_statistics)}</tbody></table></div>`;
}

function frame(html) {
  if (!html) return '';
  // Preserve full documents and rendered MathJax, but block source scripts.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: file:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'">`;
  const doc = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, head => head + policy)
    : `<!doctype html><html><head>${policy}<style>body{font:16px/1.6 system-ui;margin:8px}img{max-width:100%}table{border-collapse:collapse}td,th{padding:6px}</style></head><body>${html}</body></html>`;
  return `<iframe sandbox="allow-same-origin" loading="lazy" title="Question content" srcdoc="${escapeHtml(doc)}" onload="this.style.height=Math.max(60,this.contentDocument.documentElement.scrollHeight+20)+'px'"></iframe>`;
}

export function reader(data) {
  const resizeOnOpen = `ontoggle="if(this.open)requestAnimationFrame(()=>this.querySelectorAll('iframe').forEach(f=>{if(f.contentDocument)f.style.height=Math.max(60,f.contentDocument.documentElement.scrollHeight+20)+'px'}))"`;
  const items = data.questions.map(q => `<article id="q${q.number}"><h2>Q${q.number} · ${escapeHtml(q.section)}</h2>
    ${statisticsTable(q)}
    ${q.passage_html ? `<details ${resizeOnOpen}><summary>Passage / question set</summary>${frame(q.passage_html)}</details>` : ''}
    ${frame(q.direction_html)}${frame(q.question_html)}
    ${q.options.map(o => `<div class="option"><b>${o.index}.</b>${frame(o.html)}</div>`).join('')}
    <details ${resizeOnOpen}><summary>Written solution and answer</summary>${frame(q.solution_html)}
    <p>${q.correct_answer != null ? `Answer: ${escapeHtml(JSON.stringify(q.correct_answer))}` :
      q.options.some(o => o.is_correct === true) ? `Correct option(s): ${q.options.filter(o => o.is_correct === true).map(o => o.index).join(', ')}` :
      'No separate answer key was supplied; see the written solution.'}</p></details>
    ${q.related_video_ids.length ? `<p class="video">Video solution${q.video_reference_source === 'shared_set' ? ' for this set' : ''}: ${q.related_video_ids.map(escapeHtml).join(', ')}. Watch in IMS.</p>` : ''}
    </article>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(data.test.title)}</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:32px auto;padding:0 20px;color:#172133;background:#f5f7fa}article{background:white;padding:24px;margin:24px 0;border:1px solid #d9e0e8;border-radius:12px}h2{font-size:20px}iframe{display:block;width:100%;border:0;min-height:80px}details{margin:12px 0}summary{cursor:pointer;font-weight:600}.option{display:flex;gap:10px}.option iframe{flex:1;min-width:0}.video{font-size:13px;overflow-wrap:anywhere;color:#546174}nav a{display:inline-block;margin:4px 8px}.statistics{overflow-x:auto;background:#f5f7fa;padding:12px;border-radius:8px}.statistics table{border-collapse:collapse;width:100%;font-size:14px}.statistics th,.statistics td{text-align:left;padding:6px;border-bottom:1px solid #d9e0e8}@media print{body{background:white}article{break-inside:avoid}nav{display:none}}</style></head><body>
    <h1>${escapeHtml(data.test.title)}</h1><p>${data.question_count} questions · ${data.videos.length} video references · ${escapeHtml(data.test.status)}</p>
    <p>Passages, options and written solutions are preserved as HTML. Videos require IMS playback.</p>
    ${data.statistics_summary ? `<p>Statistics available for ${data.statistics_summary.questions_with_statistics}/${data.question_count} questions. IMS type labels are preserved as supplied. Times display whole seconds; JSON retains exact milliseconds.</p>` : ''}
    <nav>${data.questions.map(q => `<a href="#q${q.number}">${q.number}</a>`).join('')}</nav>${items}</body></html>`;
}

async function downloadImages(data, output) {
  const urls = [...new Set(data.questions.flatMap(q => q.image_urls))];
  const manifest = [];
  await mkdir(resolve(output, 'images'), { recursive: true });
  for (const source of urls) {
    if (source.startsWith('data:')) continue;
    let url;
    try { url = new URL(source, PLAYER); } catch { throw new Error('Invalid image URL in test content.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsupported image URL in test content.');
    // No subscription credentials are sent to image hosts.
    let response;
    try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Image request failed; rerun without --download-images to preserve remote references.'); }
    if (!response.ok) throw new Error(`Image download returned HTTP ${response.status}; no automatic retry performed.`);
    const mime = response.headers.get('content-type')?.split(';')[0];
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' }[mime];
    if (!extension) throw new Error('Image host returned an unsupported content type.');
    const file = `images/${createHash('sha256').update(source).digest('hex').slice(0,20)}.${extension}`;
    await writeFile(resolve(output, file), Buffer.from(await response.arrayBuffer()));
    manifest.push({ source_url: source, local_path: file });
    const replace = html => html.split(source).join(file).split(source.replace(/&/g, '&amp;')).join(file);
    for (const q of data.questions) {
      for (const key of ['passage_html', 'direction_html', 'question_html', 'solution_html']) q[key] = replace(q[key]);
      q.options.forEach(o => { o.html = replace(o.html); });
    }
    await new Promise(done => setTimeout(done, 300));
  }
  return manifest;
}

function privateRaw(key, value) {
  return ['student', 'response', 'token', 'access_token', 'authorization', 'ims_pin'].includes(key.toLowerCase()) ? undefined : value;
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') { console.log(help); return; }
    if (arg === '--download-images') { options.images = true; continue; }
    if (arg === '--with-statistics') { options.statistics = true; continue; }
    if (arg === '--input' || arg === '--output' || arg === '--attempt-input') {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`Unknown option: ${arg}. Use --help.`);
  }
  let payload;
  let attemptPayload;
  let requestedTest;
  if (options.input && options.statistics && !options['attempt-input']) {
    throw new Error('Offline --input requires --attempt-input FILE to include statistics.');
  }
  if (options.input) payload = JSON.parse((await readFile(options.input, 'utf8')).replace(/^\uFEFF/, ''));
  else {
    const credentials = parseToken(process.env.IMS_TEST_URL || process.env.IMS_TEST_TOKEN || await hiddenInput());
    requestedTest = credentials.testId;
    const sessionId = randomUUID();
    payload = await fetchTest(credentials.token, fetch, sessionId);
    if (requestedTest !== (payload.data ?? payload)._id) throw new Error('Returned test ID does not match the supplied link.');
    if (options.statistics && !options['attempt-input']) attemptPayload = await fetchAttemptInfo(credentials.token, fetch, sessionId);
  }
  const data = normalize(payload);
  if (requestedTest && data.test.id !== requestedTest) throw new Error('Returned test ID does not match the supplied link.');
  if (options['attempt-input']) attemptPayload = JSON.parse((await readFile(options['attempt-input'], 'utf8')).replace(/^\uFEFF/, ''));
  if (attemptPayload) mergeStatistics(data, attemptPayload);
  const slug = String(data.test.title ?? 'test').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const safeId = String(data.test.id ?? 'unknown').replace(/[^a-z0-9_-]/gi, '_');
  const output = resolve(options.output ?? `ims_exports/${slug}-${safeId}`);
  await mkdir(output, { recursive: true });
  const images = options.images ? await downloadImages(data, output) : [];
  const json = value => JSON.stringify(value, null, 2) + '\n';
  await writeFile(resolve(output, 'questions.json'), json(data));
  await writeFile(resolve(output, 'videos.json'), json(data.videos));
  await writeFile(resolve(output, 'raw_test.json'), JSON.stringify(payload.data ?? payload, privateRaw, 2) + '\n');
  if (attemptPayload) {
    await writeFile(resolve(output, 'raw_attempt.json'), JSON.stringify(attemptPayload.data ?? attemptPayload, privateRaw, 2) + '\n');
    await writeFile(resolve(output, 'statistics.json'), json({ test: data.test, exported_at: data.exported_at,
      ...data.statistics_summary, questions: data.questions.map(q => ({ number: q.number,
        question_id: q.question_id, section: q.section, statistics: q.statistics, attempt: q.attempt })) }));
  }
  await writeFile(resolve(output, 'images.json'), json({ downloaded: !!options.images, images,
    remote_urls: [...new Set(data.questions.flatMap(q => q.image_urls))].filter(url => !url.startsWith('data:')) }));
  await writeFile(resolve(output, 'questions.html'), reader(data));
  console.log(`Exported ${data.question_count} questions, ${data.questions.filter(q => q.solution_html).length} written solutions, ${data.videos.length} video references, ${images.length} images.`);
  if (data.statistics_summary) console.log(`Statistics: ${data.statistics_summary.questions_with_statistics}/${data.question_count} questions.`);
  console.log(`Saved to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Export failed: ${error.message}`); process.exitCode = 1; });
}

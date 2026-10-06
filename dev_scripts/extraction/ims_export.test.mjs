import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeContent, normalize, mergeStatistics, parseToken, fetchTest, fetchAttemptInfo, reader, main } from './ims_export.mjs';

const encoded = text => Buffer.from(text).toString('base64');
const fixture = () => ({ success: true, data: { _id: 'test1', title: 'Sample', status: 'completed',
  groups: [{ _id: 'g1', name: 'DILR', sections: [{ _id: 's1', name: 'DILR', questions: [{
    _id: 'set1', position: 0, question_data: { is_group: true, passage: encoded('<p>Shared passage α</p>'),
      questions: [{ question_id: 'q1', question: encoded('<p>First?</p>'),
        options: [{ text: encoded('<p>A</p>'), is_correct: true }], review: { video: 'video1', text: encoded('<p>Reason</p>') } },
      { question_id: 'q2', question: encoded('<p>Second?</p>'), correct_answer: '9', review: { text: encoded('<p>Calculation</p>') } }] },
  }] }] }] } });

const statisticsFixture = () => ({ success: true, data: { groups: [{ sections: [{ _id: 's1', questions: [
  { _id: 'q2', status: 'correct', time_taken: 0, advance_statistics: { question_id: 'q2', question_type: 'C',
    toppers_statistics: { attempt_percentage: 0, accuracy_percentage: 0, p_value: 0, average_time_taken: 0 } } },
  { _id: 'q1', status: 'skipped', time_taken: 35832, advance_statistics: { question_id: 'q1', question_type: 'A',
    toppers_statistics: { attempt_percentage: 74.8, accuracy_percentage: 85.03, p_value: 63.6, average_time_taken: 319000 },
    overall_statistics: { attempt_percentage: 54.99, accuracy_percentage: 65.45, p_value: 35.99, average_time_taken: 322000 } } },
] }] }] } });

test('decodes Unicode HTML without corrupting plain text', () => {
  assert.equal(decodeContent(encoded('<p>₹5 × α</p>')), '<p>₹5 × α</p>');
  assert.equal(decodeContent('<p>Already decoded</p>'), '<p>Already decoded</p>');
  assert.equal(decodeContent('test'), 'test');
  assert.equal(decodeContent(null), '');
});

test('preserves shared passages, answer flags and set-level video relationships', () => {
  const data = normalize(fixture());
  assert.equal(data.question_count, 2);
  assert.equal(data.questions[0].options[0].is_correct, true);
  assert.equal(data.questions[1].correct_answer, '9');
  assert.equal(data.questions[1].passage_html, '<p>Shared passage α</p>');
  assert.equal(data.questions[1].video_id, null);
  assert.equal(data.questions[1].video_reference_source, 'shared_set');
  assert.deepEqual(data.videos[0].question_ids, ['q1', 'q2']);
});

test('joins statistics by question ID, preserves zero values and exact milliseconds', () => {
  const data = mergeStatistics(normalize(fixture()), statisticsFixture());
  assert.equal(data.questions[0].statistics.question_type, 'A');
  assert.equal(data.questions[0].statistics.toppers_statistics.average_time_taken_ms, 319000);
  assert.equal(data.questions[0].attempt.time_taken_ms, 35832);
  assert.equal(data.questions[1].statistics.question_type, 'C');
  assert.equal(data.questions[1].statistics.toppers_statistics.p_value, 0);
  assert.equal(data.questions[1].attempt.time_taken_ms, 0);
  assert.equal(data.questions[1].statistics.overall_statistics, null);
  assert.equal(data.statistics_summary.questions_with_statistics, 2);
  // MCQ/TITA format stays separate from IMS's A/B/C classification.
  assert.equal(data.questions[0].type, null);
});

test('rejects statistics from another test, duplicate IDs and inconsistent sections', () => {
  const otherTest = statisticsFixture();
  otherTest.data.groups[0].sections[0].questions[0]._id = 'other-question';
  otherTest.data.groups[0].sections[0].questions[0].advance_statistics.question_id = 'other-question';
  assert.throws(() => mergeStatistics(normalize(fixture()), otherTest), /outside the exported test/);
  const duplicate = statisticsFixture();
  duplicate.data.groups[0].sections[0].questions.push(duplicate.data.groups[0].sections[0].questions[0]);
  assert.throws(() => mergeStatistics(normalize(fixture()), duplicate), /duplicate/);
  const wrongSection = statisticsFixture();
  wrongSection.data.groups[0].sections[0]._id = 'different-section';
  assert.throws(() => mergeStatistics(normalize(fixture()), wrongSection), /section ID/);
  const wrongQuestion = statisticsFixture();
  wrongQuestion.data.groups[0].sections[0].questions[0].advance_statistics.question_id = 'q1';
  assert.throws(() => mergeStatistics(normalize(fixture()), wrongQuestion), /question ID/);
  assert.throws(() => mergeStatistics(normalize(fixture()), { success: false }), /unsuccessful/);
});

test('reports missing statistics explicitly instead of inventing values', () => {
  const partial = statisticsFixture();
  partial.data.groups[0].sections[0].questions.shift();
  const data = mergeStatistics(normalize(fixture()), partial);
  assert.equal(data.statistics_summary.missing_question_count, 1);
  assert.equal(data.statistics_summary.questions_with_statistics, 1);
  assert.equal(data.questions[1].statistics, null);
  assert.equal(data.questions[1].attempt, null);
});

test('rejects unavailable, malformed and incomplete tests', () => {
  assert.throws(() => normalize({ success: false }), /unsuccessful/);
  assert.throws(() => normalize({ data: {} }), /groups/);
  const noQuestions = fixture();
  noQuestions.data.groups = [];
  assert.throws(() => normalize(noQuestions), /No questions/);
  const partial = fixture();
  partial.data.question_count = 3;
  assert.throws(() => normalize(partial), /Incomplete/);
});

test('accepts only the intended player and rejects expired tokens', () => {
  const token = `e30.${Buffer.from(JSON.stringify({ test_id: 'test1', exp: 4102444800 })).toString('base64url')}.signature`;
  assert.equal(parseToken(`https://test-player.imsindia.com/?token=${token}`).testId, 'test1');
  assert.throws(() => parseToken(`https://example.org/?token=${token}`), /Expected an IMS/);
  assert.throws(() => parseToken(`https://test-player.imsindia.com/?token=${token}&isCyoq=true`), /not supported/);
  const expired = `e30.${Buffer.from(JSON.stringify({ test_id: 'test1', exp: 1 })).toString('base64url')}.signature`;
  assert.throws(() => parseToken(expired), /expired/);
});

test('fetches only test info and stops on access denial or rate limits without leaking credentials', async () => {
  let calls = 0;
  const payload = await fetchTest('private-token', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.test-player.imsindia.com/test/info');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    return { ok: true, json: async () => fixture() };
  });
  assert.equal(payload.data._id, 'test1');
  assert.equal(calls, 1);
  for (const status of [401, 403, 409, 429]) {
    let attempts = 0;
    await assert.rejects(fetchTest('private-token', async () => { attempts++; return { ok: false, status }; }),
      error => error.message.includes(String(status)) && !error.message.includes('private-token'));
    assert.equal(attempts, 1);
  }
});

test('statistics mode uses a second read endpoint and shares the session ID', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/test/info') ? fixture() : statisticsFixture() };
  };
  const content = await fetchTest('private-token', fetcher, 'shared-session');
  const attempt = await fetchAttemptInfo('private-token', fetcher, 'shared-session');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.test-player.imsindia.com/test-attempts/attempt-info');
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.headers['session-id'] === 'shared-session'));
  assert.equal(mergeStatistics(normalize(content), attempt).statistics_summary.matched_question_count, 2);
  await assert.rejects(main(['--input', 'unused.json', '--with-statistics']), /requires --attempt-input/);
});

test('reader isolates source HTML and escapes titles', () => {
  const data = normalize(fixture());
  data.test.title = '<script>bad()</script>';
  data.questions[0].question_html = '<script>bad()</script><p>Question</p>';
  const html = reader(data);
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(html.includes('sandbox="allow-same-origin"'));
  assert.ok(!html.includes('allow-scripts'));
  assert.ok(!html.includes('<script>bad()'));
});

test('reader displays topper and overall statistics with A/B/C type and formatted time', () => {
  const html = reader(mergeStatistics(normalize(fixture()), statisticsFixture()));
  for (const value of ['IMS type:</b> A', '05:19', '74.8%', '85.03%', '63.60', 'All test takers', '00:35', '00:00']) {
    assert.ok(html.includes(value), `Missing rendered statistics value: ${value}`);
  }
});

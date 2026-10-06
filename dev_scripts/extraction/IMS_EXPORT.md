Use Node.js 18 or newer. No browser automation or extra packages are required.

From the repository root, run:

```powershell
node dev_scripts/extraction/ims_export.mjs --download-images
```

Paste the full IMS test-player link at the hidden prompt and press Enter. The link is not echoed, saved in source, or included in exports. For automation, supply `IMS_TEST_URL` or `IMS_TEST_TOKEN` through your environment.

The exporter makes one authenticated `GET https://api.test-player.imsindia.com/test/info` using the provided token and a session UUID. It checks the returned test ID against the link. It stops on access denial, session conflicts, or rate limits. It does not start a test, save responses, submit it, probe other test IDs, or request video credentials. IMS can log these requests; access is not invisible.

To include question statistics, run:

```powershell
node dev_scripts/extraction/ims_export.mjs --with-statistics --download-images
```

This makes **two requests per test**: the content request and `GET /test-attempts/attempt-info`, using the same session UUID. The second response supplies statistics for all questions together. Remote images, if any, require separate GETs. The saved SimCAT 3 response has statistics for all 68 questions; these were merged without further network calls.

Statistics are joined by the question ID and checked against the section ID, rather than matched by row position. Each question has `statistics.question_type` (the IMS A/B/C label), `statistics.toppers_statistics`, `statistics.overall_statistics`, and `attempt` (your status, time, and evaluation flag). The existing `type` field remains the question format, such as MCQ or type-in-the-answer. Missing statistics stay `null`, and `statistics_summary` reports coverage.

Times use explicit `_ms` field names and retain the API's exact milliseconds. Percentages are on a 0–100 scale. `p_value` is copied from IMS as supplied. A/B/C labels are preserved; the exporter does not infer difficulty thresholds or define the topper cohort. Displayed times in the HTML use whole seconds.

The actual hyperlink supplied in this conversation opens **SimCAT 3 2026**, test ID `6a6cb24d2dbcd53a916a6197`. The displayed link text contained a different test ID. The successfully retrieved completed test has 24 VARC, 22 DILR, and 22 QA questions, 68 written solutions, and 51 distinct video references.

Default output: `ims_exports/<title>-<test-id>/`, excluded from Git.

- `questions.json`: decoded HTML, options, available answer flags, passages, topics, written solutions, video relationships, and optional statistics. One row per individual question. Source order is preserved; source position/order fields are included. A missing standalone answer key remains `null` rather than being inferred from the student's response.
- `questions.html`: readable question collection with collapsible passages and solutions, plus per-question statistics tables when supplied. Open it locally in your browser. Source HTML runs in frames with scripts blocked; existing rendered MathJax is preserved. If the source supplies only TeX, it stays as TeX.
- `videos.json`: video IDs mapped to questions, including shared DILR set references. IMS uses VdoCipher's player with temporary OTP/playback credentials and encrypted-media support. These IDs are not MP4 links. Watch the videos through IMS; this exporter does not download protected streams or remove DRM.
- `raw_test.json`: original test structure, with student information and question response objects removed.
- `statistics.json` and `raw_attempt.json`: produced when attempt data is supplied. The first contains only question IDs, cohort statistics, your status/time, and coverage metadata; the second preserves the original attempt structure with the same private-field filtering as `raw_test.json`.
- `images.json` and `images/`: image URLs and, when requested, downloaded image files. Image requests are sequential and receive no subscription token. Embedded data images stay embedded. Without `--download-images`, remote diagrams still require connectivity. Only quoted `<img src>` references are localized; external CSS, fonts, or `srcset` assets are not bundled.

Offline mode accepts a saved `/test/info` JSON response and makes no network requests unless image downloading is requested:

```powershell
node dev_scripts/extraction/ims_export.mjs --input path/to/test-info.json
node dev_scripts/extraction/ims_export.mjs --input path/to/test-info.json --attempt-input path/to/attempt-info.json
```

Use `--output DIRECTORY` for a custom export folder. Keep subscription content and token-bearing links private; only the default `ims_exports/` output root is ignored automatically.

Checks:

```powershell
node --test dev_scripts/extraction/ims_export.test.mjs
```

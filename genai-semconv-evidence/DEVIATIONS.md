# Reference implementation: deviations from the issue text

Issue: "Align gh-aw OpenTelemetry with the OpenTelemetry GenAI semantic conventions". "Issue :N" below refers to line N of the draft
issue text this implementation was built from; the published issue incorporates these corrections.
Repo: `~/work/gh-aw`, branch `genai-semconv-reference`, based on upstream `68df0093b`. The issue cites `d8d9d75`.
Nothing was pushed to `github/gh-aw`, and no upstream PR, issue or comment was created.

## Commits

| SHA | Subject |
|---|---|
| cf988250f | spec(otel): align GenAI contract with semantic-conventions-genai |
| 58f96e85c | feat(otel): register GenAI and CI/CD semantic-convention attribute names |
| 5a547ec48 | feat(otel): emit GenAI semantic-convention attributes, metrics and opt-in |
| c13b94493 | test(otel): cover GenAI semantic-convention spans, metrics and opt-in |
| 99443e49e | test(otel): check GenAI output against the reference SDK and semantic-conventions-genai |
| a946ddfec | docs(otel): document GenAI semantic-convention names, metrics, opt-in and conformance |

## Where the issue text was wrong, stale, ambiguous or needed a decision

### Line numbers and base

1. **Stale line numbers.** The issue cites `d8d9d75`; the work is based on `68df0093b`.
   - Every cited file except the `Makefile` is byte-identical.
   - In the `Makefile`, `validate-otel-contract` is at :1198-1204 and `check-otel-attributes` at :1206-1208, about 8 lines later than the issue says.
   - `.github/aw/otel.md`: the Step 10 line refs (:102, :112, :115, :121, :125) were correct. Three more places were also stale:
     - :15 also said gh-aw "does not emit metrics". I rewrote it to point to spec §11.5. The acceptance criterion "no longer says that metrics are not emitted" fails if :15 is left alone.
     - "200 names" appears twice. It needed changing to 214 because the generated exports went from 201 to 215 keys.
     - The `error.type` discrepancy bullet still said `error.type` was not emitted. I rewrote it.

### Step 1 (spec)

2. **Table of contents (issue :220).** Step 1 says to "add it to the table of contents". The spec's TOC lists only top-level sections, so I did not add a TOC entry for §6.7.
3. **D11 paragraph.** Decision D11 (issue :204) needs spec text, but Step 1g has none. I added a D11 paragraph to the spec.

### Step 2 (`attributes.tsp`)

4. **Ordering (issue :413).** Step 2 says to keep alphabetical order, but `attributes.tsp` is not alphabetical today. I inserted the new names next to their related entries.

### Steps 3–4 (runtime)

5. **`gen_ai.token.modality` redaction (D6).** The key contains "token", so the sensitive-attribute redaction (`SENSITIVE_ATTR_KEY_RE`) in `send_otlp_span.cjs` would redact its value. I added a safelist, `SAFE_TOKEN_MODALITY_VALUES`, which lets the enum values (`text`, `image`, `audio`, `video`, `unknown`) pass for that key only (`send_otlp_span.cjs:1115`, `:1153`). The issue does not mention this.
6. **Attribute order.** Inserting `gen_ai.provider.name` changes attribute order on the setup and agent spans. Order is not semantic, but tests that check positions would notice.

### Step 6 (resource attributes and `schemaUrl`)

7. **Not a parameter (issue :573-575).** Step 6.1 says "add a `workflowName = ""` parameter". `buildGitHubActionsResourceAttributes` takes one options object, so `workflowName` is a property of that object. The callers are:
   - `otlp.cjs`;
   - `check_admission.cjs:260`;
   - `send_otlp_span.cjs`.
8. **`schemaUrl` on every span batch.** With the opt-in, the scope `schemaUrl` is set on every span payload `buildOTLPPayload` builds, including tool and safe-output spans, not only agent-job spans. That is a consequence of putting it in `buildOTLPPayload`, as issue :558 says.

### Step 8 (unit tests)

9. **Existing tests were modified, against the "no regression" acceptance criterion (issue :896-898).** That criterion says all existing tests pass without modification except the ordered metric-name list. That did not hold:
   - **`send_otlp_span.test.cjs`, exact-set assertions.** Three `expected:` objects in the usage-attribute table, and `expect(attrs).toHaveLength(5)`, assert the exact set of `gen_ai.usage.*` keys. Adding `gen_ai.usage.cache_write.input_tokens` (a required addition) breaks them, so they gained the new key.
   - **`otlp_metrics.test.cjs`, metric indexes.** Four assertions index the ordered metric list by position. The 5 new metrics come after `gh_aw.tokens.cache_write`, so the indexes moved by 5: `result[12]`, `[13]`, `[14]` and `[18]` became `[17]`, `[18]`, `[19]` and `[23]`. The values checked are unchanged.
   - **`parse_token_usage.test.cjs`.** One assertion line was added; nothing was removed.

   No assertion was loosened.
10. **No inventory (issue :752).** "Add the Step 2 names to whatever inventory the contract test checks": `otel_contract.test.cjs` has no inventory list. Instead, I extended the existing customer-contract test:
    - added `OTEL_SEMCONV_STABILITY_OPT_IN` to its env list;
    - asserted the new span attributes (`gen_ai.provider.name`, `gen_ai.agent.name`) and resource attributes (`cicd.*`, `vcs.*`, `deployment.environment.name`), alongside the old ones;
    - asserted that there is no scope `schemaUrl` without the opt-in.

    `make validate-otel-contract` passes.
11. **TypeScript annotations.** `npm run typecheck` needed JSDoc type annotations on the new code paths. The issue does not mention this.
12. **Test pollution.** The unit tests are not hermetic against a pre-populated `/tmp/gh-aw`:
    - after a conformance run, `/tmp/gh-aw/aw_info.json` exists;
    - tests that mock `fs.readFileSync` to throw ENOENT then see `existsSync` return true;
    - the result is 164 failures in `send_otlp_span.test.cjs`. The log is `after-otel-unit-polluted-tmp.log`, and `validate-otel-contract-polluted-tmp.log` shows the same effect.

    With `/tmp/gh-aw` removed, all tests pass. This is pre-existing behaviour, but the new `make validate-otel-conformance` target makes it easy to hit locally. CI is not affected, because the conformance runs in its own job. Suggestion: have the target, or `agent-run.cjs`, remove its fixtures at exit.

### Step 9a (wire round-trip)

13. **Numeric `kind`.** The reference SDK's protobuf decode returns `kind` as a number (1 = INTERNAL), not the enum name. The test asserts numbers. The test passes: 10/10 against 9/9 at baseline.

### Step 9b (`agent-run.cjs` and `conformance.yaml`)

14. **`GH_AW_OTLP_ENDPOINTS` (issue :773).** The issue says to leave `GH_AW_OTLP_ENDPOINTS` unset so the runner's `OTEL_EXPORTER_OTLP_ENDPOINT` applies. That is wrong: gh-aw exports only to the endpoints in `GH_AW_OTLP_ENDPOINTS`, and nothing is sent when it is unset. `agent-run.cjs` therefore sets `GH_AW_OTLP_ENDPOINTS=[{"url": OTEL_EXPORTER_OTLP_ENDPOINT}]`. `OTEL_EXPORTER_OTLP_PROTOCOL` from the runner still applies.
15. **Metrics need `GH_AW_OTEL_METRICS`.** `agent-run.cjs` must also set `GH_AW_OTEL_METRICS=true`; without it no metrics are exported and the metric expectations cannot be met.
16. **Stale state.** `agent-run.cjs` must delete stale `/tmp/gh-aw` state before each scenario. Without that, export-error files left by earlier runs or unit tests add `gh-aw.otlp.export_errors` / `gh-aw.otlp.export_error_details` attributes and the `gh-aw.otlp.export.failures` metric, which breaks the exact `metrics:` list. The files are:
    - `otel.jsonl`, `otel-metrics.jsonl`
    - `otlp-export-errors.count`, `otlp-export-errors.jsonl`
    - `otlp-metric-failures-reported.txt`
    - `github_rate_limits.jsonl`, `failure_categories.json`
    - `agent-stdio.log`, `agent_execution_exit_code.txt`, `agent_cli_start_ms.txt`
17. **The issue's example yaml is incomplete (issue :776-795).**
    - Once any `spans` entry has `count`, the runner fails every span that no entry selects ("undeclared"). The setup and conclusion spans therefore also need entries. I matched them by `kind`:
      - `*_latest`: `INTERNAL` with count 3;
      - compat: `CLIENT` with count 1, plus `INTERNAL` with count 2.
    - `metrics:` and `events:` are exact lists, so every emitted metric is listed, including `gh_aw.*`.
18. **Findings in `agent_success_compat` differ from the issue (issue :800-802).**

    | Finding | Issue | Reality |
    |---|---|---|
    | `genai_span_name_format` | expected | Occurs. Context `{expected_form: "chat gpt-5", keyed_attr: gen_ai.request.model, operation: chat}`; on the agent span and the conclusion span (both carry `gen_ai.operation.name=chat`). |
    | `deprecated` | expected (G6) | **Does not occur.** Weaver at e6658f1 has no definition for `gen_ai.system`, `gen_ai.workflow.name` and the other removed names, so they are reported as `missing_attribute`, not `deprecated`. `gen_ai.client.token.usage` is reported as `missing_metric`. |
    | `span_status_ok_set_by_instrumentation` | expected | Occurs. Context `{status_code: ok}`; on all 3 spans. |
    | `instrumentation_scope_validation` | expected (G10) | **Wrong id.** The real id is `instrumentation_scope_schema_url_missing`, context `{actual: null, expected: {present: true}}`. |
    | `genai_expected_attribute_missing` | not listed | **Occurs**, with 8 contexts: `gen_ai.response.id`, `gen_ai.response.model` and `server.address` on the agent and conclusion spans, plus `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens` on the conclusion span. I declared it under G2 (the `chat` claim). |

    Because `deprecated` never occurs, the `deprecated` arm of 9c (issue :805, :921) can never trigger. `check-report.mjs` still checks for it.
19. **`missing_attribute` also covers non-GenAI standard names.** `cicd.*`, `vcs.*`, `service.version` and `deployment.environment.name` are standard OTel names, but they are not in the `semantic-conventions-genai` registry. So they show up as `missing_attribute` in every scenario. The blanket `missing_attribute` reason was widened to say so. `check-report.mjs` still guards only `gen_ai.*`.
20. **`gen_ai.client.token.usage` is not in the genai registry at e6658f1.** It appears as `missing_metric` in compat, and the blanket `missing_metric` declaration absorbs it. The issue's G6 reason has nowhere specific to go.
21. **Instrumentation scope.** The runner checks scope `schema_url`; I used `instrumentation_scope: {name, schema_url}` in the expectations.
22. **CI job.** The `otel-conformance` job reuses the repo's existing `setup-python` pin (`6d4fd22b...`, v7.1.0) and Python 3.12. The Weaver v0.28.0 tarball needs `--strip-components=1`.

### Step 9c (`check-report.mjs`)

23. **Field names.** The issue does not specify the report structure; the actual Weaver field names are listed below.
24. **Where the name is.** For `missing_attribute`, the attribute name is in `context.attribute_key`. `signal_name` holds the attribute name only for `missing_metric`; for other findings it is the span or metric name. A first version that read `signal_name` for every finding produced false positives on `gen_ai.*` metrics.

### Step 9d (smoke workflow)

25. **Path (issue :825).** The smoke workflow's agent reads `/tmp/gh-aw/agent/otel.jsonl` (the copy inside the agent's sandbox), not `/tmp/gh-aw/otel.jsonl`.
26. **Timing.** The agent span is written by the conclusion step after the agent exits. So the in-run Step 1 cannot see `gen_ai.agent.name`; only the setup span, with `gen_ai.provider.name`, exists then. I implemented:
    - a `jq` report of `gen_ai.provider.name` and `gen_ai.agent.name` for current-run spans;
    - a pass rule that at least one current-run span has a non-null `gen_ai.provider.name`.

    The agent-name check needs a post-agent step or a later workflow. `gh aw compile smoke-otel-backends` succeeded; only lock hashes changed.

### Step 10 (docs)

27. **Where the opt-in note goes.** Step 10 asks for the inclusive-input note and the D14 caveat in `open-telemetry.mdx`. I put the note in a `:::note` and added a not-stable `:::caution`.
28. **D14 wording.** "Every `gh_aw.*` metric is unchanged" is not quite true. Under the opt-in, `gh_aw.tokens.*` drop the `gen_ai.token.type` attribute, as D14 and Step 8 otlp_metrics item 6 say. The docs and changeset say "still emitted" and name that exception. The acceptance criterion at issue :909 ("every `gh-aw.*` attribute and `gh_aw.*` metric is unchanged (D14)") needs the same caveat.

### Step 11 (validate)

29. **Not run as written.**
    - `make agent-finish` was not run: it is the full repository build, lint and test.
    - `make fmt-cjs` was not run: it rewrites files. Formatting was checked instead with `npm run lint:cjs` and `prettier --check` on the `.mjs` files.
    - Run instead (all rc=0): `make lint-cjs` parts, `go build ./...`, `go vet ./pkg/workflow/`, and `go test ./pkg/workflow/ -run 'Otel|OTel|OTLP|Attribute'`.
30. **Prettier coverage.** `npm run lint:cjs` covers only `**/*.cjs`, `*.ts` and `*.json`, not `.mjs`. The new and changed `.mjs` files were checked with `prettier --check` directly.
31. **Full JS suite timed out.** `npx vitest run --no-file-parallelism` was stopped at the 900 s limit; the log is `full-vitest-timeout.log`. I ran the impacted subset instead (below).

## Conformance results (actual)

These come from `conformance/conformance-*.log` and `conformance/weaver-reports/*.json`, with `otel-conformance` against semantic-conventions-conformance `a4321907`, registry `semantic-conventions-genai@e6658f14[model]`, and Weaver 0.28.0. All 3 scenarios pass (rc=0). `check-report.mjs` passes.

Negative checks:
- Setting `error.type: wrong_value` makes the run fail (rc=1); see `conformance-negative-check.log`.
- `check-report.mjs` fails with 13 findings on a compat report renamed `*_latest`, and fails on an empty directory; see `check-report.log`.

### `agent_success_latest` and `agent_failure_latest`

Spans:
- `gh-aw.agent.setup`: internal, status unset.
- `invoke_agent CI`: internal, sibling of the conclusion span (parent = setup). Status unset on success, ERROR "agent failure" on failure. Has `error.type=agent_failed` on failure.
- `gh-aw.agent.conclusion`: internal.

The scope `schema_url` is `https://opentelemetry.io/schemas/1.45.0`.

Violations, all declared at the top level:
- `missing_attribute`, with keys:
  - `cicd.pipeline.name`, `cicd.pipeline.run.id`, `cicd.pipeline.run.url.full`, `cicd.pipeline.task.name`, `cicd.pipeline.task.run.result`;
  - `deployment.environment.name`, `service.version`;
  - `vcs.provider.name`, `vcs.ref.head.name`, `vcs.ref.head.revision`, `vcs.repository.url.full`;
  - `gh-aw.*` and `github.*`.

  No `gen_ai.*` keys.
- `missing_metric`: `gh_aw.job.duration`, `gh_aw.run.duration` and `gh_aw.tokens.*`. The failure scenario adds `gh_aw.job.errors` and `gh_aw.run.errors`. No `gen_ai.*` metrics.

Non-violation advice: `not_stable` (improvement), `undefined_enum_variant`, `recommended_attribute_not_present` and `conditionally_required_attribute_not_present`.

### `agent_success_compat`

The findings are in the table in item 18, plus:
- `missing_attribute`: the latest-scenario keys plus `gen_ai.system`, `gen_ai.token.type`, `gen_ai.usage.cache_creation.input_tokens`, `gen_ai.usage.total_tokens`, `gen_ai.workflow.name` and `deployment.environment`.
- `missing_metric`: the latest-scenario metrics plus `gen_ai.client.token.usage`.

Spans: `gh-aw.agent.setup` internal OK, `gh-aw.agent.agent` client OK, `gh-aw.agent.conclusion` internal OK.

## Weaver live-check report JSON, actual field names (Weaver 0.28.0)

- **Top level:** `{ "samples": [...], "statistics": {...} }`. `statistics` includes `advice_level_counts` and `advice_message_counts`, among others.
- **Each sample** has exactly one of `resource`, `instrumentation_scope`, `span` or `metric`:
  - `span`: `name`, `kind` (lowercase, for example `internal`), `status: {code, message}`, and `attributes[]: {name, type, value, live_check_result}`.
  - `metric`: `name` and `data_points[].attributes[]`, with the same attribute shape.
  - `instrumentation_scope`: `name`, `version`, `schema_url`.
- **Findings** are in `live_check_result.all_advice[]`: `{id, level, message, signal_type, signal_name, context, type: "PolicyFinding"}`, where `level` is `violation`, `improvement` or `information`.
  - `missing_attribute`: `context.attribute_key` holds the attribute name.
  - `missing_metric`: `context` is `{}` and `signal_name` holds the metric name.
- **Runner `--data-file` JSON:** `spans`, `events`, `metrics`, `entities`, `findings`.

## D8: does frontmatter `env:` reach the conclusion step?

**Yes.** I compiled `d8/d8-optin.md` (frontmatter `env: OTEL_SEMCONV_STABILITY_OPT_IN: gen_ai_latest_experimental`, plus `observability.otlp`) with a locally built `gh-aw` at HEAD. Lock: `d8/d8-optin.lock.yml`; details: `d8/d8-result.txt`.

- The variable is emitted in the workflow-level `env:` block (lock :72), so every job inherits it:
  - the agent job's "Emit OTLP job conclusion before artifacts" step, `action_conclusion_otlp.cjs`, at :1221, which has no override;
  - the `./actions/setup` post-step conclusion spans of the `activation`, `agent`, `conclusion` and `safe_outputs` jobs.
- Five prompt-rendering steps set it to `""`: "Create prompt…", "Interpolate…", "Substitute placeholders", "Validate prompt placeholders" and "Print prompt". These steps blank every workflow-level env var (for example `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`), and they emit no conclusion spans.

No compiler follow-up is needed.

## Tests: before and after

| Check | Baseline 68df009 | After (HEAD a946ddfec) |
|---|---|---|
| 5-file otel vitest (`after-otel-unit.log`) | 8 files / 749 tests pass | 8 files / 773 tests pass (with `/tmp/gh-aw` clean) |
| `make check-otel-attributes` | pass | pass |
| `make validate-otel-contract` | (not run) | pass |
| Protobuf SDK test (`test_otlp_protobuf.mjs`) | 9/9 | 10/10 |
| `npm run typecheck` | (not run) | pass |
| `lint-cjs` parts (`lint:cjs`, `.mjs` prettier, `validate-cjs-syntax`, `check-node-version`, eslint-factory `lint:setup-js`) | (not run) | all rc=0 |
| `go build ./...`, `go vet ./pkg/workflow/`, `go test ./pkg/workflow/ -run 'Otel\|OTel\|OTLP\|Attribute'` | (not run) | all rc=0 |
| Impacted subset: 39 test files matching the changed modules or `otlp\|otel\|gen_ai` (41 matched by vitest) | 34 failed / 3708 passed / 1 skipped, in a git worktree | 1 failed / 3765 passed / 1 skipped |
| `make validate-otel-conformance` | n/a | pass |

The two failing files in the impacted subset:
- `runtime_import.test.cjs`, "should fuzz dedup across equivalent recursive self-import path spellings": a 10 s timeout. It fails on both sides when rerun alone, so it is environmental and unrelated.
- `handle_agent_failure.test.cjs`: fails only in the baseline git worktree, which is environment-specific, and passes at HEAD.

See `*-rerun-runtime_import-handle_agent_failure.log`.

## Sample payloads (BEFORE/AFTER)

`sample-payloads/<case>/http/*.json` holds the bodies POSTed to a local OTLP/HTTP JSON sink. `otel.jsonl` and `otel-metrics.jsonl` are the mirrors. `SUMMARY.md` is generated.

- **Cases:**
  - `before-success`, `before-failure` and `before-success-optin-ignored` (baseline 68df009 ignores the opt-in);
  - `after-success-compat`, `after-failure-compat`, `after-success-latest` and `after-failure-latest`.
- **Before → after, compat:**
  - adds `gen_ai.provider.name=github`, `gen_ai.agent.name=CI`, `gen_ai.usage.cache_write.input_tokens` and `error.type=agent_failed` on failure;
  - adds the `cicd.*`, `vcs.*`, `deployment.environment.name` and `service.version` resource attributes;
  - adds the `gen_ai.client.inference.usage.*` and `gen_ai.invoke_agent.duration` metrics;
  - span names, kinds, parents and status are unchanged.
- **Latest:**
  - the agent span is `invoke_agent CI`, INTERNAL, with parent = setup (a sibling of the conclusion span);
  - status is unset (code 0) on success;
  - `input_tokens` is 17 (10 + 5 + 2);
  - the scope `schemaUrl` is 1.45.0;
  - `gen_ai.system`, `gen_ai.workflow.name`, `cache_creation`, `total_tokens`, `deployment.environment` and the `gen_ai.client.token.usage` metric are not emitted;
  - `gh_aw.tokens.*` are still emitted, without `gen_ai.token.type`.
- **Observation, not in the issue text:** the compat conclusion span also carries `gen_ai.agent.name` and `gen_ai.provider.name`, next to `gen_ai.workflow.name` and `gen_ai.system`.

## Housekeeping

- `ci-sim/` was a local simulation of the CI install steps: a git fetch at the pinned SHA, the Weaver tarball and a YAML parse. It was removed after use. The result is recorded in `ci-sim-result.log`: conformance at `a4321907…`, `weaver 0.28.0`.
- The baseline worktree `~/work/gh-aw-baseline` and the D8 scratch repo `~/work/d8` were removed after capture. Copies are in `d8/`.

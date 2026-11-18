# GenAI semantic conventions: reference implementation evidence

> **Evidence only. Not for merge.** This branch exists so that maintainers and agents can see that the plan in the
> issue "Align gh-aw OpenTelemetry with the OpenTelemetry GenAI semantic conventions" works end to end, and what it
> produces. The implementation that lands upstream should be written fresh from the issue.

## 1. What was built, and where

| Item | Value |
|---|---|
| Base | `github/gh-aw` `main` at `68df0093b56e0e720e6df7e85deab7ff156ae4f9` |
| Implementation branch | `genai-semconv-reference`, tip `39f10359f358776d1f841523b9be6e2ea91c0355` (9 commits). §2 tests ran on `a946ddf`; `f1e9fa0` and `378a8a9` change docs only; the §4.1 backward-compatibility checks ran on `39f1035` |
| Rebased on current `main` | `genai-semconv-reference-main`, tip `4d47ca27da880f4c212ea4d9f8fa0c268146e974`: the same 9 commits on `main` at `a245939351ad690fdfb283144b1fb397eaab0871` (2026-11-18), plus a recompiled `smoke-otel-backends.lock.yml` (the only conflict). See §4.2 |
| Cache-semantics fix (§4.3) | `b304234c5bd5c718787049b7d3b9670dc9ba83af` on `genai-semconv-reference-main`; the same change is `7957e7c028f83780111bd25435f143090284402d` on `genai-semconv-reference` |
| Evidence branch | `genai-semconv-evidence` = implementation + this folder |
| Diff | 29 files, +2054 / −77 (of which the T-OT-020 golden file is about 450 lines) |
| Conventions | `open-telemetry/semantic-conventions-genai` at `e6658f1`; OTel semantic conventions v1.45.0 (`cicd.*`, `vcs.*`, schema URL) |
| Conformance runner | `open-telemetry/semantic-conventions-conformance` at `a4321907b3768c468966538a459130ac6b095bdc` |
| Weaver | v0.28.0 |
| Reference SDK (wire test) | `@opentelemetry/sdk-trace-base@2.2.0`, `@opentelemetry/otlp-transformer@0.208.0`, `@opentelemetry/resources@2.2.0`, `@opentelemetry/api@1.9.0` (same pins as `cjs.yml`) |
| Environment | Ubuntu 24.04 (WSL2), Node 24.22.3, Go 1.27.4, Python 3.12 (uv venv), jq 1.7.1. GitHub Actions were **not** run. |

Commits on `genai-semconv-reference`:

| SHA | Subject | Issue step |
|---|---|---|
| `cf988250f` | spec(otel): align GenAI contract with semantic-conventions-genai | 1 |
| `58f96e85c` | feat(otel): register GenAI and CI/CD semantic-convention attribute names | 2 |
| `5a547ec48` | feat(otel): emit GenAI semantic-convention attributes, metrics and opt-in | 3–7 |
| `c13b94493` | test(otel): cover GenAI semantic-convention spans, metrics and opt-in | 8 |
| `99443e49e` | test(otel): check GenAI output against the reference SDK and semantic-conventions-genai | 9 |
| `a946ddfec` | docs(otel): document GenAI semantic-convention names, metrics, opt-in and conformance | 10 |
| `f1e9fa00a` | docs(otel): deprecate compatibility-only GenAI names with a minimum window (spec §6.7, §19, docs, changeset; no runtime change). `make validate-otel-contract` and `make check-otel-attributes` re-run and pass | 1, 10 (D15) |
| `378a8a95a` | docs(otel): keep existing GenAI names supported; defer deprecation to a later release (supersedes the wording of `f1e9fa0`; docs only). `make validate-otel-contract` re-run and passes | 1, 10 (D15) |
| `39f10359f` | test(otel): pin the pre-alignment telemetry contract (T-OT-020): golden export from `68df009`, superset test, spec §6.7 and §17 | 1, 8 |

## 2. Results

All rows were run on the base commit and on `a946ddf`, with a clean `/tmp/gh-aw` (see "Test isolation" in §6). Logs are under
`artifacts/`.

| Check | Base `68df009` | After `a946ddf` | Log |
|---|---|---|---|
| OTel unit tests: `npx vitest run otel_contract send_otlp_span otlp_metrics otlp otlp_protobuf` | 8 files, **749** pass | 8 files, **773** pass, 0 fail | `baseline-otel-unit.log`, `after-otel-unit.log` |
| Reference-SDK wire test: `node --test scripts/test_otlp_protobuf.mjs` | 9 / 9 | **10 / 10** | `baseline-protobuf-sdk.log`, `after-protobuf-sdk.log` |
| `make check-otel-attributes` | pass | pass | `*-check-otel-attributes.log` |
| `make validate-otel-contract` | — | pass | `validate-otel-contract.log` |
| `make validate-otel-conformance` (new) | — | **3 / 3 scenarios pass**, `check-report: ok` | `make-validate-otel-conformance.log` |
| Conformance negative check (`error.type` set to a wrong value) | — | fails as expected (rc 1) | `conformance/conformance-negative-check.log` |
| `check-report.mjs` negative checks (compat report renamed `*_latest`; empty dir) | — | fail as expected (13 findings; "no reports") | `check-report.log` |
| `npm run typecheck` | — | pass | `typecheck*.log` |
| JS lint parts of `make lint-cjs` + `prettier --check` on new `.mjs` | — | pass | `lint-cjs.log` |
| `go build ./...`, `go vet ./pkg/workflow/`, `go test ./pkg/workflow/ -run 'Otel\|OTel\|OTLP\|Attribute'` | — | pass | `go-build.log` |
| `gh aw compile smoke-otel-backends` (locally built binary) | — | pass; only lock hashes and the new `jq` step change | `compile-smoke-otel-backends.log` |
| Backward compatibility, T-OT-020 (§4.1): `npx vitest run send_otlp_span_legacy_contract.test.cjs` | 5 / 5 default-mode tests pass (`-t`, opt-in test skipped) | **7 / 7** on `39f1035`; 15 OTel files **1021** pass | `compat/test-on-base.log`, `compat/otel-unit-tests.log` |
| Impacted JS subset (41 test files matching changed modules or `otlp\|otel\|gen_ai`) | 3708 pass, 34 fail¹ | 3765 pass, 1 fail² | `before-impacted-vitest.log`, `after-impacted-vitest.log` |

¹ All 34 are in `handle_agent_failure.test.cjs` and fail only in the temporary git worktree used for the base run;
they pass at the base in the main checkout. ² `runtime_import.test.cjs` fuzz test times out at 10 s on both base and
after when run alone (`*-rerun-runtime_import-handle_agent_failure.log`); unrelated to this change.

Not run: the full JS suite (`npx vitest run` stopped at the 15-minute limit, `full-vitest-timeout.log`), `make
agent-finish`, and `make fmt-cjs` (rewrites files; formatting was checked instead).

## 3. Conformance against `semantic-conventions-genai`

Command: `make validate-otel-conformance` (runs `otel-conformance` on `actions/setup/js/conformance/` with
`--registry 'https://github.com/open-telemetry/semantic-conventions-genai.git@e6658f1[model]'`, then
`check-report.mjs`). Weaver reports: `conformance/weaver-reports/*.json`; runner reduction: `conformance/data.json`.

| Scenario | Opt-in | Result | GenAI violations | Other violations (declared) |
|---|---|---|---|---|
| `agent_success_latest` | `gen_ai_latest_experimental` | ok | **none** | `missing_attribute` for `gh-aw.*`, `github.*`, `cicd.*`, `vcs.*`, `service.version`, `deployment.environment.name`³; `missing_metric` for `gh_aw.*` |
| `agent_failure_latest` | `gen_ai_latest_experimental` | ok | **none** | as above, plus `gh_aw.job.errors`, `gh_aw.run.errors` |
| `agent_success_compat` | unset (default) | ok | `genai_span_name_format`, `genai_expected_attribute_missing`, `span_status_ok_set_by_instrumentation`, `instrumentation_scope_schema_url_missing`; `missing_attribute` for the old names `gen_ai.system`, `gen_ai.workflow.name`, `gen_ai.token.type`, `gen_ai.usage.cache_creation.input_tokens`, `gen_ai.usage.total_tokens`; `missing_metric` for `gen_ai.client.token.usage` | as above |

³ These are standard OpenTelemetry names (v1.45.0) that the GenAI-only registry does not define.

What this shows:

- With the opt-in, gh-aw output has **zero GenAI convention violations**. Every `gen_ai.*` attribute and metric it
  emits is defined in the registry, the agent span is `invoke_agent {gen_ai.agent.name}` (`INTERNAL`), status is
  left unset on success, `error.type` is present exactly on failed spans, and the scope carries
  `schema_url = https://opentelemetry.io/schemas/1.45.0`.
- Without the opt-in (today's default), the same checker reports the gaps the issue lists (G2, G6, G7, G10), which is
  why the opt-in exists.
- The deprecated names are reported by Weaver as `missing_attribute`/`missing_metric`, not `deprecated`, because the
  registry at `e6658f1` no longer defines them.

## 4. Before and after payloads

`artifacts/sample-payloads/<case>/http/*.json` are the exact OTLP/HTTP JSON bodies gh-aw POSTed to a local sink
(`tools/otlp-sink.cjs`) for an agent job with tokens input 10, output 3, cache read 5, cache write 2.
`sample-payloads/SUMMARY.md` is a generated digest.

| Field | Before (`68df009`) | After, default | After, opt-in |
|---|---|---|---|
| Agent span name / kind / parent | `gh-aw.agent.agent` / `CLIENT` / conclusion | unchanged | `invoke_agent CI` / `INTERNAL` / setup (sibling of conclusion) |
| `gen_ai.operation.name` | `chat` | `chat` | `invoke_agent` |
| `gen_ai.provider.name` | — | `github` | `github` |
| `gen_ai.system` | `github_models` | `github_models` | — |
| `gen_ai.agent.name` | — | `CI` | `CI` |
| `gen_ai.workflow.name` | `CI` | `CI` | — |
| `gen_ai.usage.input_tokens` | 10 | 10 | **17** (10 + 5 + 2, inclusive of cache) |
| `gen_ai.usage.cache_write.input_tokens` | — | 2 | 2 |
| `gen_ai.usage.cache_creation.input_tokens` / `total_tokens` | 2 / 13 | 2 / 13 | — |
| `error.type` on failure | — | `agent_failed` | `agent_failed` |
| Span status on success | `OK` | `OK` | unset |
| Scope `schemaUrl` | — | — | `https://opentelemetry.io/schemas/1.45.0` |
| Resource `cicd.*`, `vcs.*`, `service.version`, `deployment.environment.name` | — | added | added |
| `deployment.environment` | present | present | — |
| `gen_ai.client.token.usage` | yes | yes | — |
| `gen_ai.client.inference.usage.*`, `gen_ai.invoke_agent.duration` | — | added | added |
| `gh_aw.tokens.*` | yes, with `gen_ai.token.type` | unchanged | yes, without `gen_ai.token.type` |
| Every other `gh-aw.*` attribute and `gh_aw.*` metric | yes | unchanged | unchanged |

`before-success-optin-ignored` confirms that the base ignores `OTEL_SEMCONV_STABILITY_OPT_IN`.

### 4.1 Backward compatibility (T-OT-020)

Requirement: without `gen_ai_latest_experimental`, every span, attribute, resource attribute, metric and data point
gh-aw emitted before the change is still emitted with the same value. Only additions are allowed.

How it is checked. `conformance/legacy-contract-facts.cjs` flattens OTLP JSON bodies into sorted facts: span name, kind,
parent span name, status, scope, each attribute and resource attribute with its value, event names, metric type, unit,
monotonicity, temporality, and each data point's attribute set with its value. Trace and span IDs and timestamps are
left out. Only clock-dependent values are marked `<volatile>` (keys still compared): `gh-aw.action_minutes` and the
sums of `*duration` histograms. Two runs of the base produce byte-identical facts with this list.

| Check | Result | Log |
|---|---|---|
| Golden capture on base `68df009` (`legacy-contract-capture.cjs`, run twice) | 202 success facts, 226 failure facts; reruns byte-identical, and identical to the committed `conformance/legacy-contract.golden.json` | `compat/capture-base-68df009.log` |
| New test on `39f1035`: default and `OTEL_SEMCONV_STABILITY_OPT_IN=http` are supersets; opt-in keeps every `gh-aw.*` and `github.*` attribute | **7 / 7 pass** | `compat/otel-unit-tests.log` |
| Same test on base `68df009` (default-mode tests) | 5 / 5 pass, so the test does not depend on the change | `compat/test-on-base.log` |
| Mutation: drop `gen_ai.system` from conclusion and agent spans | 4 default-mode tests **fail**, reporting the missing facts | `compat/mutation-drop-gen_ai.system.log` |
| Mutation: rename metric `gh_aw.tokens.input` | 4 default-mode tests **fail** | `compat/mutation-rename-gh_aw.tokens.input.log` |
| `prettier --check`; `tsc --strict --checkJs` on the new helpers | pass; 0 errors | — |

Independent check on the recorded wire payloads above (separate processes, real HTTP sink), with
`tools/compat-diff.cjs`:

| Before → after | Removed | Changed | Added | Log |
|---|---|---|---|---|
| `before-success` → `after-success-compat` | **0** | **0** | 89 | `compat/diff-before-success--after-success-compat.txt` |
| `before-failure` → `after-failure-compat` | **0** | **0** | 91 | `compat/diff-before-failure--after-failure-compat.txt` |
| `before-success` → `before-success-optin-ignored` | 0 | 0 | 0 | `compat/diff-before-success--before-success-optin-ignored.txt` |
| `before-success` → `after-success-latest` (opt-in) | 72 | 2 | 136 | `compat/diff-before-success--after-success-latest.txt` |
| `before-failure` → `after-failure-latest` (opt-in) | 73 | 1 | 138 | `compat/diff-before-failure--after-failure-latest.txt` |

The additions are `gen_ai.provider.name`, `gen_ai.agent.name`, `gen_ai.usage.cache_write.input_tokens`, `error.type`,
the `cicd.*`, `vcs.*` and `deployment.environment.name` resource attributes, and the `gen_ai.client.inference.usage.*`
and `gen_ai.invoke_agent.duration` metrics. The opt-in rows are expected to differ: the agent span is renamed
`invoke_agent CI`, compatibility-only names are dropped, `gh_aw.tokens.*` lose the `gen_ai.token.type` point attribute,
and setup and conclusion status changes from `OK` to unset. No `gh-aw.*` or `github.*` attribute is lost in either mode.

### 4.2 Still valid on current `main`

On 2026-11-18, `main` (`a245939`) was 19 commits ahead of `68df009`. None of them touch the OTel runtime
(`send_otlp_span.cjs`, `otlp_metrics.cjs`, `otlp*.cjs`), `specs/otel-observability-spec.md` or `cjs.yml`. They add six
`gh-aw.safe_output.gate.*` names to `specs/otel/attributes.tsp`, so `genAiSystem` moves from line 75 to 89.

| Check on `genai-semconv-reference-main` | Result | Log |
|---|---|---|
| Rebase onto `a245939` | Clean except the generated `smoke-otel-backends.lock.yml`, recompiled with `gh aw compile` | — |
| 15 OTel vitest files, incl. T-OT-020 | 1,022 passed, 0 failed | `artifacts/rebase-main/vitest-otel.log` |
| Wire test against the reference SDK | 10/10 | `artifacts/rebase-main/protobuf-sdk.log` |
| `make check-otel-attributes`, `make validate-otel-contract` | Pass | `artifacts/rebase-main/check-otel-attributes.log`, `validate-otel-contract.log` |
| `make validate-otel-conformance` | 3/3 scenarios ok; `check-report` ok | `artifacts/rebase-main/conformance.log` |
| T-OT-020 golden re-captured on unmodified `a245939` | Same facts as the `68df009` golden (202 success, 226 failure) | `artifacts/rebase-main/legacy-contract-captured-on-main.json` |

The issue's baseline, the golden and the plan still apply to current `main`.

### 4.3 Cache tokens counted once (input-token semantics)

**Finding.** The first implementation computed the inclusive input count as `input_tokens + cache_read_tokens +
cache_write_tokens` for every run. That is only right when the source's `input_tokens` excludes cache tokens. The
AWF api-proxy marks each usage record with `input_tokens_include_cache` (true for OpenAI-style `prompt_tokens` and
the Responses API), and gh-aw's AI-credits specification already uses that flag, then a per-provider default, to
price cache tokens. For OpenAI and Copilot records the old sum counted cache reads twice.

**Fix** (`b304234`, `fix(otel): count cache tokens once in inclusive GenAI input tokens`):

- `model_costs.cjs`: new `computeInclusiveInputTokens`, using the same rule as `computeInferenceCostUSD`:
  flag `true` → input; flag `false` → input + read + write; no flag and a provider whose input includes cache
  reads → input + write; otherwise input + read + write.
- `parse_mcp_gateway_log.cjs` sums it per record; `parse_token_usage.cjs` writes it to `agent_usage.json` as
  `input_tokens_inclusive` (additive key) when every record reported all three counts.
- `send_otlp_span.cjs` / `otlp_metrics.cjs`: the opt-in span `gen_ai.usage.input_tokens` and the
  `gen_ai.client.inference.usage.input_tokens` counter use that value. Without it, they fall back to the
  record-level flag, or to `input_tokens` when there are no cache tokens, and otherwise are omitted rather than
  guessed.
- Default (non-opt-in) output is unchanged: `gen_ai.usage.input_tokens` keeps the raw value, and T-OT-020 passes
  with the unchanged golden and an `agent_usage.json` that lacks the new key.
- Spec §6/§11.2 rows, §19 change log and the `open-telemetry.mdx` note now describe the per-record rule.

What the counter reports for one request, before and after (`artifacts/cache-semantics/inclusive-input-demo.md`):

| Record | input | cache read | cache write | Before (input + read + write) | After (AI-credits rule) | Overcount before |
|---|---|---|---|---|---|---|
| openai via AWF proxy (input_tokens_include_cache: true) | 1000 | 400 | 0 | 1400 | 1000 | 400 |
| copilot via AWF proxy (input_tokens_include_cache: true) | 1000 | 400 | 100 | 1500 | 1000 | 500 |
| anthropic via AWF proxy (input_tokens_include_cache: false) | 1000 | 400 | 100 | 1500 | 1500 | 0 |
| legacy openai record, no flag (provider default: cache reads included) | 1000 | 400 | 100 | 1500 | 1100 | 400 |
| legacy unknown provider, no flag (additive) | 1000 | 400 | 100 | 1500 | 1500 | 0 |

| Check (`genai-semconv-reference-main` @ `b304234`) | Result | Log (`artifacts/cache-semantics/`) |
|---|---|---|
| 15 OTel vitest files + `parse_mcp_gateway_log`, `parse_token_usage`, `model_costs` | 18 files, 1,323 passed, 0 failed | `vitest-otel-and-usage.log` |
| New tests | parser: 5 provider/flag cases; span: 5 resolution cases + raw value without opt-in; metric: caller value and omission; `agent_usage.json` key | in the log above |
| T-OT-020 backward compatibility | 7/7 | `legacy-contract-T-OT-020.log` |
| Wire test against the reference SDK | 10/10 | `protobuf-sdk.log` |
| `make check-otel-attributes validate-otel-contract` | Pass | `check-otel-attributes-and-contract.log` |
| `make validate-otel-conformance` | 3/3 scenarios ok; `check-report` ok | `conformance.log` |
| Same, before the conformance fixture gained `input_tokens_inclusive` | `agent_success_compat` fails: input counter not emitted (the fixture had cache tokens and no semantics, so the value is correctly omitted) | `conformance-before-fixture-update.log` |
| `npm run typecheck`, `prettier --check` on changed files | Pass | `typecheck.log`, `prettier.log` |
| Same fix on `genai-semconv-reference` @ `7957e7c` (base `68df009`) | 18 files, 1,322 passed; conformance ok | `base-68df009-vitest.log`, `base-68df009-conformance.log` |

## 5. Opt-in reaches the conclusion step (D8)

A workflow with frontmatter `env: OTEL_SEMCONV_STABILITY_OPT_IN: gen_ai_latest_experimental` and `observability.otlp`
was compiled with a gh-aw binary built from `a946ddf` (`d8/d8-optin.md` → `d8/d8-optin.lock.yml`, notes in
`d8/d8-result.txt`).

- The variable is compiled into the workflow-level `env:` block, so every job inherits it, including the agent job's
  "Emit OTLP job conclusion before artifacts" step and the `./actions/setup` post-step of each job.
- Five prompt-rendering steps set it to `""`, as they do for every workflow-level variable. None of them emits spans.

**Result:** no compiler change is needed for the opt-in.

## 6. Where the issue plan needed correcting

`DEVIATIONS.md` has the full list with step references. The ones that change the plan:

1. **Conformance harness environment (Step 9b).** gh-aw exports only to `GH_AW_OTLP_ENDPOINTS`, so `agent-run.cjs` must
   set `GH_AW_OTLP_ENDPOINTS=[{"url": $OTEL_EXPORTER_OTLP_ENDPOINT}]` and `GH_AW_OTEL_METRICS=true`, and remove stale
   `/tmp/gh-aw` state before each scenario.
2. **`conformance.yaml` must declare every span and metric (Step 9b).** The runner fails undeclared spans; setup and
   conclusion spans need entries, and `metrics:` is an exact list including `gh_aw.*`.
3. **Real finding ids (Step 9b/9c).** `instrumentation_scope_schema_url_missing` (not `instrumentation_scope_validation`);
   `genai_expected_attribute_missing` also occurs in compat; `deprecated` never occurs (see §3).
4. **Weaver report shape (Step 9c).** Findings are in `samples[].<span|metric|resource|instrumentation_scope>…
   live_check_result.all_advice[]` as `{id, level, signal_type, signal_name, context}`; the attribute name for
   `missing_attribute` is in `context.attribute_key`.
5. **Redaction (Step 4).** `gen_ai.token.modality` contains "token" and was redacted by the sensitive-key filter; a
   value safelist for that key is needed.
6. **Existing tests (acceptance).** Exact-set assertions gained `gen_ai.usage.cache_write.input_tokens`, and metric
   index assertions moved by 5. No assertion was loosened.
7. **D14 wording.** Under the opt-in, `gh_aw.tokens.*` drop `gen_ai.token.type`; every other `gh-aw.*`/`gh_aw.*` is
   unchanged.
8. **Smoke check (Step 9d).** The in-run agent reads `/tmp/gh-aw/agent/otel.jsonl`, and the agent span is written
   after the agent exits, so the in-run check can only assert `gen_ai.provider.name`.

### Test isolation

A conformance run leaves `/tmp/gh-aw/aw_info.json`; with it present, 164 unit tests in `send_otlp_span.test.cjs` fail
because they mock `readFileSync` but not `existsSync` (`after-otel-unit-polluted-tmp.log`). This is pre-existing
test behaviour, not caused by this change. `agent-run.cjs` removes stale export state before each scenario but leaves
fixtures behind, so run `rm -rf /tmp/gh-aw` before unit tests after a local conformance run. CI is unaffected because
conformance runs in its own job. An upstream implementation could remove the fixtures at exit.

## 7. Reproduce

```bash
git fetch https://github.com/sudivate/gh-aw genai-semconv-reference && git checkout FETCH_HEAD
cd actions/setup/js && npm ci && cd -
rm -rf /tmp/gh-aw
(cd actions/setup/js && npx vitest run otel_contract.test.cjs send_otlp_span.test.cjs otlp_metrics.test.cjs \
  otlp.test.cjs otlp_protobuf.test.cjs --no-file-parallelism)
npm install --prefix /tmp/otel-protobuf-sdk --ignore-scripts --package-lock=false \
  @opentelemetry/sdk-trace-base@2.2.0 @opentelemetry/otlp-transformer@0.208.0 \
  @opentelemetry/resources@2.2.0 @opentelemetry/api@1.9.0
GH_AW_OTEL_SDK_DIR=/tmp/otel-protobuf-sdk node --test actions/setup/js/scripts/test_otlp_protobuf.mjs
make check-otel-attributes validate-otel-contract
# backward compatibility (T-OT-020); regenerate the golden on 68df009 with conformance/legacy-contract-capture.cjs
(cd actions/setup/js && npx vitest run send_otlp_span_legacy_contract.test.cjs)
node genai-semconv-evidence/artifacts/tools/compat-diff.cjs genai-semconv-evidence/artifacts/sample-payloads/before-success \
  genai-semconv-evidence/artifacts/sample-payloads/after-success-compat
# needs Python 3.12 with semantic-conventions-conformance (a4321907) tools/runner and tools/gen-ai/runner, and weaver 0.28.0 on PATH
make validate-otel-conformance
```

## 8. Layout

```
genai-semconv-evidence/
  EVIDENCE.md        this file
  DEVIATIONS.md      every plan-vs-reality difference, conformance details, Weaver field names
  artifacts/         raw logs, Weaver reports, data.json, sample payloads, D8 lock file, helper scripts (tools/), backward-compatibility logs and diffs (compat/)
```

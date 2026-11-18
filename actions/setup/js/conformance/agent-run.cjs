// @ts-check
"use strict";

// Conformance scenario program (spec T-OT-018): emit one built-in agent job's
// setup and conclusion telemetry to the OTLP endpoint the conformance runner
// provides. Usage: node agent-run.cjs <success|failure> [--latest]

const fs = require("fs");
const path = require("path");

const conclusion = process.argv[2] === "failure" ? "failure" : "success";
const latest = process.argv.includes("--latest");

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (!endpoint) {
  console.error("OTEL_EXPORTER_OTLP_ENDPOINT is not set; run this through otel-conformance");
  process.exit(2);
}

// gh-aw exports only to GH_AW_OTLP_ENDPOINTS; OTEL_EXPORTER_OTLP_PROTOCOL selects the encoding.
process.env.GH_AW_OTLP_ENDPOINTS = JSON.stringify([{ url: endpoint }]);
process.env.GH_AW_OTEL_METRICS = "true";
process.env.INPUT_JOB_NAME = "agent";
process.env.GH_AW_AGENT_CONCLUSION = conclusion;
process.env.GH_AW_INFO_WORKFLOW_NAME = "CI";
process.env.GH_AW_INFO_ENGINE_ID = "copilot";
process.env.GITHUB_WORKFLOW = "CI";
process.env.GITHUB_JOB = "agent";
process.env.GITHUB_RUN_ID = "1";
process.env.GITHUB_RUN_ATTEMPT = "1";
process.env.GITHUB_REPOSITORY = "github/gh-aw";
process.env.GITHUB_SERVER_URL = "https://github.com";
process.env.GITHUB_REF_NAME = "main";
process.env.GITHUB_SHA = "0123456789abcdef0123456789abcdef01234567";
if (latest) {
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN = "gen_ai_latest_experimental";
} else {
  delete process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
}

// The runtime reads its inputs and keeps export state at fixed paths under /tmp/gh-aw.
// Clear state left by earlier runs or unit tests so each scenario starts clean.
const dir = "/tmp/gh-aw";
fs.mkdirSync(dir, { recursive: true });
for (const stale of [
  "otel.jsonl",
  "otel-metrics.jsonl",
  "otlp-export-errors.count",
  "otlp-export-errors.jsonl",
  "otlp-metric-failures-reported.txt",
  "github_rate_limits.jsonl",
  "failure_categories.json",
  "agent-stdio.log",
  "agent_execution_exit_code.txt",
  "agent_cli_start_ms.txt",
]) {
  fs.rmSync(path.join(dir, stale), { force: true });
}
fs.writeFileSync(path.join(dir, "aw_info.json"), JSON.stringify({ engine_id: "copilot", workflow_name: "CI", model: "gpt-5", staged: false }));
fs.writeFileSync(path.join(dir, "agent_usage.json"), JSON.stringify({ input_tokens: 10, output_tokens: 3, cache_read_tokens: 5, cache_write_tokens: 2 }));

const { sendJobSetupSpan, sendJobConclusionSpan } = require("../send_otlp_span.cjs");

(async () => {
  const startMs = Date.now() - 2000;
  const setup = await sendJobSetupSpan({ startMs: startMs - 1000 });
  process.env.GITHUB_AW_OTEL_TRACE_ID = setup.traceId;
  process.env.GITHUB_AW_OTEL_PARENT_SPAN_ID = setup.spanId;
  // The agent span ends at agent_output.json's mtime.
  fs.writeFileSync(path.join(dir, "agent_output.json"), JSON.stringify({ items: [], errors: [] }));
  await sendJobConclusionSpan("gh-aw.agent.conclusion", { startMs });
})().catch(error => {
  console.error(error);
  process.exit(1);
});

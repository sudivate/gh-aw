#!/usr/bin/env node
// Guards the gen_ai.* names that conformance.yaml's blanket missing_attribute and
// missing_metric declarations would otherwise hide (spec §6.7, T-OT-018).
//
// Usage: node check-report.mjs <weaver-report-dir>
//
// Each Weaver live-check report is a JSON object with `samples` and `statistics`.
// Every sample holds one of `resource`, `instrumentation_scope`, `span` or `metric`;
// findings sit in `live_check_result.all_advice[]` entries (`id`, `level`, `message`,
// `signal_type`, `signal_name`, `context`) on the signal and on each attribute.

import fs from "node:fs";
import path from "node:path";

const GUARDED_FINDINGS = new Set(["missing_attribute", "missing_metric", "deprecated"]);
const REQUIRED_METRICS = ["gen_ai.client.inference.usage.input_tokens", "gen_ai.invoke_agent.duration"];

/**
 * @param {unknown} node
 * @param {Array<Record<string, any>>} out
 * @returns {Array<Record<string, any>>}
 */
function collectAdvice(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectAdvice(item, out);
  } else if (node && typeof node === "object") {
    const record = /** @type {Record<string, any>} */ node;
    const advice = record.live_check_result?.all_advice;
    if (Array.isArray(advice)) out.push(...advice);
    for (const value of Object.values(record)) collectAdvice(value, out);
  }
  return out;
}

/**
 * Returns the gen_ai.* key a finding names, or "" when it names none.
 * @param {Record<string, any>} finding
 * @returns {string}
 */
function genAiKey(finding) {
  // missing_metric findings carry an empty context and name the metric in signal_name;
  // attribute findings name the attribute in context.attribute_key.
  const key = finding.id === "missing_metric" ? finding.signal_name : finding.context?.attribute_key;
  return typeof key === "string" && key.startsWith("gen_ai.") ? key : "";
}

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node check-report.mjs <weaver-report-dir>");
  process.exit(2);
}

const failures = [];
const seenMetrics = new Set();
let reports = 0;

for (const file of fs
  .readdirSync(dir)
  .filter(name => name.endsWith(".json"))
  .sort()) {
  const report = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!report || !Array.isArray(report.samples)) continue;
  reports++;
  const scenario = path.basename(file, ".json");

  for (const sample of report.samples) {
    if (sample.metric?.name) seenMetrics.add(sample.metric.name);
  }

  if (!scenario.endsWith("_latest")) continue;
  for (const finding of collectAdvice(report.samples)) {
    if (!GUARDED_FINDINGS.has(finding.id)) continue;
    const key = genAiKey(finding);
    if (key) failures.push(`${scenario}: ${finding.id} names ${key} (${finding.signal_type} ${finding.signal_name})`);
  }
}

if (reports === 0) failures.push(`no Weaver reports found in ${dir}`);
for (const metric of REQUIRED_METRICS) {
  if (!seenMetrics.has(metric)) failures.push(`metric ${metric} was not seen in any scenario`);
}

const unique = [...new Set(failures)];
if (unique.length > 0) {
  console.error(`check-report: ${unique.length} failure(s)`);
  for (const failure of unique) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-report: ok (${reports} report(s); metrics seen: ${[...seenMetrics].sort().join(", ")})`);

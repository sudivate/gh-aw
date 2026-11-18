// Mechanical backward-compatibility diff of recorded OTLP/HTTP JSON payloads
// (spec T-OT-020). Usage: node compat-diff.cjs <before-dir> <after-dir>
// Prints facts removed, changed (same key, new value) and added. Exit 1 if any
// before fact is missing from after.
"use strict";
const fs = require("fs");
const path = require("path");
const { otlpFacts } = require("../../../actions/setup/js/conformance/legacy-contract-facts.cjs");
const { FACT_OPTIONS } = require("../../../actions/setup/js/conformance/legacy-contract-scenario.cjs");

function load(dir) {
  const http = path.join(dir, "http");
  const files = fs.readdirSync(http).filter(f => f.endsWith(".json")).sort();
  return otlpFacts(files.map(f => ({ body: fs.readFileSync(path.join(http, f), "utf8") })), FACT_OPTIONS);
}
const keyOf = fact => fact.replace(/=[^=]*$/, "");

const [beforeDir, afterDir] = process.argv.slice(2);
const before = load(beforeDir);
const after = load(afterDir);
const afterSet = new Set(after);
const beforeSet = new Set(before);
const afterKeys = new Map(after.map(f => [keyOf(f), f]));
const missing = before.filter(f => !afterSet.has(f));
const changed = missing.filter(f => afterKeys.has(keyOf(f)));
const removed = missing.filter(f => !afterKeys.has(keyOf(f)));
const added = after.filter(f => !beforeSet.has(f));
console.log(`before: ${path.basename(beforeDir)} (${before.length} facts)`);
console.log(`after:  ${path.basename(afterDir)} (${after.length} facts)`);
console.log(`removed: ${removed.length}  changed: ${changed.length}  added: ${added.length}`);
for (const f of removed) console.log(`- ${f}`);
for (const f of changed) console.log(`~ ${f}  ->  ${afterKeys.get(keyOf(f))}`);
for (const f of added) console.log(`+ ${f}`);
process.exitCode = missing.length ? 1 : 0;

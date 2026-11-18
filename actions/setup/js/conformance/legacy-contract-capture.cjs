// @ts-check
"use strict";

// Captures the legacy telemetry contract (spec T-OT-020) of the checked-out
// runtime. Run it on the commit before GenAI alignment to (re)create the golden
// file: node conformance/legacy-contract-capture.cjs <out.json> <base-commit>

const fs = require("fs");
const { runLegacyContractScenario, FACT_OPTIONS } = require("./legacy-contract-scenario.cjs");
const { otlpFacts } = require("./legacy-contract-facts.cjs");

(async () => {
  const [out, baseCommit] = process.argv.slice(2);
  if (!out || !baseCommit) throw new Error("usage: legacy-contract-capture.cjs <out.json> <base-commit>");
  /** @type {Record<string, string[]>} */
  const scenarios = {};
  /** @type {Array<"success" | "failure">} */
  const conclusions = ["success", "failure"];
  for (const conclusion of conclusions) {
    const first = otlpFacts(await runLegacyContractScenario({ conclusion }), FACT_OPTIONS);
    const second = otlpFacts(await runLegacyContractScenario({ conclusion }), FACT_OPTIONS);
    if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error(`${conclusion} facts differ between runs; mark the varying values volatile`);
    scenarios[conclusion] = first;
  }
  const golden = {
    description: "Default telemetry of one built-in agent job before GenAI semantic-convention alignment. Every fact must still be emitted (spec T-OT-020).",
    base_commit: baseCommit,
    generator: "actions/setup/js/conformance/legacy-contract-capture.cjs",
    scenarios,
  };
  fs.writeFileSync(out, JSON.stringify(golden, null, 2) + "\n");
  console.log(
    `wrote ${out}: ${Object.entries(scenarios)
      .map(([k, v]) => `${k}=${v.length}`)
      .join(" ")}`
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});

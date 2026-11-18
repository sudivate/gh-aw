import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

// Spec T-OT-020: GenAI semantic-convention alignment is additive. Unless
// OTEL_SEMCONV_STABILITY_OPT_IN contains gen_ai_latest_experimental, every span,
// attribute, resource attribute, metric and data point that the runtime emitted
// before alignment is still emitted with the same value. The golden file was
// captured from the pre-alignment commit with conformance/legacy-contract-capture.cjs.

const require = createRequire(import.meta.url);
const { runLegacyContractScenario, FACT_OPTIONS } = require("./conformance/legacy-contract-scenario.cjs");
const { otlpFacts, missingFacts } = require("./conformance/legacy-contract-facts.cjs");
const golden = require("./conformance/legacy-contract.golden.json");

const CONCLUSIONS = ["success", "failure"];

async function facts(conclusion, env) {
  return otlpFacts(await runLegacyContractScenario({ conclusion, env }), FACT_OPTIONS);
}

describe("legacy telemetry contract (T-OT-020)", () => {
  it("has a golden file for every scenario", () => {
    expect(Object.keys(golden.scenarios).sort()).toEqual([...CONCLUSIONS].sort());
    for (const conclusion of CONCLUSIONS) expect(golden.scenarios[conclusion].length).toBeGreaterThan(100);
  });

  for (const conclusion of CONCLUSIONS) {
    it(`default output is a superset of the pre-alignment output (${conclusion})`, async () => {
      expect(missingFacts(golden.scenarios[conclusion], await facts(conclusion, {}))).toEqual([]);
    });

    it(`an opt-in without gen_ai_latest_experimental keeps the pre-alignment output (${conclusion})`, async () => {
      expect(missingFacts(golden.scenarios[conclusion], await facts(conclusion, { OTEL_SEMCONV_STABILITY_OPT_IN: "http" }))).toEqual([]);
    });

    it(`gen_ai_latest_experimental keeps every gh-aw and github attribute (${conclusion})`, async () => {
      const actual = await facts(conclusion, { OTEL_SEMCONV_STABILITY_OPT_IN: "gen_ai_latest_experimental" });
      const expected = golden.scenarios[conclusion].filter(fact => /^span "[^"]+" (attr|resource) (gh-aw|github)\./.test(fact)).map(fact => fact.replace('span "gh-aw.agent.agent"', 'span "invoke_agent CI"'));
      expect(expected.length).toBeGreaterThan(50);
      expect(missingFacts(expected, actual)).toEqual([]);
    });
  }
});

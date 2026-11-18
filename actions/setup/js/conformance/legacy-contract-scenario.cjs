// @ts-check
"use strict";

// In-process version of agent-run.cjs for the legacy telemetry contract (spec
// T-OT-020). Files under /tmp/gh-aw are virtual and fetch is captured, so the
// scenario can run inside unit tests without touching shared state.

const fs = require("fs");

/** @type {Record<string, any>} */
const mutableFs = /** @type {any} */ fs;
const path = require("path");

const STATE_DIR = "/tmp/gh-aw";
const ENV_PREFIXES = ["GH_AW_", "GITHUB_", "OTEL_", "INPUT_"];

/**
 * Attributes and metrics whose values depend on the wall clock or random IDs.
 * Their keys are still part of the contract; only their values are not.
 */
const FACT_OPTIONS = { volatileAttributes: ["gh-aw.action_minutes"], volatileMetricPattern: /duration$/ };

/** @param {string} conclusion */
function scenarioEnv(conclusion) {
  return {
    GH_AW_OTLP_ENDPOINTS: JSON.stringify([{ url: "http://collector.invalid:4318" }]),
    GH_AW_OTEL_METRICS: "true",
    INPUT_JOB_NAME: "agent",
    GH_AW_AGENT_CONCLUSION: conclusion,
    GH_AW_INFO_WORKFLOW_NAME: "CI",
    GH_AW_INFO_ENGINE_ID: "copilot",
    GITHUB_WORKFLOW: "CI",
    GITHUB_JOB: "agent",
    GITHUB_RUN_ID: "1",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_REPOSITORY: "github/gh-aw",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
  };
}

/** @param {unknown} file */
function inStateDir(file) {
  return typeof file === "string" && (file === STATE_DIR || file.startsWith(STATE_DIR + path.sep) || file.startsWith(STATE_DIR + "/"));
}

/** @param {string} file */
function enoent(file) {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${file}'`), { code: "ENOENT" });
}

/**
 * Runs the setup and conclusion telemetry of one built-in agent job.
 * @param {{ conclusion?: "success" | "failure", env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<Array<{ url: string, body: string }>>} captured OTLP/HTTP requests
 */
async function runLegacyContractScenario(options = {}) {
  const conclusion = options.conclusion || "success";
  /** @type {Map<string, string>} */
  const files = new Map([
    [`${STATE_DIR}/aw_info.json`, JSON.stringify({ engine_id: "copilot", workflow_name: "CI", model: "gpt-5", staged: false })],
    [`${STATE_DIR}/agent_usage.json`, JSON.stringify({ input_tokens: 10, output_tokens: 3, cache_read_tokens: 5, cache_write_tokens: 2 })],
  ]);
  let agentOutputMtimeMs = 0;

  const savedEnv = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (ENV_PREFIXES.some(prefix => key.startsWith(prefix))) delete process.env[key];
  }
  Object.assign(process.env, scenarioEnv(conclusion));
  for (const [key, value] of Object.entries(options.env || {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  /** @type {Record<string, any>} */
  const saved = {};
  /** @type {Record<string, Function>} */
  const overrides = {
    readFileSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => {
      if (!inStateDir(file)) return saved.readFileSync.call(fs, file, ...rest);
      if (!files.has(file)) throw enoent(file);
      return files.get(file);
    },
    existsSync: (/** @type {any} */ file) => (inStateDir(file) ? files.has(file) : saved.existsSync.call(fs, file)),
    statSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => {
      if (!inStateDir(file)) return saved.statSync.call(fs, file, ...rest);
      if (!files.has(file)) throw enoent(file);
      return { mtimeMs: file.endsWith("agent_output.json") ? agentOutputMtimeMs : Date.now(), size: files.get(file)?.length || 0, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
    },
    lstatSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => {
      if (!inStateDir(file)) return saved.lstatSync.call(fs, file, ...rest);
      return overrides.statSync(file);
    },
    openSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => {
      if (inStateDir(file)) throw enoent(file);
      return saved.openSync.call(fs, file, ...rest);
    },
    writeFileSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => (inStateDir(file) ? undefined : saved.writeFileSync.call(fs, file, ...rest)),
    appendFileSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => (inStateDir(file) ? undefined : saved.appendFileSync.call(fs, file, ...rest)),
    mkdirSync: (/** @type {any} */ file, /** @type {any[]} */ ...rest) => (inStateDir(file) ? undefined : saved.mkdirSync.call(fs, file, ...rest)),
  };
  for (const [name, fn] of Object.entries(overrides)) {
    saved[name] = mutableFs[name];
    mutableFs[name] = fn;
  }

  /** @type {Array<{ url: string, body: string }>} */
  const requests = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ async (/** @type {any} */ url, /** @type {any} */ init) => {
    requests.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const { sendJobSetupSpan, sendJobConclusionSpan } = require("../send_otlp_span.cjs");
    const startMs = Date.now() - 2000;
    const setup = await sendJobSetupSpan({ startMs: startMs - 1000 });
    process.env.GITHUB_AW_OTEL_TRACE_ID = setup.traceId;
    process.env.GITHUB_AW_OTEL_PARENT_SPAN_ID = setup.spanId;
    files.set(`${STATE_DIR}/agent_output.json`, JSON.stringify({ items: [], errors: [] }));
    agentOutputMtimeMs = Date.now();
    await sendJobConclusionSpan("gh-aw.agent.conclusion", { startMs });
  } finally {
    globalThis.fetch = savedFetch;
    for (const [name, fn] of Object.entries(saved)) mutableFs[name] = fn;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
  return requests;
}

module.exports = { runLegacyContractScenario, FACT_OPTIONS };

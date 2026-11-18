// @ts-check
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const metrics = require("./otlp_metrics.cjs");
const { buildBuiltinRunMetrics } = metrics;

function mockOTLPMirror() {
  const writes = [];
  vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
  vi.spyOn(fs, "chmodSync").mockImplementation(() => undefined);
  vi.spyOn(fs, "openSync").mockReturnValue(1);
  vi.spyOn(fs, "fchmodSync").mockImplementation(() => undefined);
  vi.spyOn(fs, "writeSync").mockImplementation((_fd, data) => {
    writes.push(String(data));
    return String(data).length;
  });
  vi.spyOn(fs, "closeSync").mockImplementation(() => undefined);
  return writes;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildOTLPMetric", () => {
  it("builds counters, gauges, and histogram observations in OTLP JSON form", () => {
    const counter = metrics.buildOTLPMetric({ name: "requests", value: 2, type: "counter", startMs: 1000, endMs: 2000 });
    expect(counter.sum.dataPoints[0]).toMatchObject({ asInt: "2", startTimeUnixNano: "1000000000", timeUnixNano: "2000000000" });

    const gauge = metrics.buildOTLPMetric({ name: "queue.depth", value: 0.5, type: "gauge", endMs: 2000 });
    expect(gauge.gauge.dataPoints[0]).toMatchObject({ asDouble: 0.5, timeUnixNano: "2000000000" });

    const histogram = metrics.buildOTLPMetric({ name: "duration", value: 2, type: "histogram", buckets: [5, 1], startMs: 1000, endMs: 2000 });
    expect(histogram.histogram.dataPoints[0]).toMatchObject({ count: "1", bucketCounts: ["0", "1", "0"], explicitBounds: [1, 5] });

    const bucketsFor = value => metrics.buildOTLPMetric({ name: "duration", value, type: "histogram", buckets: [1, 5, 15] }).histogram.dataPoints[0].bucketCounts;
    expect(bucketsFor(3)).toEqual(["0", "1", "0", "0"]);
    expect(bucketsFor(5)).toEqual(["0", "1", "0", "0"]);
    expect(bucketsFor(1)).toEqual(["1", "0", "0", "0"]);
    expect(bucketsFor(20)).toEqual(["0", "0", "0", "1"]);
  });

  it("rejects invalid metric values and buckets", () => {
    expect(() => metrics.buildOTLPMetric({ name: "counter", value: -1, type: "counter" })).toThrow("must not be negative");
    expect(() => metrics.buildOTLPMetric({ name: "histogram", value: 1, type: "histogram", buckets: [1, 1] })).toThrow("strictly increasing");
    expect(() => metrics.buildOTLPMetric({ name: "", value: 1 })).toThrow("metric name");
  });
});

describe("buildBuiltinRunMetrics", () => {
  it("builds the opt-in duration, error, token, tool-call, and safe-output metrics", () => {
    const result = buildBuiltinRunMetrics({
      jobName: "agent",
      workflow: "CI",
      engine: "copilot",
      model: "test-model",
      conclusion: "failure",
      startMs: 1000,
      endMs: 3000,
      inputTokens: 10,
      outputTokens: 3,
      cacheReadTokens: 5,
      cacheWriteTokens: 2,
      emitsTokenUsage: true,
      turns: 4,
      toolCalls: 4,
      failedToolCalls: 1,
      outputItemTypes: ["issue", "issue", "pull_request"],
      maxAICreditsExceeded: true,
      aiCreditsRateLimitError: true,
      exportFailures: 2,
      traceContext: { traceId: "1234567890abcdef1234567890abcdef", spanId: "1234567890abcdef" },
      provider: "github",
      agentName: "CI",
      agentDurationSeconds: 2,
      agentErrorType: "agent_failed",
    });

    expect(result.map(metric => metric.name)).toEqual([
      "gh_aw.job.duration",
      "gh_aw.run.duration",
      "gh_aw.job.errors",
      "gh_aw.run.errors",
      "gen_ai.client.token.usage",
      "gh_aw.tokens.input",
      "gen_ai.client.token.usage",
      "gh_aw.tokens.output",
      "gen_ai.client.token.usage",
      "gh_aw.tokens.cache_read",
      "gen_ai.client.token.usage",
      "gh_aw.tokens.cache_write",
      "gen_ai.client.inference.usage.input_tokens",
      "gen_ai.client.inference.usage.output_tokens",
      "gen_ai.client.inference.usage.cache_read.input_tokens",
      "gen_ai.client.inference.usage.cache_write.input_tokens",
      "gen_ai.invoke_agent.duration",
      "gh_aw.agent.turns",
      "gh_aw.tool_calls",
      "gh_aw.tool_calls",
      "gh_aw.ai.credits.limit_exceeded",
      "gh_aw.ai.credits.rate_limit_errors",
      "gh_aw.otlp.export.failures",
      "gh_aw.workflow.output.items",
      "gh_aw.safe_outputs",
      "gh_aw.workflow.output.items",
      "gh_aw.safe_outputs",
    ]);
    expect(result[0].histogram.dataPoints[0].sum).toBe(2);
    expect(result[0].histogram.dataPoints[0].attributes).toContainEqual({ key: "gh-aw.engine.id", value: { stringValue: "copilot" } });
    expect(result[0].histogram.dataPoints[0].attributes).toContainEqual({ key: "gen_ai.request.model", value: { stringValue: "test-model" } });
    expect(result[0].histogram.dataPoints[0].exemplars[0]).toMatchObject({ traceId: "1234567890abcdef1234567890abcdef", spanId: "1234567890abcdef" });
    expect(result[2].sum.dataPoints[0].asInt).toBe("1");
    expect(result[4].sum.dataPoints[0].attributes).toContainEqual({ key: "gen_ai.token.type", value: { stringValue: "input" } });
    expect(result[8].sum.dataPoints[0].attributes).toContainEqual({ key: "gen_ai.token.type", value: { stringValue: "input_cache_read" } });
    expect(result[17].histogram.dataPoints[0].sum).toBe(4);
    expect(result[18].sum.dataPoints[0].attributes).toContainEqual({ key: "gh-aw.tool.status", value: { stringValue: "ok" } });
    expect(result[19].sum.dataPoints[0].attributes).toContainEqual({ key: "gh-aw.tool.status", value: { stringValue: "error" } });
    expect(result[23].sum.dataPoints[0].attributes).toContainEqual({ key: "gh-aw.safe_output.type", value: { stringValue: "issue" } });
  });

  const usageInput = {
    jobName: "agent",
    workflow: "CI",
    engine: "copilot",
    model: "test-model",
    conclusion: "success",
    startMs: 1000,
    endMs: 3000,
    inputTokens: 10,
    outputTokens: 3,
    cacheReadTokens: 5,
    cacheWriteTokens: 2,
    emitsTokenUsage: true,
    provider: "github",
  };
  const byName = (result, name) => result.filter(metric => metric.name === name);
  const attrsOf = point => Object.fromEntries(point.attributes.map(a => [a.key, a.value.stringValue ?? a.value.intValue]));

  it("emits inclusive gen_ai.client.inference.usage.* counters with the required attributes", () => {
    const result = buildBuiltinRunMetrics(usageInput);
    const values = Object.fromEntries(["input_tokens", "output_tokens", "cache_read.input_tokens", "cache_write.input_tokens"].map(suffix => [suffix, byName(result, `gen_ai.client.inference.usage.${suffix}`)[0].sum.dataPoints[0].asInt]));
    expect(values).toEqual({ input_tokens: "17", output_tokens: "3", "cache_read.input_tokens": "5", "cache_write.input_tokens": "2" });
    for (const metric of result.filter(m => m.name.startsWith("gen_ai.client.inference.usage."))) {
      const attrs = attrsOf(metric.sum.dataPoints[0]);
      expect(attrs["gen_ai.operation.name"]).toBe("chat");
      expect(attrs["gen_ai.provider.name"]).toBe("github");
      expect(attrs["gen_ai.token.modality"]).toBe("unknown");
      expect(attrs["gen_ai.request.model"]).toBe("test-model");
      expect(metric.unit).toBe("{token}");
    }
  });

  it("omits zero and missing cache usage counters while keeping the zero token-usage compatibility point", () => {
    const result = buildBuiltinRunMetrics({ ...usageInput, cacheReadTokens: undefined, cacheWriteTokens: 0 });
    expect(byName(result, "gen_ai.client.inference.usage.cache_write.input_tokens")).toHaveLength(0);
    expect(byName(result, "gen_ai.client.inference.usage.cache_read.input_tokens")).toHaveLength(0);
    const tokenUsage = byName(result, "gen_ai.client.token.usage").map(metric => metric.sum.dataPoints[0]);
    const cacheWrite = tokenUsage.find(point => attrsOf(point)["gen_ai.token.type"] === "input_cache_write");
    expect(cacheWrite.asInt).toBe("0");
  });

  it("omits gen_ai.client.inference.usage.* without a provider", () => {
    const result = buildBuiltinRunMetrics({ ...usageInput, provider: undefined });
    expect(result.some(metric => metric.name.startsWith("gen_ai.client.inference.usage."))).toBe(false);
  });

  it("emits gen_ai.invoke_agent.duration with the semantic-convention buckets and attributes", () => {
    const result = buildBuiltinRunMetrics({ ...usageInput, agentName: "CI", agentDurationSeconds: 2, agentErrorType: "agent_failed" });
    const [duration] = byName(result, "gen_ai.invoke_agent.duration");
    expect(duration.unit).toBe("s");
    const point = duration.histogram.dataPoints[0];
    expect(point.explicitBounds).toEqual([0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4, 204.8, 409.6, 900, 1800, 3600, 7200, 14400, 43200, 86400]);
    expect(point.sum).toBe(2);
    const attrs = attrsOf(point);
    expect(attrs["gen_ai.operation.name"]).toBe("invoke_agent");
    expect(attrs["gen_ai.agent.name"]).toBe("CI");
    expect(attrs["gen_ai.request.model"]).toBe("test-model");
    expect(attrs["error.type"]).toBe("agent_failed");
    expect(byName(buildBuiltinRunMetrics(usageInput), "gen_ai.invoke_agent.duration")).toHaveLength(0);
  });

  it("drops gen_ai.client.token.usage and the alias token type under the latest-experimental opt-in", () => {
    const result = buildBuiltinRunMetrics({ ...usageInput, agentName: "CI", agentDurationSeconds: 2, semconvLatest: true });
    expect(byName(result, "gen_ai.client.token.usage")).toHaveLength(0);
    const aliases = Object.fromEntries(["input", "output", "cache_read", "cache_write"].map(kind => [kind, byName(result, `gh_aw.tokens.${kind}`)[0].sum.dataPoints[0]]));
    expect(Object.fromEntries(Object.entries(aliases).map(([kind, point]) => [kind, point.asInt]))).toEqual({ input: "10", output: "3", cache_read: "5", cache_write: "2" });
    for (const point of Object.values(aliases)) {
      expect(attrsOf(point)).not.toHaveProperty("gen_ai.token.type");
    }
    expect(byName(result, "gen_ai.client.inference.usage.input_tokens")).toHaveLength(1);
    expect(byName(result, "gen_ai.invoke_agent.duration")).toHaveLength(1);
  });

  it("omits the error counter for successful runs and unavailable usage", () => {
    const result = buildBuiltinRunMetrics({ conclusion: "success", startMs: 1000, endMs: 2000 });
    expect(result.map(metric => metric.name)).toEqual(["gh_aw.job.duration", "gh_aw.run.duration"]);
  });

  it("counts cancelled conclusions as job errors", () => {
    expect(buildBuiltinRunMetrics({ conclusion: "cancelled", startMs: 1000, endMs: 2000 }).map(metric => metric.name)).toEqual(["gh_aw.job.duration", "gh_aw.run.duration", "gh_aw.job.errors", "gh_aw.run.errors"]);
  });

  it("keeps the emitting job result separate from the inherited run result", () => {
    const result = buildBuiltinRunMetrics({ jobConclusion: "failure", runConclusion: "success", startMs: 1000, endMs: 2000 });
    expect(result.map(metric => metric.name)).toContain("gh_aw.job.errors");
    expect(result.map(metric => metric.name)).not.toContain("gh_aw.run.errors");
    expect(result[0].histogram.dataPoints[0].attributes).toContainEqual({ key: "cicd.pipeline.task.run.result", value: { stringValue: "failure" } });
    expect(result[1].histogram.dataPoints[0].attributes).toContainEqual({ key: "cicd.pipeline.task.run.result", value: { stringValue: "success" } });
  });

  it("keeps metric resource attributes to stable low-cardinality identity", () => {
    vi.stubEnv("OTEL_RESOURCE_ATTRIBUTES", "gh-aw.repository=owner%2Frepo,gh-aw.engine.id=copilot,gh-aw.run.id=123,github.run_id=123,custom.label=ignored");
    const payload = metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [] });
    const attributes = payload.resourceMetrics[0].resource.attributes;
    expect(attributes).toContainEqual({ key: "gh-aw.repository", value: { stringValue: "owner/repo" } });
    expect(attributes).toContainEqual({ key: "gh-aw.engine.id", value: { stringValue: "copilot" } });
    expect(attributes.map(attribute => attribute.key)).not.toContain("gh-aw.run.id");
    expect(attributes.map(attribute => attribute.key)).not.toContain("github.run_id");
    expect(attributes.map(attribute => attribute.key)).not.toContain("custom.label");
  });

  it("keeps per-run CI/CD and VCS resource attributes off the metric resource", () => {
    const { buildAttr } = require("./send_otlp_span.cjs");
    const payload = metrics.buildOTLPMetricsPayload({
      serviceName: "gh-aw",
      resourceAttributes: [buildAttr("cicd.pipeline.run.id", "123"), buildAttr("vcs.ref.head.revision", "abc123"), buildAttr("gh-aw.repository", "owner/repo")],
      metrics: [],
    });
    const keys = payload.resourceMetrics[0].resource.attributes.map(attribute => attribute.key);
    expect(keys).toContain("gh-aw.repository");
    expect(keys).not.toContain("cicd.pipeline.run.id");
    expect(keys).not.toContain("vcs.ref.head.revision");
    expect(payload.resourceMetrics[0].scopeMetrics[0]).not.toHaveProperty("schemaUrl");
    vi.stubEnv("OTEL_SEMCONV_STABILITY_OPT_IN", "gen_ai_latest_experimental");
    expect(metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [] }).resourceMetrics[0].scopeMetrics[0].schemaUrl).toBe("https://opentelemetry.io/schemas/1.45.0");
  });

  it("preserves safe token type enums and redacts secrets from ordinary string attributes", () => {
    const configuredValue = "local-value-42";
    vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", `X-Test=${configuredValue}`);
    const payload = metrics.buildOTLPMetricsPayload({
      serviceName: "gh-aw",
      metrics: [
        metrics.buildOTLPMetric({
          name: "gen_ai.client.token.usage",
          value: 1,
          type: "counter",
          attributes: [
            { key: "gen_ai.token.type", value: { stringValue: "input_cache_read" } },
            { key: "status", value: { stringValue: `prefix-${configuredValue}` } },
            { key: "external.label", value: { stringValue: configuredValue } },
          ],
        }),
      ],
    });

    const sanitized = metrics.sanitizeOTLPMetricsPayload(payload);
    const attributes = sanitized.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].attributes;
    expect(attributes).toContainEqual({ key: "gen_ai.token.type", value: { stringValue: "input_cache_read" } });
    expect(JSON.stringify(sanitized)).not.toContain(configuredValue);
  });

  it("redacts built-in credential patterns from metric identity and non-sensitive attribute keys", () => {
    const githubToken = `ghp_${"a".repeat(36)}`;
    const awsKey = `AKIA${"B".repeat(16)}`;
    const payload = metrics.buildOTLPMetricsPayload({
      serviceName: "gh-aw",
      metrics: [
        metrics.buildOTLPMetric({
          name: `leak.${githubToken}`,
          value: 1,
          unit: githubToken,
          description: `auth ${awsKey}`,
          attributes: [{ key: "status", value: { stringValue: awsKey } }],
        }),
      ],
    });

    const serialized = JSON.stringify(metrics.sanitizeOTLPMetricsPayload(payload));
    expect(serialized).not.toContain(githubToken);
    expect(serialized).not.toContain(awsKey);
  });
});

describe("OTLP metrics export", () => {
  it("mirrors before exporting JSON to the metrics endpoint", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    vi.stubEnv("GH_AW_OTLP_ENDPOINTS", JSON.stringify([{ url: "https://collector.example/v1/traces", headers: "X-Trace-Endpoint=metrics" }]));
    vi.stubEnv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf");
    vi.stubEnv("OTEL_EXPORTER_OTLP_METRICS_PROTOCOL", "http/json");
    const mirror = mockOTLPMirror();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const payload = metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [metrics.buildOTLPMetric({ name: "test", value: 1 })] });

    await metrics.sendOTLPMetrics(payload);

    expect(mirror[0]).toContain('"resourceMetrics"');
    expect(fs.writeSync.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://collector.example/v1/metrics");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "Content-Type": "application/json", "X-Trace-Endpoint": "metrics" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).resourceMetrics).toBeDefined();
  });

  it("exports protobuf when OTEL_EXPORTER_OTLP_PROTOCOL selects it, keeping the JSON mirror", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    vi.stubEnv("GH_AW_OTLP_ENDPOINTS", JSON.stringify([{ url: "https://collector.example/v1/traces" }]));
    vi.stubEnv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf");
    const mirror = mockOTLPMirror();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const payload = metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [metrics.buildOTLPMetric({ name: "test", value: 1, type: "histogram" })] });

    await metrics.sendOTLPMetrics(payload);

    const { encodeOTLPMetricsRequest } = require("./otlp_protobuf.cjs");
    expect(mirror[0]).toContain('"resourceMetrics"');
    expect(fetchMock.mock.calls[0][0]).toBe("https://collector.example/v1/metrics");
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/x-protobuf");
    expect(fetchMock.mock.calls[0][1].body).toEqual(encodeOTLPMetricsRequest(metrics.sanitizeOTLPMetricsPayload(payload)));
  });

  it("does not mirror or export when the opt-in flag is absent", async () => {
    const mirror = mockOTLPMirror();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const payload = metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [metrics.buildOTLPMetric({ name: "test", value: 1 })] });

    await metrics.sendOTLPMetrics(payload);

    expect(mirror).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes a non-fatal custom metric API that is also opt-in", async () => {
    const mirror = mockOTLPMirror();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(require("./otlp.cjs").logMetric("custom.items", 3, { type: "counter" })).resolves.toBeUndefined();
    expect(mirror).toHaveLength(0);

    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    await expect(require("./otlp.cjs").logMetric("custom.items", 3, { type: "counter" })).resolves.toBeUndefined();
    await metrics.flushCustomMetrics();
    expect(mirror.join("")).toContain('"custom.items"');
  });

  it("buffers and aggregates custom observations into one bounded export", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    vi.stubEnv("GH_AW_OTLP_ENDPOINTS", JSON.stringify([{ url: "https://collector.example" }]));
    mockOTLPMirror();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const logMetric = require("./otlp.cjs").logMetric;

    await logMetric("custom.requests", 2, { type: "counter" });
    await logMetric("custom.requests", 3, { type: "counter" });

    expect(fetchMock).not.toHaveBeenCalled();
    await metrics.flushCustomMetrics();

    expect(fetchMock).toHaveBeenCalledOnce();
    const exported = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(exported.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].asInt).toBe("5");
  });

  it("rejects unbounded custom metric attributes without throwing", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    const mirror = mockOTLPMirror();
    const logMetric = require("./otlp.cjs").logMetric;

    await logMetric("custom.items", 1, { attributes: { "gh-aw.repository": "owner/repo", "gh-aw.run.id": "123" } });
    await logMetric("custom.items", 1, { attributes: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`label.${index}`, index])) });
    await logMetric("custom.items", 1, { attributes: { ["k".repeat(129)]: "value" } });
    await logMetric("custom.items", 1, { attributes: { "label.value": "v".repeat(129) } });

    expect(mirror).toHaveLength(0);
  });

  it("drops custom metrics with invalid names or secrets without throwing", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    const mirror = mockOTLPMirror();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logMetric = require("./otlp.cjs").logMetric;
    const githubToken = `ghp_${"c".repeat(36)}`;

    await logMetric("1bad name", 1);
    await logMetric("x".repeat(256), 1);
    await logMetric("custom.items", 1, { unit: "u".repeat(64) });
    await logMetric("custom.items", 1, { description: "d".repeat(1024) });
    await logMetric(`custom.${githubToken}`, 1);
    await logMetric("custom.items", 1, { description: `token ${githubToken}` });
    await logMetric("custom.items", 1, { attributes: { status: githubToken } });
    await metrics.flushCustomMetrics();

    expect(mirror).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(7);

    await logMetric("my-tool.items_processed", 1, { type: "counter", unit: "{item}" });
    await metrics.flushCustomMetrics();
    expect(mirror.join("")).toContain('"my-tool.items_processed"');
  });

  it("records metric endpoint failures locally and exports the failure counter to healthy endpoints", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    vi.stubEnv("GH_AW_OTLP_ENDPOINTS", JSON.stringify([{ url: "https://failed.example/v1/traces" }, { url: "https://healthy.example/v1/traces" }]));
    const persisted = new Map();
    vi.spyOn(fs, "readFileSync").mockImplementation(filePath => {
      if (persisted.has(String(filePath))) return persisted.get(String(filePath));
      throw Object.assign(new Error("missing test file"), { code: "ENOENT" });
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((filePath, value) => persisted.set(String(filePath), String(value)));
    const mirror = mockOTLPMirror();
    vi.spyOn(globalThis, "setTimeout").mockImplementation(callback => {
      callback();
      return 0;
    });
    const fetchMock = vi.fn(async url =>
      new URL(url).hostname === "failed.example" ? { ok: false, status: 500, statusText: "error", body: null, headers: new Headers() } : { ok: true, status: 200, statusText: "OK", body: null, headers: new Headers() }
    );
    vi.stubGlobal("fetch", fetchMock);
    const payload = metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [metrics.buildOTLPMetric({ name: "custom.items", value: 1 })] });

    await metrics.sendOTLPMetrics(payload, { traceId: "1234567890abcdef1234567890abcdef", spanId: "1234567890abcdef" });

    const mirroredPayloads = mirror.map(line => JSON.parse(line));
    const failurePayload = mirroredPayloads.find(entry => entry.resourceMetrics[0].scopeMetrics[0].metrics[0].name === "gh_aw.otlp.export.failures");
    expect(failurePayload).toBeDefined();
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).hostname)).toContain("healthy.example");
    expect(fetchMock.mock.calls.some(([, options]) => JSON.parse(options.body).resourceMetrics[0].scopeMetrics[0].metrics[0].name === "gh_aw.otlp.export.failures")).toBe(true);
    expect(persisted.get("/tmp/gh-aw/otlp-metric-failures-reported.txt")).toBe("1");
    expect(metrics.getUnreportedOTLPMetricFailures()).toBe(0);
  });

  it("does not re-add failures already carried by the exported payload", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    vi.stubEnv("GH_AW_OTLP_ENDPOINTS", JSON.stringify([{ url: "https://failed.example/v1/traces" }, { url: "https://healthy.example/v1/traces" }]));
    const persisted = new Map([["/tmp/gh-aw/otlp-export-errors.count", "2"]]);
    const readFileSync = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath, ...args) => {
      if (persisted.has(String(filePath))) return persisted.get(String(filePath));
      if (!String(filePath).startsWith("/tmp/gh-aw/")) return readFileSync(filePath, ...args);
      throw Object.assign(new Error("missing test file"), { code: "ENOENT" });
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((filePath, value) => persisted.set(String(filePath), String(value)));
    vi.spyOn(fs, "appendFileSync").mockImplementation(() => undefined);
    mockOTLPMirror();
    vi.spyOn(globalThis, "setTimeout").mockImplementation(callback => {
      callback();
      return 0;
    });
    const fetchMock = vi.fn(async url =>
      new URL(url).hostname === "failed.example" ? { ok: false, status: 500, statusText: "error", body: null, headers: new Headers() } : { ok: true, status: 200, statusText: "OK", body: null, headers: new Headers() }
    );
    vi.stubGlobal("fetch", fetchMock);
    const payload = metrics.buildOTLPMetricsPayload({ serviceName: "gh-aw", metrics: [metrics.buildOTLPMetric({ name: "gh_aw.otlp.export.failures", type: "counter", value: metrics.getUnreportedOTLPMetricFailures() })] });

    await metrics.sendOTLPMetrics(payload);

    const healthyFailureValues = fetchMock.mock.calls
      .filter(([url]) => new URL(url).hostname === "healthy.example")
      .flatMap(([, options]) => JSON.parse(options.body).resourceMetrics[0].scopeMetrics[0].metrics)
      .filter(metric => metric.name === "gh_aw.otlp.export.failures")
      .map(metric => Number(metric.sum.dataPoints[0].asInt));
    expect(healthyFailureValues).toEqual([2, 1]);
    expect(persisted.get("/tmp/gh-aw/otlp-export-errors.count")).toBe("3");
    expect(metrics.getUnreportedOTLPMetricFailures()).toBe(0);
  });

  it("caps unique custom metric series per process", async () => {
    vi.stubEnv("GH_AW_OTEL_METRICS", "true");
    const mirror = mockOTLPMirror();
    const logMetric = require("./otlp.cjs").logMetric;

    await Promise.all(Array.from({ length: 101 }, (_, index) => logMetric(`custom.series.${index}`, 1)));
    await metrics.flushCustomMetrics();

    expect(mirror.length).toBeLessThanOrEqual(metrics.MAX_CUSTOM_METRIC_SERIES);
  });

  it("creates the mirror directory and file with private permissions", () => {
    mockOTLPMirror();
    metrics.appendToOTLPMetricsJSONL({ resourceMetrics: [] });

    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/gh-aw", { recursive: true, mode: 0o700 });
    expect(fs.chmodSync).toHaveBeenCalledWith("/tmp/gh-aw", 0o700);
    expect(fs.openSync).toHaveBeenCalledWith(metrics.OTEL_METRICS_JSONL_PATH, expect.any(Number), 0o600);
    expect(fs.fchmodSync).toHaveBeenCalledWith(1, 0o600);
  });
});

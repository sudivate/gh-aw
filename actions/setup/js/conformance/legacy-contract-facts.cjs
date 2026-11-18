// @ts-check
"use strict";

/**
 * Flattens OTLP/HTTP JSON export bodies into sorted "fact" strings so that two
 * exports can be compared by set inclusion (spec T-OT-020, backward
 * compatibility). Timestamps and trace/span IDs are left out; span parents are
 * resolved to span names.
 */

/**
 * @param {any} value
 * @returns {unknown}
 */
function otlpAnyValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("intValue" in value) return Number(value.intValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("boolValue" in value) return value.boolValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(otlpAnyValue);
  if (value.kvlistValue) return Object.fromEntries((value.kvlistValue.values || []).map(/** @param {any} kv */ kv => [kv.key, otlpAnyValue(kv.value)]));
  return null;
}

/**
 * @param {any[] | undefined} list
 * @param {Set<string>} volatile
 * @returns {Record<string, unknown>}
 */
function attributeMap(list, volatile) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const attribute of list || []) {
    out[attribute.key] = volatile.has(attribute.key) ? "<volatile>" : otlpAnyValue(attribute.value);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} attributes
 * @returns {string}
 */
function formatAttributes(attributes) {
  return Object.keys(attributes)
    .sort()
    .map(key => `${key}=${JSON.stringify(attributes[key])}`)
    .join(",");
}

/**
 * @param {Array<{ body: string | object }>} exports - captured OTLP/HTTP JSON request bodies
 * @param {{ volatileAttributes?: string[], volatileMetricPattern?: RegExp }} [options]
 *   volatileAttributes: keys whose values are recorded as "<volatile>";
 *   volatileMetricPattern: metric names whose data-point values (not counts) are recorded as "<volatile>"
 * @returns {string[]}
 */
function otlpFacts(exports, options = {}) {
  const volatile = new Set(options.volatileAttributes || []);
  const volatileMetricPattern = options.volatileMetricPattern;
  /** @type {Set<string>} */
  const facts = new Set();
  /** @type {any[]} */
  const spans = [];
  for (const exported of exports) {
    const body = typeof exported.body === "string" ? JSON.parse(exported.body) : exported.body;
    for (const resourceSpans of body.resourceSpans || []) {
      const resource = attributeMap(resourceSpans.resource?.attributes, volatile);
      for (const scopeSpans of resourceSpans.scopeSpans || []) {
        for (const span of scopeSpans.spans || []) spans.push({ resource, scope: scopeSpans.scope || {}, span });
      }
    }
    for (const resourceMetrics of body.resourceMetrics || []) {
      const resource = attributeMap(resourceMetrics.resource?.attributes, volatile);
      for (const scopeMetrics of resourceMetrics.scopeMetrics || []) {
        for (const metric of scopeMetrics.metrics || []) {
          const prefix = `metric ${JSON.stringify(metric.name)}`;
          const type = ["sum", "gauge", "histogram", "exponentialHistogram"].find(t => metric[t]) || "unknown";
          const data = metric[type] || {};
          facts.add(`${prefix} type=${type}`);
          facts.add(`${prefix} unit=${JSON.stringify(metric.unit || "")}`);
          facts.add(`${prefix} scope=${JSON.stringify(scopeMetrics.scope?.name || "")}`);
          if (type === "sum") facts.add(`${prefix} monotonic=${Boolean(data.isMonotonic)}`);
          if (data.aggregationTemporality !== undefined) facts.add(`${prefix} temporality=${data.aggregationTemporality}`);
          for (const [key, value] of Object.entries(resource)) facts.add(`${prefix} resource ${key}=${JSON.stringify(value)}`);
          for (const point of data.dataPoints || []) {
            const where = `${prefix} point {${formatAttributes(attributeMap(point.attributes, volatile))}}`;
            const valueOf = /** @param {unknown} v */ v => (volatileMetricPattern && volatileMetricPattern.test(metric.name) ? "<volatile>" : v);
            if (type === "histogram") {
              facts.add(`${where} bounds=${JSON.stringify(point.explicitBounds || [])}`);
              facts.add(`${where} count=${JSON.stringify(Number(point.count))}`);
              facts.add(`${where} sum=${JSON.stringify(valueOf(point.sum))}`);
            } else {
              facts.add(`${where} value=${JSON.stringify(valueOf(point.asInt !== undefined ? Number(point.asInt) : point.asDouble))}`);
            }
          }
        }
      }
    }
  }
  const nameById = new Map(spans.map(entry => [entry.span.spanId, entry.span.name]));
  for (const { resource, scope, span } of spans) {
    const prefix = `span ${JSON.stringify(span.name)}`;
    const parent = span.parentSpanId ? (nameById.has(span.parentSpanId) ? JSON.stringify(nameById.get(span.parentSpanId)) : "<external>") : "<root>";
    facts.add(`${prefix} kind=${span.kind}`);
    facts.add(`${prefix} parent=${parent}`);
    facts.add(`${prefix} status.code=${span.status?.code ?? 0}`);
    if (span.status?.message) facts.add(`${prefix} status.message=${JSON.stringify(span.status.message)}`);
    facts.add(`${prefix} scope=${JSON.stringify(scope.name || "")}`);
    for (const [key, value] of Object.entries(attributeMap(span.attributes, volatile))) facts.add(`${prefix} attr ${key}=${JSON.stringify(value)}`);
    for (const [key, value] of Object.entries(resource)) facts.add(`${prefix} resource ${key}=${JSON.stringify(value)}`);
    for (const event of span.events || []) {
      const eventPrefix = `${prefix} event ${JSON.stringify(event.name)}`;
      facts.add(eventPrefix);
      for (const [key, value] of Object.entries(attributeMap(event.attributes, volatile))) facts.add(`${eventPrefix} attr ${key}=${JSON.stringify(value)}`);
    }
  }
  return [...facts].sort();
}

/**
 * Facts in `expected` that are absent from `actual`.
 * @param {string[]} expected
 * @param {string[]} actual
 * @returns {string[]}
 */
function missingFacts(expected, actual) {
  const present = new Set(actual);
  return expected.filter(fact => !present.has(fact));
}

module.exports = { otlpFacts, missingFacts };

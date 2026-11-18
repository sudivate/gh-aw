// Shows the inclusive input-token count gh-aw reports under the opt-in, before and after the cache-semantics fix.
const { computeInclusiveInputTokens } = require(process.env.JS + "/model_costs.cjs");
const cases = [
  ["openai via AWF proxy (input_tokens_include_cache: true)", { provider: "openai", input_tokens: 1000, cache_read_tokens: 400, cache_write_tokens: 0, input_tokens_include_cache: true }],
  ["copilot via AWF proxy (input_tokens_include_cache: true)", { provider: "copilot", input_tokens: 1000, cache_read_tokens: 400, cache_write_tokens: 100, input_tokens_include_cache: true }],
  ["anthropic via AWF proxy (input_tokens_include_cache: false)", { provider: "anthropic", input_tokens: 1000, cache_read_tokens: 400, cache_write_tokens: 100, input_tokens_include_cache: false }],
  ["legacy openai record, no flag (provider default: cache reads included)", { provider: "openai", input_tokens: 1000, cache_read_tokens: 400, cache_write_tokens: 100 }],
  ["legacy unknown provider, no flag (additive)", { provider: "some-new-provider", input_tokens: 1000, cache_read_tokens: 400, cache_write_tokens: 100 }],
];
console.log("| Record | input | cache read | cache write | Before (input + read + write) | After (AI-credits rule) | Overcount before |");
console.log("|---|---|---|---|---|---|---|");
for (const [label, r] of cases) {
  const before = r.input_tokens + r.cache_read_tokens + r.cache_write_tokens;
  const after = computeInclusiveInputTokens({ provider: r.provider, inputTokens: r.input_tokens, cacheReadTokens: r.cache_read_tokens, cacheWriteTokens: r.cache_write_tokens, inputTokensIncludeCache: r.input_tokens_include_cache });
  console.log(`| ${label} | ${r.input_tokens} | ${r.cache_read_tokens} | ${r.cache_write_tokens} | ${before} | ${after} | ${before - after} |`);
}
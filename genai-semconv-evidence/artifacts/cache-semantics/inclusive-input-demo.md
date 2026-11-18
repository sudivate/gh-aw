| Record | input | cache read | cache write | Before (input + read + write) | After (AI-credits rule) | Overcount before |
|---|---|---|---|---|---|---|
| openai via AWF proxy (input_tokens_include_cache: true) | 1000 | 400 | 0 | 1400 | 1000 | 400 |
| copilot via AWF proxy (input_tokens_include_cache: true) | 1000 | 400 | 100 | 1500 | 1000 | 500 |
| anthropic via AWF proxy (input_tokens_include_cache: false) | 1000 | 400 | 100 | 1500 | 1500 | 0 |
| legacy openai record, no flag (provider default: cache reads included) | 1000 | 400 | 100 | 1500 | 1100 | 400 |
| legacy unknown provider, no flag (additive) | 1000 | 400 | 100 | 1500 | 1500 | 0 |

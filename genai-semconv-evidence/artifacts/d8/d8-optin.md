---
on:
  workflow_dispatch:
permissions:
  contents: read
engine: copilot
env:
  OTEL_SEMCONV_STABILITY_OPT_IN: gen_ai_latest_experimental
observability:
  otlp:
    endpoint:
      - url: ${{ secrets.GH_AW_OTEL_ENDPOINT }}
---

# D8 opt-in check

Say hello.

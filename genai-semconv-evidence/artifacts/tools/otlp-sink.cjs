// Minimal OTLP/HTTP JSON sink: writes each POST body to OUT_DIR/<n>-<path>.json
const http = require("http");
const fs = require("fs");
const path = require("path");
const out = process.argv[2];
const port = Number(process.argv[3] || 4399);
fs.mkdirSync(out, { recursive: true });
let n = 0;
http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      n += 1;
      const name = `${String(n).padStart(2, "0")}-${req.url.replace(/[^a-z0-9]+/gi, "_").replace(/^_/, "")}.json`;
      const body = Buffer.concat(chunks).toString("utf8");
      let pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch {}
      fs.writeFileSync(path.join(out, name), pretty + "\n");
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`sink on ${port} -> ${out}`));
// Servidor local da página de simulação (só 127.0.0.1). Uso: node extensao/teste/servir.mjs
// Gera a página antes (build --simulacao) e serve teste/dist na porta 4317.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [join(aqui, "..", "build.mjs"), "--simulacao"], { stdio: "inherit" });

const raiz = join(aqui, "dist");
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
createServer((req, res) => {
  const caminho = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^([\\/]\.\.)+/, "");
  const arquivo = join(raiz, caminho === "/" || caminho === "\\" ? "index.html" : caminho);
  if (!arquivo.startsWith(raiz) || !existsSync(arquivo)) {
    res.writeHead(404).end("não achei");
    return;
  }
  res.writeHead(200, { "content-type": tipos[arquivo.slice(arquivo.lastIndexOf("."))] ?? "application/octet-stream" });
  res.end(readFileSync(arquivo));
}).listen(4317, "127.0.0.1", () => console.log("Simulação em http://127.0.0.1:4317/"));

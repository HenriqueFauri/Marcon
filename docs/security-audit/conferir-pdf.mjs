// Confere o PDF gerado: conta as páginas e rasteriza cada uma em paginas/pagina-NN.png
// (pdf.js rodando no Chrome headless), para olhar gráficos e tabelas.
// Uso (nesta pasta): npm run conferir
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(AQUI, "paginas");
mkdirSync(PASTA, { recursive: true });

const TIPOS = { ".mjs": "text/javascript", ".js": "text/javascript", ".pdf": "application/pdf", ".html": "text/html" };
const servidor = createServer((req, res) => {
  const alvo = path.join(AQUI, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!alvo.startsWith(AQUI) || !existsSync(alvo)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(alvo)] ?? "application/octet-stream" }).end(readFileSync(alvo));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${servidor.address().port}`;

const pagina = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888">
<script type="module">
  import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.mjs";
  pdfjs.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.mjs";
  const doc = await pdfjs.getDocument("/relatorio-auditoria-seguranca.pdf").promise;
  const imagens = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1.6 });
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    imagens.push(c.toDataURL("image/png"));
  }
  window.resultado = { paginas: doc.numPages, imagens };
</script>`;
writeFileSync(path.join(AQUI, "paginas", "render.html"), pagina);

const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((c) => c && existsSync(c));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.goto(`${base}/paginas/render.html`);
await page.waitForFunction("window.resultado", { timeout: 120000 });
const { paginas, imagens } = await page.evaluate("window.resultado");
imagens.forEach((url, i) => writeFileSync(path.join(PASTA, `pagina-${String(i + 1).padStart(2, "0")}.png`), Buffer.from(url.split(",")[1], "base64")));
await browser.close();
servidor.close();
console.log(`${paginas} páginas rasterizadas em ${PASTA}`);

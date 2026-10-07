// Gera docs/security-audit/relatorio-auditoria-seguranca.pdf a partir de achados.mjs.
// Uso (nesta pasta): npm install && npm run gerar
// Precisa do Google Chrome instalado; o caminho pode ser trocado com a variável CHROME_PATH.
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import {
  PROJETO, DATA, COMMIT, ESCOPO, STACK, CATEGORIAS, ACHADOS, PONTOS_FORTES, PONTOS_FRACOS, RECOMENDACOES, ISSUES,
} from "./achados.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA_PDF = path.join(AQUI, "relatorio-auditoria-seguranca.pdf");
const SAIDA_HTML = path.join(AQUI, "relatorio-auditoria-seguranca.html");
const TITULO = `Relatório de Auditoria de Segurança: ${PROJETO}`;

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const SEV = {
  critica: { nome: "Crítica", cor: "#B91C1C" },
  alta: { nome: "Alta", cor: "#EA580C" },
  media: { nome: "Média", cor: "#D97706" },
  baixa: { nome: "Baixa", cor: "#2563EB" },
  info: { nome: "Informativa", cor: "#64748B" },
};
const ORDEM_SEV = ["critica", "alta", "media", "baixa", "info"];
const COR_FORTE = "#059669";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// `código` inline vira <code>
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const chip = (sev) => `<span class="chip" style="background:${SEV[sev].cor}">${SEV[sev].nome}</span>`;

const contagem = Object.fromEntries(ORDEM_SEV.map((s) => [s, ACHADOS.filter((a) => a.sev === s).length]));
const total = ACHADOS.length;

// ---------- gráficos (SVG estático) ----------
function rosca() {
  const R = 78, r = 50, cx = 100, cy = 100, GAP = 0.025; // GAP em radianos: espaço entre fatias
  let ang = -Math.PI / 2;
  const fatias = ORDEM_SEV.filter((s) => contagem[s] > 0).map((s) => {
    const a0 = ang, a1 = ang + (contagem[s] / total) * Math.PI * 2;
    ang = a1;
    const b0 = a0 + GAP / 2, b1 = a1 - GAP / 2;
    const p = (rad, raio) => `${(cx + raio * Math.cos(rad)).toFixed(2)} ${(cy + raio * Math.sin(rad)).toFixed(2)}`;
    const grande = b1 - b0 > Math.PI ? 1 : 0;
    return `<path d="M ${p(b0, R)} A ${R} ${R} 0 ${grande} 1 ${p(b1, R)} L ${p(b1, r)} A ${r} ${r} 0 ${grande} 0 ${p(b0, r)} Z" fill="${SEV[s].cor}"><title>${SEV[s].nome}: ${contagem[s]}</title></path>`;
  });
  const legenda = ORDEM_SEV.map(
    (s) => `<div class="leg"><span class="sw" style="background:${SEV[s].cor}"></span><span class="leg-n">${SEV[s].nome}</span><span class="leg-v">${contagem[s]}</span></div>`,
  ).join("");
  return `<figure class="grafico">
    <figcaption>Achados por severidade</figcaption>
    <div class="rosca-wrap">
      <svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label="Rosca de achados por severidade">
        ${fatias.join("")}
        <text x="100" y="98" text-anchor="middle" class="rosca-num">${total}</text>
        <text x="100" y="118" text-anchor="middle" class="rosca-rot">achados</text>
      </svg>
      <div class="legenda">${legenda}</div>
    </div>
  </figure>`;
}

function barras() {
  const linhas = CATEGORIAS.map((c) => {
    const porSev = ORDEM_SEV.map((s) => [s, ACHADOS.filter((a) => a.cat === c.id && a.sev === s).length]).filter(([, n]) => n > 0);
    const fortes = PONTOS_FORTES.filter((p) => p.cat === c.id).length;
    return { c, porSev, n: porSev.reduce((t, [, n]) => t + n, 0), fortes };
  });
  const max = Math.max(...linhas.map((l) => Math.max(l.n, l.fortes)));
  const W = 200, X0 = 100, ALT = 15, GAP = 2, BLOCO = 2 * ALT + GAP + 16;
  const unid = W / max;
  const svg = linhas.map((l, i) => {
    const y = 6 + i * BLOCO;
    let x = X0;
    const segs = l.porSev.map(([s, n], j) => {
      const w = n * unid - (j < l.porSev.length - 1 ? GAP : 0);
      const ultimo = j === l.porSev.length - 1;
      const seg = ultimo
        ? `<path d="M ${x} ${y} h ${Math.max(w - 3, 0)} a 3 3 0 0 1 3 3 v ${ALT - 6} a 3 3 0 0 1 -3 3 h ${-Math.max(w - 3, 0)} Z" fill="${SEV[s].cor}"><title>${l.c.nome}: ${n} ${SEV[s].nome}</title></path>`
        : `<rect x="${x}" y="${y}" width="${w}" height="${ALT}" fill="${SEV[s].cor}"><title>${l.c.nome}: ${n} ${SEV[s].nome}</title></rect>`;
      x += n * unid;
      return seg;
    }).join("");
    const yF = y + ALT + GAP;
    const wF = l.fortes * unid;
    const forte = l.fortes
      ? `<path d="M ${X0} ${yF} h ${wF - 3} a 3 3 0 0 1 3 3 v ${ALT - 6} a 3 3 0 0 1 -3 3 h ${-(wF - 3)} Z" fill="${COR_FORTE}"><title>${l.c.nome}: ${l.fortes} pontos fortes</title></path>`
      : "";
    return `
      <text x="${X0 - 8}" y="${y + ALT + 3}" text-anchor="end" class="bar-cat">${l.c.id}. ${esc(l.c.curto)}</text>
      ${segs || `<line x1="${X0}" x2="${X0}" y1="${y}" y2="${y + ALT}" class="eixo"/>`}
      <text x="${(l.n ? X0 + l.n * unid : X0) + 5}" y="${y + ALT - 3}" class="bar-v">${l.n} ${l.n === 1 ? "achado" : "achados"}</text>
      ${forte}
      <text x="${X0 + wF + 5}" y="${yF + ALT - 3}" class="bar-v">${l.fortes} fortes</text>`;
  }).join("");
  const altura = 6 + linhas.length * BLOCO;
  return `<figure class="grafico">
    <figcaption>Achados e pontos fortes por categoria</figcaption>
    <svg viewBox="0 0 400 ${altura}" width="100%" role="img" aria-label="Barras por categoria">
      <line x1="${X0}" x2="${X0}" y1="2" y2="${altura - 8}" class="eixo"/>
      ${svg}
    </svg>
    <div class="legenda linha">
      ${ORDEM_SEV.filter((s) => contagem[s] > 0).map((s) => `<div class="leg"><span class="sw" style="background:${SEV[s].cor}"></span>${SEV[s].nome}</div>`).join("")}
      <div class="leg"><span class="sw" style="background:${COR_FORTE}"></span>Ponto forte</div>
    </div>
  </figure>`;
}

// ---------- issues em Markdown ----------
function markdownDaIssue(issue) {
  return [
    `# ${issue.titulo}`,
    "",
    `**Labels sugeridas:** ${issue.labels.map((l) => `\`${l}\``).join(", ")}`,
    `**Achados do relatório:** ${issue.achados.join(", ")}`,
    "",
    "## Problema e por que é explorável",
    issue.problema,
    "",
    "## Evidência",
    ...issue.evidencia.map((e) => `- ${e.replace(/\n/g, "\n  ")}`),
    "",
    "## Impacto",
    issue.impacto,
    "",
    "## Sugestão de correção",
    issue.correcao,
    "",
    "## Critérios de aceite",
    ...issue.aceite.map((a) => `- [ ] ${a}`),
  ].join("\n");
}

// ---------- HTML ----------
const sevMax = ORDEM_SEV.find((s) => contagem[s] > 0);

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(TITULO)}</title>
<style>
  :root { --ink:#0f172a; --ink2:#334155; --muted:#64748b; --line:#e2e8f0; --fill:#f8fafc; --brand:#0f766e; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; color:var(--ink); font-size:10pt; line-height:1.5; background:#fff; }
  h1,h2,h3 { line-height:1.25; color:var(--ink); }
  h2 { font-size:16pt; margin:0 0 10pt; padding-bottom:6pt; border-bottom:2px solid var(--ink); break-after:avoid; }
  h3 { font-size:11.5pt; margin:16pt 0 6pt; break-after:avoid; }
  p { margin:0 0 7pt; }
  code { font-family:Consolas, "Cascadia Mono", monospace; font-size:8.6pt; background:#f1f5f9; padding:0 3px; border-radius:3px; overflow-wrap:anywhere; }
  .secao { break-before:page; }
  .capa { height:247mm; display:flex; flex-direction:column; justify-content:space-between; }
  .capa .faixa { border-left:6px solid var(--brand); padding-left:16pt; margin-top:36pt; }
  .capa .eyebrow { text-transform:uppercase; letter-spacing:.12em; font-size:9pt; color:var(--muted); font-weight:600; }
  .capa h1 { font-size:27pt; margin:6pt 0 8pt; }
  .capa .meta { color:var(--ink2); font-size:10.5pt; }
  .capa .bloco { background:var(--fill); border:1px solid var(--line); border-radius:8px; padding:12pt 14pt; margin-top:12pt; }
  .capa .bloco h3 { margin-top:0; }
  .capa ul { margin:0; padding-left:14pt; }
  .capa li { margin-bottom:3pt; }
  table { width:100%; border-collapse:collapse; font-size:9pt; }
  th { text-align:left; font-weight:600; color:var(--ink2); background:var(--fill); border-bottom:1.5px solid #cbd5e1; padding:5pt 6pt; }
  td { border-bottom:1px solid var(--line); padding:5pt 6pt; vertical-align:top; }
  tr { break-inside:avoid; }
  .stack td, .metodo td, .escala td { font-size:8.6pt; padding:3.5pt 6pt; }
  .stack td:first-child { width:28%; font-weight:600; color:var(--ink2); }
  .metodo td:first-child { width:24%; font-weight:600; }
  .chip { display:inline-block; color:#fff; font-size:7.6pt; font-weight:700; padding:1.5pt 7pt; border-radius:999px; white-space:nowrap; letter-spacing:.02em; }
  .kpis { display:grid; grid-template-columns:repeat(5, 1fr); gap:6pt; margin:4pt 0 12pt; }
  .kpi { border:1px solid var(--line); border-radius:8px; padding:8pt; border-top:4px solid; }
  .kpi .v { font-size:20pt; font-weight:700; line-height:1.1; }
  .kpi .n { font-size:8.5pt; color:var(--muted); }
  .graficos { display:grid; grid-template-columns: minmax(0,5fr) minmax(0,7fr); gap:10pt; align-items:start; break-inside:avoid; }
  .grafico { margin:0; border:1px solid var(--line); border-radius:8px; padding:10pt; }
  .grafico figcaption { font-weight:600; font-size:9.5pt; color:var(--ink2); margin-bottom:6pt; }
  .rosca-wrap { display:flex; flex-direction:column; align-items:center; gap:6pt; }
  .rosca-num { font-size:30px; font-weight:700; fill:var(--ink); }
  .rosca-rot { font-size:11px; fill:var(--muted); }
  .legenda { display:grid; grid-template-columns:1fr 1fr; gap:2pt 12pt; font-size:8.6pt; color:var(--ink2); width:100%; }
  .legenda.linha { display:flex; flex-wrap:wrap; gap:4pt 12pt; margin-top:6pt; }
  .leg { display:flex; align-items:center; gap:5pt; }
  .leg-v { margin-left:auto; font-weight:600; color:var(--ink); }
  .sw { width:9pt; height:9pt; border-radius:2px; display:inline-block; flex:none; }
  .bar-cat { font-size:12px; fill:var(--ink2); font-weight:600; }
  .bar-v { font-size:11px; fill:var(--muted); }
  .eixo { stroke:#cbd5e1; stroke-width:1; }
  .duas { display:grid; grid-template-columns:1fr 1fr; gap:12pt; }
  .caixa { border:1px solid var(--line); border-radius:8px; padding:10pt 12pt; }
  .caixa li { break-inside:avoid; }
  .caixa.forte { border-top:4px solid ${COR_FORTE}; }
  .caixa.fraco { border-top:4px solid ${SEV.alta.cor}; }
  .caixa ul { margin:0; padding-left:13pt; }
  .caixa li { margin-bottom:4pt; }
  .fortes-lista li { margin-bottom:5pt; }
  .tag-cat { display:inline-block; font-size:7.4pt; font-weight:700; color:${COR_FORTE}; border:1px solid ${COR_FORTE}; border-radius:4px; padding:0 4pt; margin-right:4pt; }
  .tab-achados td.ref { width:40%; font-family:Consolas, monospace; font-size:7.8pt; color:var(--ink2); overflow-wrap:anywhere; }
  .tab-achados td.sev { width:13%; }
  .tab-achados td.id { width:6%; font-weight:700; }
  .vazio { color:var(--muted); font-style:italic; }
  .achado { border:1px solid var(--line); border-left:5px solid; border-radius:6px; padding:9pt 11pt; margin:9pt 0; }
  .achado h4, .achado p, .bloco-cat { break-inside:avoid; }
  .ref-arq { break-after:avoid; }
  .achado h4 { margin:0 0 5pt; font-size:10.5pt; }
  .achado .rot { font-weight:600; color:var(--ink2); }
  pre.trecho { font-family:Consolas, monospace; font-size:7.8pt; background:#0f172a; color:#e2e8f0; padding:6pt 8pt; border-radius:5px; white-space:pre-wrap; overflow-wrap:anywhere; margin:3pt 0 6pt; line-height:1.4; }
  .ref-arq { font-family:Consolas, monospace; font-size:8pt; color:var(--brand); font-weight:600; overflow-wrap:anywhere; }
  .rec { display:grid; grid-template-columns:34pt 1fr; gap:8pt; padding:7pt 0; border-bottom:1px solid var(--line); break-inside:avoid; }
  .rec .p { font-weight:800; font-size:11pt; color:#fff; border-radius:6px; text-align:center; padding:3pt 0; height:fit-content; }
  .issue { margin:10pt 0 14pt; }
  .issue .marca { font-family:Consolas, monospace; font-size:8.5pt; font-weight:700; color:var(--brand); margin:0; }
  .issue pre { font-family:Consolas, monospace; font-size:7.9pt; line-height:1.42; background:var(--fill); border:1px solid var(--line); border-radius:6px; padding:8pt 10pt; white-space:pre-wrap; overflow-wrap:anywhere; margin:3pt 0; }
  .nota { font-size:8.8pt; color:var(--muted); }
</style></head>
<body>

<section class="capa">
  <div>
    <div class="faixa">
      <div class="eyebrow">Auditoria de segurança · código e banco de produção</div>
      <h1>${esc(TITULO)}</h1>
      <div class="meta">Data: <b>${DATA}</b> · Revisão: <code>${esc(COMMIT)}</code></div>
      <div class="meta">Categorias: banco sem tranca, permissão no navegador, IDOR, chaves expostas e XSS</div>
    </div>
    <div class="bloco">
      <h3>Escopo auditado</h3>
      <ul>${ESCOPO.map((e) => `<li>${inline(e)}</li>`).join("")}</ul>
    </div>
    <div class="bloco">
      <h3>Resultado em uma linha</h3>
      <p style="margin:0">${total} achados verificados: ${ORDEM_SEV.filter((s) => contagem[s]).map((s) => `${contagem[s]} ${SEV[s].nome.toLowerCase()}${contagem[s] > 1 ? "s" : ""}`).join(", ")}. Nenhum crítico. ${PONTOS_FORTES.length} controles conferidos e corretos. Severidade máxima: ${chip(sevMax)}</p>
    </div>
  </div>
  <p class="nota">Toda afirmação deste relatório foi conferida no código ou por consulta somente leitura ao banco de produção. Nada foi alterado no banco durante a auditoria.</p>
</section>

<section class="secao">
  <h2>Stack detectada e nota metodológica</h2>
  <table class="stack">${STACK.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${inline(v)}</td></tr>`).join("")}</table>
  <h3>Como cada categoria foi mapeada para esta stack</h3>
  <table class="metodo">${CATEGORIAS.map((c) => `<tr><td>${c.id}. ${esc(c.nome)}</td><td>${inline(c.mapeamento)}</td></tr>`).join("")}</table>
  <h3>Escala de severidade</h3>
  <table class="escala">
    <tr><td style="width:16%">${chip("critica")}</td><td>Exploração remota simples que expõe ou altera dados de outras contas em massa, ou dá controle da plataforma.</td></tr>
    <tr><td>${chip("alta")}</td><td>Exploração simples com impacto real em outra conta ou custo direto para o negócio.</td></tr>
    <tr><td>${chip("media")}</td><td>Impacto real, mas com pré-condição que limita (conhecer um dado difícil de obter, papel específico).</td></tr>
    <tr><td>${chip("baixa")}</td><td>Impacto pequeno ou exige posição privilegiada (rede, máquina do desenvolvedor).</td></tr>
    <tr><td>${chip("info")}</td><td>Sem exploração conhecida; endurecimento e defesa em profundidade.</td></tr>
  </table>
</section>

<section class="secao">
  <h2>Resumo executivo</h2>
  <div class="kpis">
    ${ORDEM_SEV.map((s) => `<div class="kpi" style="border-top-color:${SEV[s].cor}"><div class="v">${contagem[s]}</div><div class="n">${SEV[s].nome}</div></div>`).join("")}
  </div>
  <div class="graficos">${rosca()}${barras()}</div>
  <h3>Leitura</h3>
  <p>O isolamento por dono está bem montado onde o projeto pensou nele: RLS em todas as tabelas, views com <code>security_invoker</code>, buckets privados e admin decidido no servidor. Os dois riscos altos ficam nas bordas desse desenho. Primeiro, o RLS protege cada linha, mas não a relação entre linhas, e a loja pública confia nessa relação (A1). Segundo, limites que custam dinheiro são contados em tabelas que o próprio usuário pode apagar (A3). Nenhum segredo foi encontrado no repositório nem no histórico, e não há ponto de XSS.</p>
  <table>
    <tr><th>Categoria</th><th style="width:16%">Achados</th><th style="width:20%">Mais grave</th><th style="width:16%">Pontos fortes</th></tr>
    ${CATEGORIAS.map((c) => {
      const da = ACHADOS.filter((a) => a.cat === c.id);
      const pior = ORDEM_SEV.find((s) => da.some((a) => a.sev === s));
      return `<tr><td>${c.id}. ${esc(c.nome)}</td><td>${da.length}</td><td>${pior ? chip(pior) : '<span class="vazio">nenhum</span>'}</td><td>${PONTOS_FORTES.filter((p) => p.cat === c.id).length}</td></tr>`;
    }).join("")}
  </table>
</section>

<section class="secao">
  <h2>Pontos fortes e pontos fracos</h2>
  <div class="caixa fraco" style="margin-bottom:12pt">
    <h3 style="margin-top:0">Pontos fracos (riscos centrais)</h3>
    <ul>${PONTOS_FRACOS.map((p) => `<li>${inline(p)}</li>`).join("")}</ul>
  </div>
  <div class="caixa forte">
    <h3 style="margin-top:0">Pontos fortes (verificados, com evidência)</h3>
    <ul class="fortes-lista">${PONTOS_FORTES.map((p) => `<li><span class="tag-cat">${CATEGORIAS[p.cat - 1].curto}</span>${inline(p.texto)}</li>`).join("")}</ul>
  </div>
</section>

<section class="secao">
  <h2>Achados por categoria</h2>
  ${CATEGORIAS.map((c) => {
    const da = ACHADOS.filter((a) => a.cat === c.id);
    return `<div class="bloco-cat"><h3>${c.id}. ${esc(c.nome)}</h3>
    ${da.length ? `<table class="tab-achados"><tr><th>Id</th><th>Severidade</th><th>Arquivo:linha</th><th>Descrição</th></tr>
      ${da.map((a) => `<tr><td class="id">${a.id}</td><td class="sev">${chip(a.sev)}</td><td class="ref">${a.arquivos.map((f) => esc(f.ref)).join("<br>")}</td><td>${inline(a.titulo)}</td></tr>`).join("")}
    </table>` : `<p class="vazio">Nenhum achado nesta categoria. O que foi conferido está em Pontos fortes.</p>`}</div>`;
  }).join("")}
</section>

<section class="secao">
  <h2>Detalhe dos achados</h2>
  ${ACHADOS.map((a) => `<div class="achado" style="border-left-color:${SEV[a.sev].cor}">
    <h4>${a.id} · ${inline(a.titulo)} ${chip(a.sev)}</h4>
    <p><span class="rot">Categoria:</span> ${CATEGORIAS[a.cat - 1].nome}</p>
    ${a.arquivos.map((f) => `<div class="ref-arq">${esc(f.ref)}</div><pre class="trecho">${esc(f.codigo)}</pre>`).join("")}
    <p><span class="rot">O que acontece:</span> ${inline(a.descricao)}</p>
    <p><span class="rot">Como explorar:</span> ${inline(a.exploracao)}</p>
    <p><span class="rot">Condição:</span> ${inline(a.condicao)} <span class="rot">Impacto:</span> ${inline(a.impacto)}</p>
  </div>`).join("")}
</section>

<section class="secao">
  <h2>Recomendações priorizadas</h2>
  ${RECOMENDACOES.map((r) => {
    const cor = { P1: SEV.alta.cor, P2: SEV.media.cor, P3: SEV.baixa.cor, P4: SEV.info.cor }[r.p];
    return `<div class="rec"><div class="p" style="background:${cor}">${r.p}</div><div><b>${esc(r.titulo)}</b><br>${inline(r.texto)}</div></div>`;
  }).join("")}
  <p class="nota" style="margin-top:10pt">O achado A7 não vira issue: a correção já está no PR HenriqueFauri/Marcon#61 e só falta aplicar a migration 0029 em produção.</p>
</section>

<section class="secao">
  <h2>Issues para o GitHub</h2>
  <p>Cada bloco abaixo é o texto completo de uma issue em Markdown. Copie o que está entre as marcas <code>--- ISSUE n ---</code> e <code>--- FIM ISSUE n ---</code>: a primeira linha (<code># ...</code>) é o título.</p>
  ${ISSUES.map((iss, i) => `<div class="issue">
    <p class="marca">--- ISSUE ${i + 1} ---</p>
    <pre>${esc(markdownDaIssue(iss))}</pre>
    <p class="marca">--- FIM ISSUE ${i + 1} ---</p>
  </div>`).join("")}
</section>

</body></html>`;

writeFileSync(SAIDA_HTML, html);

const chrome = CHROMES.find((c) => existsSync(c));
if (!chrome) throw new Error("Chrome não encontrado. Defina CHROME_PATH.");
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.goto("file:///" + SAIDA_HTML.replace(/\\/g, "/"), { waitUntil: "load" });
const cabecalho = `<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;font-size:7.5pt;color:#64748b;padding:0 20mm;display:flex;justify-content:space-between;">
  <span>${esc(TITULO)}</span><span>${DATA}</span></div>`;
const rodape = `<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;font-size:7.5pt;color:#64748b;padding:0 20mm;display:flex;justify-content:space-between;">
  <span>Confidencial · uso interno</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
await page.pdf({
  path: SAIDA_PDF,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: cabecalho,
  footerTemplate: rodape,
  margin: { top: "22mm", bottom: "20mm", left: "20mm", right: "20mm" },
});
await browser.close();
console.log("PDF gerado:", SAIDA_PDF);

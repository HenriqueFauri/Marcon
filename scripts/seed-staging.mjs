// Conta de teste do Staging com dados de exemplo: produtos (com nomes parecidos e com variações),
// fotos, anúncios, vendas, gastos e uma vitrine no ar. Rodar de novo não duplica.
// Uso: node scripts/seed-staging.mjs            (lê .env.staging)
// Só roda no banco de Staging: confere o ref do projeto antes de qualquer coisa.
// O e-mail e a senha da conta de teste ficam no .env.staging (STAGING_TESTE_EMAIL e
// STAGING_TESTE_SENHA); se não existirem, o script cria e grava lá. Nunca vão para o git.
import { appendFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { sslDoBanco } from "./db-ssl.mjs";

const REF_STAGING = "odgvhqwqyxtnaxgqiynb";

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, "..", ".env.staging");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
if (ref !== REF_STAGING) {
  console.error(`Este script só roda no Staging (${REF_STAGING}). O .env.staging aponta para ${ref}.`);
  process.exit(1);
}
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_DB_PASSWORD) {
  console.error("Faltam SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_DB_PASSWORD em .env.staging");
  process.exit(1);
}

let email = env.STAGING_TESTE_EMAIL;
let senha = env.STAGING_TESTE_SENHA;
if (!email || !senha) {
  email = "teste.staging@usemarcon.com";
  senha = randomBytes(12).toString("base64url");
  appendFileSync(envPath, `\n# conta de teste do Staging (criada por scripts/seed-staging.mjs)\nSTAGING_TESTE_EMAIL=${email}\nSTAGING_TESTE_SENHA=${senha}\n`);
  console.log("Credenciais da conta de teste gravadas em .env.staging");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1) a conta
let uid;
{
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: "Conta de Teste", nome_negocio: "Loja de Teste" },
  });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  uid = data?.user?.id;
}

const db = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: sslDoBanco(root, env),
});
await db.connect();

if (!uid) {
  const r = await db.query("select id from auth.users where lower(email) = lower($1)", [email]);
  uid = r.rows[0]?.id;
  if (!uid) throw new Error("Não consegui criar nem achar a conta de teste.");
  // a senha do .env.staging é a que vale
  await admin.auth.admin.updateUserById(uid, { password: senha, email_confirm: true });
}
console.log(`Conta de teste: ${email} (${uid})`);

// 2) os dados de exemplo de sempre (os mesmos da conta demo)
const demo = readFileSync(path.join(root, "seed-demo.sql"), "utf8").replace("COLOQUE_O_EMAIL_DA_CONTA_DEMO", email);
await db.query(demo);
console.log("Produtos, vendas e gastos de exemplo: ok");

// 3) casos que as telas precisam aguentar: nomes longos e parecidos, e produto com variações
await db.query(
  `do $$
   declare v_uid uuid := '${uid}'; v_prod uuid;
   begin
     perform set_config('request.jwt.claim.sub', v_uid::text, true);
     perform importar_produtos(jsonb_build_array(
       jsonb_build_object('nome', 'Torneira Gourmet Flexível Preta com Bica Alta e Filtro', 'categoria', 'Casa', 'custo', 22, 'preco_varejo', 49, 'estoque', 2),
       jsonb_build_object('nome', 'Torneira Gourmet Flexível Cromada com Bica Alta e Filtro', 'categoria', 'Casa', 'custo', 22, 'preco_varejo', 49, 'estoque', 1),
       jsonb_build_object('nome', 'Jogo de Panelas 5 Peças Antiaderente com Tampa de Vidro', 'categoria', 'Casa', 'custo', 180, 'preco_varejo', 320, 'estoque', 1),
       jsonb_build_object('nome', 'Suporte de celular para Moto com Carregador USB', 'categoria', 'Acessórios', 'custo', 14, 'preco_varejo', 35, 'estoque', 4)
     ));
     if not exists (select 1 from produtos where owner_id = v_uid and nome = 'Relógio Tomi') then
       insert into produtos (owner_id, nome, custo, preco_varejo, tem_variacoes, estoque_atual)
         values (v_uid, 'Relógio Tomi', 60, 119, true, 0) returning id into v_prod;
       insert into produto_variacoes (owner_id, produto_id, nome_combinacao, custo, preco_venda, estoque) values
         (v_uid, v_prod, 'Preto', 60, 119, 1),
         (v_uid, v_prod, 'Prata', 60, 129, 1);
     end if;
     insert into canais_venda (owner_id, nome) values (v_uid, 'Marketplace'), (v_uid, 'Instagram') on conflict (owner_id, nome) do nothing;
     insert into vitrines (owner_id, slug, whatsapp, ativa) values (v_uid, 'loja-de-teste', '5511999990000', true) on conflict (owner_id) do nothing;
     update produtos set na_vitrine = true where owner_id = v_uid and nome <> 'Garrafa Térmica 500ml';
     update produtos set destaque = true where owner_id = v_uid and nome in ('Fone Bluetooth KZ', 'Relógio Tomi');
   end $$;`,
);
console.log("Nomes longos, variações, canais e vitrine: ok");

// 4) fotos de mentira (um quadrado colorido com a letra) e um anúncio em alguns produtos
const CORES = ["#c2410c", "#0f766e", "#1d4ed8", "#7c3aed", "#be185d"];
async function imagem(letra, cor, n) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="${cor}"/><text x="400" y="430" font-family="Arial" font-size="300" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${letra}${n}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

const comFoto = ["Fone Bluetooth KZ", "Torneira Gourmet Flexível Preta com Bica Alta e Filtro", "Relógio Tomi", "Smartwatch D20", "Caixa de Som Bluetooth"];
const { rows: produtos } = await db.query("select id, nome from produtos where owner_id = $1 and nome = any($2)", [uid, comFoto]);
const { rows: canal } = await db.query("select id from canais_venda where owner_id = $1 and nome = 'Marketplace'", [uid]);

for (const [i, p] of produtos.entries()) {
  const { rows: ja } = await db.query("select 1 from produto_fotos where produto_id = $1 limit 1", [p.id]);
  if (!ja.length) {
    for (let n = 1; n <= 3; n++) {
      const caminho = `${uid}/${p.id}/seed-${n}.jpg`;
      const { error } = await admin.storage
        .from("produto-fotos")
        .upload(caminho, await imagem(p.nome.charAt(0), CORES[(i + n) % CORES.length], n), { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await db.query("insert into produto_fotos (owner_id, produto_id, path, ordem) values ($1, $2, $3, $4)", [uid, p.id, caminho, n - 1]);
    }
  }
  const { rows: temAnuncio } = await db.query("select 1 from produto_anuncios where produto_id = $1 limit 1", [p.id]);
  if (!temAnuncio.length && canal[0]) {
    await db.query("insert into produto_anuncios (owner_id, produto_id, canal_id, titulo, descricao) values ($1, $2, $3, $4, $5)", [
      uid,
      p.id,
      canal[0].id,
      `${p.nome} novo, pronta entrega`,
      `${p.nome}, na caixa, com garantia de 30 dias.\n\nRetirada no local ou entrega combinada. Chama no WhatsApp.`,
    ]);
  }
}
console.log(`Fotos e anúncios em ${produtos.length} produtos: ok`);

await db.end();
console.log("\nPronto. Entre no Staging com o e-mail e a senha que estão no .env.staging.");

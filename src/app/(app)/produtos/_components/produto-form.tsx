"use client";

import { RotuloAcao } from "@/components/rotulo-acao";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Fornecedor, ProdutoComEstoque } from "@/types/domain";
import type { ActionResult } from "@/lib/action";
import { formatBRL } from "@/lib/format";
import { lerNumero } from "@/lib/numero";
import { Margem } from "@/components/margem";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toaster";
import { BotaoLerCodigo } from "@/components/leitor-codigo";
import { createClient } from "@/lib/supabase/client";
import { comprimirImagem, TAMANHO_ENVIO_MAX, TAMANHO_ORIGINAL_MAX } from "@/lib/imagem";
import { registrarFoto } from "../actions";
import { AutoTextarea } from "@/components/auto-textarea";
import { Grupo, LinhaLink, Segmentado } from "@/components/ajustes";
import { Card, Field, btnGhost, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
import { IconBox, IconChevronDown, IconPlus, IconTrash } from "@/components/icons";

const UNIDADES = [
  ["un", "Unidade (un)"],
  ["kg", "Quilo (kg)"],
  ["g", "Grama (g)"],
  ["l", "Litro (l)"],
  ["ml", "Mililitro (ml)"],
  ["m", "Metro (m)"],
  ["cx", "Caixa (cx)"],
  ["pct", "Pacote (pct)"],
  ["par", "Par"],
] as const;

function paraNumero(v: string) {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
}

// categoria: escolhida da lista; "Nova categoria" abre um campo para digitar o nome
const NOVA_CATEGORIA = "__nova";

function CategoriaCampo({ categorias, inicial }: { categorias: string[]; inicial: string }) {
  const opcoes = inicial && !categorias.includes(inicial) ? [inicial, ...categorias] : categorias;
  const [escolha, setEscolha] = useState(inicial);
  const [nova, setNova] = useState("");
  const nome = escolha === NOVA_CATEGORIA ? nova.trim() : escolha;

  return (
    <div className="flex flex-col gap-2">
      <Field label="Categoria">
        <select value={escolha} onChange={(e) => setEscolha(e.target.value)} className={inputClass}>
          <option value="">Sem categoria</option>
          {opcoes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NOVA_CATEGORIA}>+ Nova categoria...</option>
        </select>
      </Field>
      {escolha === NOVA_CATEGORIA && (
        <input
          aria-label="Nome da nova categoria"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoFocus
          maxLength={100}
          className={inputClass}
          placeholder="Ex: Eletrônicos"
        />
      )}
      <input type="hidden" name="categoria" value={nome} />
    </div>
  );
}

// Uma variação do cadastro, com a margem ao vivo (custo e preço em branco valem os do produto).
function LinhaVariacaoNova({
  indice,
  podeRemover,
  onRemover,
  custoPadrao,
  precoPadrao,
}: {
  indice: number;
  podeRemover: boolean;
  onRemover: () => void;
  custoPadrao: number | null;
  precoPadrao: number | null;
}) {
  const [custo, setCusto] = useState("");
  const [preco, setPreco] = useState("");
  const custoEfetivo = lerNumero(custo) ?? custoPadrao;
  const precoEfetivo = lerNumero(preco) ?? precoPadrao;

  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink-2">Variação {indice + 1}</span>
        {podeRemover && (
          <button
            type="button"
            onClick={onRemover}
            aria-label={`Remover variação ${indice + 1}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-danger-tint hover:text-danger"
          >
            <IconTrash width={16} height={16} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Nome *" className="col-span-2 sm:col-span-4">
          <input name="var_nome" required className={inputClass} placeholder="Ex: Azul / M" />
        </Field>
        <Field label="Estoque">
          <input name="var_estoque" type="number" inputMode="numeric" min="0" step="1" defaultValue={0} className={inputClass} />
        </Field>
        <Field label="Custo (R$)">
          <input
            name="var_custo"
            inputMode="decimal"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
            className={inputClass}
            placeholder={custoPadrao !== null ? formatBRL(custoPadrao) : "Do produto"}
          />
        </Field>
        <Field label="Preço (R$)">
          <input
            name="var_preco"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            className={inputClass}
            placeholder={precoPadrao !== null ? formatBRL(precoPadrao) : "Do produto"}
          />
        </Field>
        <Field label="SKU">
          <input name="var_sku" className={inputClass} placeholder="Opcional" />
        </Field>
        <div className="col-span-2 sm:col-span-4">
          <Margem custo={custoEfetivo} preco={precoEfetivo} />
        </div>
      </div>
    </div>
  );
}

// Variações no cadastro: cada linha vira uma variação do produto (com estoque inicial).
function VariacoesNovas({ custoPadrao, precoPadrao }: { custoPadrao: number | null; precoPadrao: number | null }) {
  const [linhas, setLinhas] = useState([0]);
  const [proximo, setProximo] = useState(1);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Uma linha para cada combinação (ex: &quot;Azul / M&quot;). Custo e preço em branco usam os do produto.
      </p>
      {linhas.map((id, i) => (
        <LinhaVariacaoNova
          key={id}
          indice={i}
          podeRemover={linhas.length > 1}
          onRemover={() => setLinhas((l) => l.filter((x) => x !== id))}
          custoPadrao={custoPadrao}
          precoPadrao={precoPadrao}
        />
      ))}
      <div>
        <button
          type="button"
          onClick={() => {
            setLinhas((l) => [...l, proximo]);
            setProximo((n) => n + 1);
          }}
          className={btnSecondary}
        >
          <IconPlus width={16} height={16} /> Adicionar outra variação
        </button>
      </div>
    </div>
  );
}

type OrigemEstoque = "ja_era_meu" | "comprei";

// De onde veio o estoque inicial: "Já era meu" (padrão, não sai do caixa) ou "Comprei agora" (sai do caixa).
// Fica junto do estoque, só quando há estoque a lançar.
function OrigemDoEstoque({ valor, onMudar }: { valor: OrigemEstoque; onMudar: (v: OrigemEstoque) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Segmentado
        name="estoque_origem"
        rotulo="De onde veio esse estoque"
        valor={valor}
        onMudar={onMudar}
        opcoes={[
          { valor: "ja_era_meu", label: "Já era meu" },
          { valor: "comprei", label: "Comprei agora" },
        ]}
      />
      <p className="text-xs text-ink-muted">
        {valor === "comprei"
          ? "Entra como compra e sai do caixa hoje."
          : "Você já tinha pago antes. O estoque entra e nada sai do caixa."}
      </p>
    </div>
  );
}

function valorInicial(v: number | null | undefined) {
  return v == null ? "" : Number(v).toFixed(2);
}

const FORMATOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

// mesmo cuidado do envio de fotos do anúncio: sem espaço nem acento na chave do storage
function nomeSeguroFoto(nome: string) {
  const ext = nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "jpg";
  const base = nome
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .slice(0, 40);
  return `${base || "foto"}.${ext}`;
}

// A foto escolhida no cadastro sobe depois que o produto existe (o caminho no storage leva o id do produto).
// Se falhar, o produto já está salvo: avisa e a foto se adiciona depois no anúncio.
async function enviarFotoDeCapa(produtoId: string, original: File, toast: ReturnType<typeof useToast>) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("não autenticado");
    const arquivo = await comprimirImagem(original);
    if (!FORMATOS_FOTO.includes(arquivo.type) || arquivo.size > TAMANHO_ENVIO_MAX) {
      toast.error("O produto foi salvo, mas a foto não dá para enviar. Use JPEG, PNG ou WebP e adicione depois.");
      return;
    }
    const path = `${user.id}/${produtoId}/${Date.now()}-${nomeSeguroFoto(arquivo.name)}`;
    const { error } = await supabase.storage.from("produto-fotos").upload(path, arquivo, { contentType: arquivo.type });
    if (error) throw error;
    const r = await registrarFoto(produtoId, path, 0, null);
    if (!r.ok) {
      await supabase.storage.from("produto-fotos").remove([path]);
      throw new Error(r.error);
    }
  } catch {
    toast.error("O produto foi salvo, mas a foto não subiu. Adicione de novo pelo anúncio.");
  }
}

// Foto do produto no topo do cadastro: um toque abre a câmera ou a galeria.
function FotoDeCapa({ foto, onChange }: { foto: File | null; onChange: (f: File | null) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const urlAtual = useRef<string | null>(null);

  function trocar(arquivo: File | null) {
    if (urlAtual.current) URL.revokeObjectURL(urlAtual.current);
    urlAtual.current = arquivo ? URL.createObjectURL(arquivo) : null;
    setUrl(urlAtual.current);
    onChange(arquivo);
  }

  useEffect(
    () => () => {
      if (urlAtual.current) URL.revokeObjectURL(urlAtual.current);
    },
    [],
  );

  return (
    <div className="flex items-center gap-3">
      <label className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-fill text-ink-muted transition hover:bg-fill-strong focus-within:ring-4 focus-within:ring-brand/40">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Foto do produto" className="h-full w-full object-cover" />
        ) : (
          <IconBox width={28} height={28} />
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Foto do produto"
          onChange={(e) => {
            const arquivo = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!arquivo) return;
            if (arquivo.size > TAMANHO_ORIGINAL_MAX) {
              toast.error("Essa foto passa de 30 MB. Escolha outra.");
              return;
            }
            trocar(arquivo);
          }}
        />
      </label>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-ink">{foto ? "Foto escolhida" : "Foto do produto"}</p>
        {foto ? (
          <button type="button" onClick={() => trocar(null)} className="text-ink-muted underline underline-offset-2">
            Tirar foto
          </button>
        ) : (
          <p className="text-ink-muted">Toque no quadrado para tirar ou escolher. Dá para mais fotos depois.</p>
        )}
      </div>
    </div>
  );
}

export function ProdutoForm({
  fornecedores,
  categorias,
  produto,
  modelo,
  onSave,
}: {
  fornecedores: Fornecedor[];
  categorias: string[];
  produto?: ProdutoComEstoque;
  // "Duplicar": começa o cadastro com os dados de outro produto (sem SKU, código de barras nem variações)
  modelo?: ProdutoComEstoque;
  onSave: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const editando = !!produto;
  const base = produto ?? modelo;
  const { isPending, run } = useAction();
  const [erro, setErro] = useState<string | null>(null);
  const [temVariacoes, setTemVariacoes] = useState(produto?.tem_variacoes ?? false);
  const [origemEstoque, setOrigemEstoque] = useState<OrigemEstoque>("ja_era_meu");
  const [estoque, setEstoque] = useState("0");
  const estoqueN = Math.trunc(Number(estoque) || 0);
  const [fornecedorId, setFornecedorId] = useState(base?.fornecedor_id ?? "");
  const [custo, setCusto] = useState(valorInicial(base?.custo));
  const [preco, setPreco] = useState(valorInicial(base?.preco_varejo));
  const [codigoBarras, setCodigoBarras] = useState(produto?.codigo_barras ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [mais, setMais] = useState(false);
  // com variações marcadas a seção fica aberta: os campos obrigatórios delas não podem ficar escondidos
  const aberto = mais || temVariacoes;
  const toast = useToast();
  const resultadoId = useRef<string | null>(null);

  const custoN = paraNumero(custo);
  const precoN = paraNumero(preco);
  const lucroUnit = custoN !== null && precoN !== null ? precoN - custoN : null;
  const margem = lucroUnit !== null && precoN ? (lucroUnit / precoN) * 100 : null;
  const markup = lucroUnit !== null && custoN ? (lucroUnit / custoN) * 100 : null;

  return (
    <form
      // onSubmit (e não action): o React limparia os campos ao enviar, e um erro faria a pessoa digitar tudo de novo
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        run(
          async () => {
            const resultado = await onSave(formData);
            resultadoId.current = resultado.ok ? (resultado.id ?? null) : null;
            if (resultado.ok && foto && resultado.id) await enviarFotoDeCapa(resultado.id, foto, toast);
            return resultado;
          },
          {
            onError: setErro,
            onSuccess: () => {
              setErro(null);
              // produto novo abre a página dele (dali se adiciona foto, anúncio e vitrine)
              const id = produto?.id ?? resultadoId.current;
              router.push(id ? `/produtos/${id}` : "/produtos");
            },
          },
        );
      }}
      className="flex flex-col gap-4"
    >
      {/* o essencial para cadastrar em segundos: nome, custo, preço, estoque e foto. O resto fica em "Mais detalhes" */}
      <Card title={editando ? "Produto" : "Cadastro rápido"}>
        <div className="flex flex-col gap-4">
          {!editando && <FotoDeCapa foto={foto} onChange={setFoto} />}

          <Field label="Nome do produto *">
            <AutoTextarea
              umaLinha
              name="nome"
              required
              autoFocus={!editando}
              defaultValue={modelo ? `${modelo.nome} (cópia)` : produto?.nome}
              className={inputClass}
              placeholder="Ex: Smartwatch Pro X"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field
              label={editando ? "Custo médio (R$)" : "Preço de custo (R$) *"}
              hint={editando ? "Atualizado a cada entrada de estoque." : undefined}
            >
              <input
                name="custo"
                inputMode="decimal"
                required
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                className={inputClass}
                placeholder="0,00"
              />
            </Field>
            <Field label="Preço de venda (R$) *">
              <input
                name="preco_varejo"
                inputMode="decimal"
                required
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className={inputClass}
                placeholder="0,00"
              />
            </Field>
            {!editando && (
              <Field
                label="Estoque"
                hint={temVariacoes ? "Controlado por variação." : undefined}
                className="col-span-2 sm:col-span-1"
              >
                <input
                  name="estoque_inicial"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={estoque}
                  onChange={(e) => setEstoque(e.target.value)}
                  disabled={temVariacoes}
                  className={inputClass}
                />
              </Field>
            )}
          </div>

          {!editando && !temVariacoes && estoqueN > 0 && <OrigemDoEstoque valor={origemEstoque} onMudar={setOrigemEstoque} />}

          {lucroUnit !== null && (
            <p className={`text-sm ${lucroUnit >= 0 ? "text-ink-muted" : "text-danger"}`}>
              Lucro de <strong className={lucroUnit >= 0 ? "text-positive" : "text-danger"}>{formatBRL(lucroUnit)}</strong>{" "}
              por unidade
              {margem !== null && ` · margem de ${margem.toFixed(1)}%`}
              {markup !== null && ` · markup de ${markup.toFixed(0)}%`}
            </p>
          )}
        </div>
      </Card>

      <button
        type="button"
        onClick={() => setMais((v) => !v)}
        aria-expanded={aberto}
        aria-controls="mais-detalhes"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-fill px-4 py-2.5 text-left text-[15px] font-medium text-ink transition hover:bg-fill-strong"
      >
        <span>
          Mais detalhes
          <span className="block text-xs font-normal text-ink-muted">
            Categoria, marca, código de barras, atacado, fornecedor, alerta e variações
          </span>
        </span>
        <IconChevronDown width={18} height={18} className={`shrink-0 text-ink-muted transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {/* escondido (e não desmontado): os campos continuam no envio mesmo com a seção fechada */}
      <div id="mais-detalhes" hidden={!aberto} className="flex flex-col gap-4">
        <Card title="Informações">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CategoriaCampo categorias={categorias} inicial={base?.categorias?.nome ?? ""} />
              <Field label="Marca">
                <input name="marca" defaultValue={base?.marca ?? ""} className={inputClass} placeholder="Opcional" />
              </Field>
              <Field label="SKU / código">
                <input name="sku" defaultValue={produto?.sku ?? ""} className={inputClass} placeholder="Opcional" />
              </Field>
              <Field label="Código de barras" hint="Digite, use um leitor USB ou Bluetooth (ele digita sozinho) ou aponte a câmera.">
                <div className="flex gap-2">
                  <input
                    name="codigo_barras"
                    inputMode="numeric"
                    value={codigoBarras}
                    onChange={(e) => setCodigoBarras(e.target.value)}
                    className={inputClass}
                    placeholder="Opcional"
                  />
                  <BotaoLerCodigo rotulo="Ler" onCodigo={setCodigoBarras} />
                </div>
              </Field>
            </div>

            <Field label="Descrição">
              <AutoTextarea
                name="descricao"
                rows={3}
                defaultValue={base?.descricao ?? ""}
                className={inputClass}
                placeholder="Estado, medidas, o que acompanha. A IA usa isso no anúncio"
              />
            </Field>
          </div>
        </Card>

        <Card title="Atacado, estoque e fornecedor">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Preço de atacado (R$)">
                <input
                  name="preco_atacado"
                  inputMode="decimal"
                  defaultValue={valorInicial(base?.preco_atacado)}
                  className={inputClass}
                  placeholder="Opcional"
                />
              </Field>
              <Field label="Avisar quando tiver até" hint="Deixe vazio para não avisar.">
                <input
                  name="alerta_estoque_baixo"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  defaultValue={base?.alerta_estoque_baixo ?? ""}
                  className={inputClass}
                  placeholder="Ex: 3"
                />
              </Field>
              <Field label="Unidade">
                <select name="unidade_medida" defaultValue={base?.unidade_medida ?? "un"} className={inputClass}>
                  {UNIDADES.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {!editando && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas/40 p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  name="tem_variacoes"
                  value="true"
                  checked={temVariacoes}
                  onChange={(e) => setTemVariacoes(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  Este produto tem variações (tamanho, cor...)
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    O estoque passa a ser controlado por variação. Preencha as variações logo abaixo.
                  </span>
                </span>
              </label>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Field label="Fornecedor">
                  <select
                    value={fornecedorId}
                    onChange={(e) => setFornecedorId(e.target.value)}
                    name="fornecedor_id"
                    className={inputClass}
                  >
                    <option value="">Sem cadastro / digitar</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                {!fornecedorId && (
                  <input
                    name="fornecedor_nome"
                    aria-label="Nome do fornecedor"
                    defaultValue={base?.fornecedor_id ? "" : (base?.fornecedor_nome ?? "")}
                    className={inputClass}
                    placeholder="Nome do fornecedor (opcional)"
                  />
                )}
              </div>
              {editando && (
                <Field label="Situação" hint="Produtos inativos não aparecem na tela de venda.">
                  <select name="status" defaultValue={produto.status} className={inputClass}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </Field>
              )}
            </div>
          </div>
        </Card>

        {!editando && temVariacoes && (
          <Card title="Variações">
            <div className="flex flex-col gap-4">
              <VariacoesNovas custoPadrao={custoN} precoPadrao={precoN} />
              {/* vale para o estoque de todas as variações */}
              <OrigemDoEstoque valor={origemEstoque} onMudar={setOrigemEstoque} />
            </div>
          </Card>
        )}
      </div>

      {/* tudo que é da vitrine fica na Vitrine: aqui só o estado e o caminho (no produto novo ainda não há o que mostrar) */}
      {produto && (
        <Grupo semPadding rodape="Salve as alterações antes de abrir.">
          <LinhaLink
            href={`/vitrine/produtos/${produto.id}`}
            rotulo="Na vitrine"
            detalhe={!produto.na_vitrine ? "Não" : produto.destaque ? "Sim, em destaque" : "Sim"}
          />
        </Grupo>
      )}

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className={btnGhost}>
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className={btnPrimary}>
          <RotuloAcao pendente={isPending} ocupado="Salvando...">{editando ? "Salvar alterações" : "Cadastrar produto"}</RotuloAcao>
        </button>
      </div>
    </form>
  );
}

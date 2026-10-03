import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  IconBox,
  IconCheck,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconSparkles,
  IconWallet,
} from "@/components/icons";
import { formatBRL } from "@/lib/format";
import { DIAS_DE_TESTE, PLANO_GRATIS, PLANOS } from "@/lib/planos";

// Uma landing, três portas de entrada: a geral (raiz do site) e uma para cada
// canal, para mandar o link certo em cada grupo. Muda só o começo da conversa;
// o resto da página é o mesmo.
export type Publico = "geral" | "marketplace" | "whatsapp";

const PUBLICOS: Record<
  Publico,
  { titulo: string; descricao: string; selo: string; manchete: [string, string]; apoio: string; canal: string }
> = {
  geral: {
    titulo: "Marcon | O app de quem vende no Marketplace e no WhatsApp",
    descricao:
      "Estoque, custo, lucro e anúncios num lugar só. Pra quem vende no Marketplace, no WhatsApp e no Instagram e quer saber se está valendo a pena.",
    selo: "Pra quem vende no Marketplace e no WhatsApp",
    manchete: ["Você vende.", "O Marcon faz as contas."],
    apoio:
      "Estoque, custo, lucro e anúncios num app só. Pra quem vende no Marketplace, no WhatsApp e no Instagram e quer saber, de verdade, se está valendo a pena.",
    canal: "Marketplace",
  },
  marketplace: {
    titulo: "Marcon | Pra quem vende no Marketplace",
    descricao:
      "Saiba se tem o produto, quanto custou, até onde dá pra negociar e quanto vai lucrar antes de fechar. O app de quem revende no Facebook Marketplace.",
    selo: "Pra quem vende no Marketplace",
    manchete: ["“Ainda tá disponível?”", "Você já sabe a resposta."],
    apoio:
      "Estoque, custo e margem de cada produto. Você sabe se tem, até onde dá pra baixar o preço e quanto lucrou antes mesmo de fechar.",
    canal: "Marketplace",
  },
  whatsapp: {
    titulo: "Marcon | Pra quem vende no WhatsApp",
    descricao:
      "Registre a venda, gere o recibo pra mandar no WhatsApp e saiba o lucro de cada uma. O app de quem vende no Marketplace e no WhatsApp.",
    selo: "Pra quem vende no WhatsApp",
    manchete: ["Fechou no Zap?", "Registra em segundos."],
    apoio:
      "Anota a venda, gera o recibo com link pra mandar no WhatsApp e mostra o lucro de cada uma. Sem caderninho e sem planilha.",
    canal: "WhatsApp",
  },
};

export function metadataDo(publico: Publico): Metadata {
  const p = PUBLICOS[publico];
  return { title: { absolute: p.titulo }, description: p.descricao };
}

const SECOES = [
  { id: "estoque", rotulo: "Estoque" },
  { id: "vendas", rotulo: "Vendas" },
  { id: "anuncios", rotulo: "Anúncios" },
  { id: "lucro", rotulo: "Lucro" },
  { id: "planos", rotulo: "Planos" },
];

const PERGUNTAS = [
  {
    p: "Serve pra quem vende só no WhatsApp ou no Instagram?",
    r: "Serve. O Marcon é pra quem vende no Marketplace e no WhatsApp, e também serve pra quem vende no Instagram ou na OLX. Você cadastra seus canais e vê de onde veio cada venda.",
  },
  {
    p: "Já uso outro sistema. Tenho que começar do zero?",
    r: "Não. Você traz seus produtos, suas vendas e seu caixa do sistema antigo e confere tudo numa prévia antes de importar.",
  },
  {
    p: "O Marcon publica o anúncio por mim?",
    r: "Não. O Facebook e o WhatsApp não deixam nenhum app publicar por você. O Marcon deixa fotos, título e descrição prontos, e você só copia, cola e publica.",
  },
  {
    p: "Quanto custa?",
    r: `Os primeiros ${DIAS_DE_TESTE} dias são grátis, com tudo liberado e sem cartão. Depois, o plano Marcon sai por ${formatBRL(PLANOS.marcon.valor)} por mês, sem fidelidade. Se não quiser assinar, sua conta continua no plano grátis, com limite de vendas e produtos.`,
  },
  {
    p: "Precisa instalar alguma coisa?",
    r: "Não. O Marcon abre no navegador do celular ou do computador. Se quiser, é só adicionar à tela de início: ele vira um app, com ícone e notificações.",
  },
  {
    p: "E se o cliente pagar parcelado?",
    r: "Na hora da venda você escolhe à vista ou a prazo e parcelado. As parcelas vão sozinhas pra Contas a receber e você marca como pago quando o cliente acertar.",
  },
  {
    p: "Meus dados ficam seguros?",
    r: "Cada conta só enxerga os próprios dados, com regras de acesso no próprio banco de dados. Excluir um produto ou cliente nunca apaga o histórico financeiro.",
  },
];

function Icone({ tamanho, brilho = false }: { tamanho: number; brilho?: boolean }) {
  const id = brilho ? "grande" : "pequeno";
  return (
    <svg viewBox="0 0 512 512" width={tamanho} height={tamanho} role="img" aria-label="Marcon" className="shrink-0">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e5794a" />
          <stop offset=".55" stopColor="#d45f30" />
          <stop offset="1" stopColor="#d45f30" />
        </linearGradient>
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={brilho ? `url(#g-${id})` : "#d45f30"} />
      {brilho && <rect x="3" y="3" width="506" height="506" rx="113" fill={`url(#b-${id})`} />}
      <path
        transform="translate(127.9 355.4)"
        fill="#fff"
        d="M20.72 0V-198.8H77.5L128.13 -54.04L178.64 -198.8H235.42V0H192.86V-128.8L146.1 -0.5H109.87L63.28 -128.8V0Z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Moldura dos mockups
// ---------------------------------------------------------------------------

// As telas copiam o app de verdade, mas são figuras: ficam levemente giradas,
// flutuando, e não respondem a toque nem a seleção.
function Cena({ giro, className = "", children }: { giro: number; className?: string; children: ReactNode }) {
  return (
    <div aria-hidden="true" className={`flutuar pointer-events-none relative select-none ${className}`}>
      <div style={{ transform: `rotate(${giro}deg)` }}>{children}</div>
    </div>
  );
}

function Tela({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[34px] bg-canvas p-3.5 text-left shadow-[0_40px_70px_-30px_rgba(0,0,0,0.35),0_12px_24px_-16px_rgba(0,0,0,0.2),inset_0_0_0_0.5px_var(--line)]">
      {children}
    </div>
  );
}

// Notificação no formato da que o app manda (título e linha de dados).
function Notificacao({ titulo, corpo, quando = "agora" }: { titulo: string; corpo: string; quando?: string }) {
  return (
    <div className="hairline glass flex items-start gap-3 rounded-[22px] px-3.5 py-3 text-left shadow-[0_24px_40px_-18px_rgba(0,0,0,0.35)]">
      <Icone tamanho={36} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-ink">{titulo}</span>
          <span className="shrink-0 text-[12px] text-ink-muted">{quando}</span>
        </span>
        <span className="text-[13px] leading-snug text-ink-2">{corpo}</span>
      </span>
    </div>
  );
}

function Flutuante({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`flutuar flutuar-atrasado pointer-events-none relative z-10 -mt-3 w-[min(290px,92%)] select-none sm:absolute sm:mt-0 ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pedaços das telas, iguais aos do app
// ---------------------------------------------------------------------------

function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="px-1.5 pt-1.5">
      <p className="text-[24px] font-bold leading-tight tracking-tight text-ink">{titulo}</p>
      {sub && <p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function Stat({ rotulo, valor, tom = "text-ink", dica }: { rotulo: string; valor: string; tom?: string; dica?: string }) {
  return (
    <div className="hairline rounded-3xl bg-surface p-4">
      <p className="text-[12px] font-medium text-ink-muted">{rotulo}</p>
      <p className={`mt-1 truncate text-[20px] font-bold tracking-tight tabular-nums ${tom}`}>{valor}</p>
      {dica && <p className="mt-0.5 truncate text-[12px] text-ink-muted">{dica}</p>}
    </div>
  );
}

function Cartao({ titulo, acao, children }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className="hairline rounded-3xl bg-surface p-4">
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <p className="text-[16px] font-semibold tracking-tight text-ink">{titulo}</p>}
          {acao}
        </div>
      )}
      {children}
    </div>
  );
}

const C_EXTERNO = 263.9; // 2π·42
const C_INTERNO = 157.1; // 2π·25

function Aneis({ vendas, lucro }: { vendas: number; lucro: number }) {
  return (
    <svg viewBox="0 0 100 100" width="96" height="96" className="shrink-0">
      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="13" className="stroke-brand-tint" />
      <circle
        cx="50" cy="50" r="42" fill="none" strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${vendas * C_EXTERNO} ${C_EXTERNO}`}
        transform="rotate(-90 50 50)" className="stroke-brand"
      />
      <circle cx="50" cy="50" r="25" fill="none" strokeWidth="13" className="stroke-ring-track" />
      <circle
        cx="50" cy="50" r="25" fill="none" strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${lucro * C_INTERNO} ${C_INTERNO}`}
        transform="rotate(-90 50 50)" className="stroke-tile-positive"
      />
    </svg>
  );
}

function PainelMetas() {
  return (
    <div className="hairline flex flex-col gap-4 rounded-3xl bg-surface p-[18px]">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink-muted">Meta da semana</p>
        <div className="grid grid-cols-3 rounded-full bg-fill p-[3px] text-center text-[13px]">
          <span className="py-1.5 font-medium text-ink-2">Hoje</span>
          <span className="rounded-full bg-surface py-1.5 font-semibold text-ink shadow-sm">Semana</span>
          <span className="py-1.5 font-medium text-ink-2">Mês</span>
        </div>
      </div>
      <div className="flex items-center gap-[18px]">
        <Aneis vendas={0.83} lucro={0.84} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold text-brand-text">Vendas · 83%</span>
            <span className="truncate text-[22px] font-bold leading-[1.1] tracking-tight tabular-nums text-ink">
              R$ 1.240,00<span className="text-[13px] font-normal text-ink-muted"> / R$ 1.500</span>
            </span>
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold text-tile-positive">Lucro · 84%</span>
            <span className="truncate text-[22px] font-bold leading-[1.1] tracking-tight tabular-nums text-ink">
              R$ 506,20<span className="text-[13px] font-normal text-ink-muted"> / R$ 600</span>
            </span>
          </div>
          <span className="text-[13px] text-brand-text">Editar metas</span>
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-4 text-[12px] uppercase text-ink-muted">{titulo}</p>
      <div className="hairline overflow-hidden rounded-3xl bg-surface">{children}</div>
    </div>
  );
}

function LinhaResumo({ icone, tom, rotulo, valor, badge }: { icone: ReactNode; tom: string; rotulo: string; valor?: string; badge?: number }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[15px] text-ink first:border-t-0">
      <span className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg ${tom}`}>{icone}</span>
      <span className="flex-1">{rotulo}</span>
      {badge ? (
        <span className="rounded-full bg-tile-danger px-2 text-[12px] font-semibold text-on-tile-danger">{badge}</span>
      ) : (
        valor && <span className="text-ink-muted tabular-nums">{valor}</span>
      )}
      <span className="text-ink-faint">›</span>
    </div>
  );
}

function LinhaVenda({ cliente, sub, valor }: { cliente: string; sub: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[15px] text-ink first:border-t-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{cliente}</span>
        <span className="truncate text-[13px] text-ink-muted">{sub}</span>
      </span>
      <span className="font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

function ItemCarrinho({ nome, rotulo, preco, qtd }: { nome: string; rotulo?: string; preco: string; qtd: number }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
        <IconBox width={20} height={20} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-ink">{nome}</p>
        {rotulo && (
          <p className="mt-0.5 inline-block rounded-full bg-fill px-2 py-0.5 text-[11px] font-medium text-ink-2">{rotulo}</p>
        )}
        <div className="mt-1.5 flex w-[7.5rem] items-center gap-1.5 rounded-xl border border-line bg-fill px-2.5 py-1 text-ink-muted">
          <span className="text-[13px]">R$</span>
          <span className="flex-1 text-[13px] font-semibold tabular-nums text-ink">{preco}</span>
          <IconPencil width={12} height={12} className="text-ink-faint" />
        </div>
      </div>
      <div className="flex items-center rounded-full bg-canvas text-ink">
        <span className="flex h-[30px] w-[30px] items-center justify-center text-lg">−</span>
        <span className="w-5 text-center text-[15px] font-semibold tabular-nums">{qtd}</span>
        <span className="flex h-[30px] w-[30px] items-center justify-center text-lg">+</span>
      </div>
    </div>
  );
}

function Foto({ tom, capa = false }: { tom: string; capa?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`relative flex aspect-square items-center justify-center rounded-xl ${tom}`}>
        <IconBox width={26} height={26} strokeWidth={1.6} />
        {capa && (
          <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Capa
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <span className="rounded-full bg-fill py-1 text-center text-[10px] font-semibold text-ink">Copiar</span>
        <span className="rounded-full bg-fill py-1 text-center text-[10px] font-semibold text-ink">Baixar</span>
      </div>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[10px] font-medium text-ink-muted">{rotulo}</p>
      <p className="truncate rounded-lg bg-fill px-2 py-1 text-[12px] tabular-nums text-ink">{valor}</p>
    </div>
  );
}

function ItemImportado({ nome, custo, venda, estoque }: { nome: string; custo: string; venda: string; estoque: string }) {
  return (
    <div className="flex items-start gap-2.5 border-t border-line px-3 py-2.5 first:border-t-0">
      <span className="mt-1 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded bg-brand text-on-brand">
        <IconCheck width={11} height={11} strokeWidth={3} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate rounded-lg bg-fill px-2.5 py-1 text-[13px] font-medium text-ink">{nome}</p>
        <div className="grid grid-cols-3 gap-1.5">
          <Campo rotulo="Custo (R$)" valor={custo} />
          <Campo rotulo="Venda (R$)" valor={venda} />
          <Campo rotulo="Estoque" valor={estoque} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------

function TelaProduto() {
  return (
    <Tela>
      <Cabecalho titulo="Fone KZ ZSN Pro" sub="Fones · KZ" />
      <div className="grid grid-cols-2 gap-2.5">
        <Stat rotulo="Custo médio" valor="R$ 47,50" dica="Fornecedor: Importa SP" />
        <Stat rotulo="Preço de venda" valor="R$ 89,90" dica="47,2% de margem" />
        <Stat rotulo="Em estoque" valor="6 un." tom="text-positive" dica="Alerta com 2 ou menos" />
        <Stat rotulo="Vendidos" valor="18" dica="R$ 763,20 de lucro" />
      </div>
      <div className="hairline flex items-center justify-between gap-3 rounded-3xl bg-surface px-4 py-3.5">
        <span>
          <span className="block text-[15px] font-semibold tracking-tight text-ink">Anúncios</span>
          <span className="block text-[12px] text-ink-muted">Títulos, descrições e fotos pra copiar.</span>
        </span>
        <span className="text-ink-faint">›</span>
      </div>
    </Tela>
  );
}

function TelaNovaVenda() {
  return (
    <Tela>
      <div className="flex flex-col items-center gap-0.5 pb-1 pt-2">
        <span className="text-[13px] text-ink-muted">Total · 2 itens</span>
        <span className="text-[38px] font-bold leading-[1.05] tracking-tight tabular-nums text-ink">R$ 129,80</span>
        <span className="mt-1 rounded-full bg-positive-tint px-3 py-1 text-[12px] font-semibold text-positive">
          Lucro de R$ 64,30
        </span>
      </div>
      <Cartao titulo="Carrinho (2)">
        <ItemCarrinho nome="Fone KZ ZSN Pro" rotulo="Preto" preco="89,90" qtd={1} />
        <ItemCarrinho nome="Carregador turbo 20W" preco="39,90" qtd={1} />
        <div className="mt-1 flex items-center gap-3 border-t border-line pt-2.5 text-[15px] text-brand-text">
          <span className="flex w-10 justify-center">
            <IconPlus width={18} height={18} strokeWidth={2.2} />
          </span>
          Adicionar produto
        </div>
      </Cartao>
      <span className="bg-brand-fill flex h-[48px] items-center justify-center rounded-full text-[16px] font-semibold text-on-brand shadow-lg shadow-brand/30">
        Registrar venda · R$ 129,80
      </span>
    </Tela>
  );
}

function TelaAnuncios({ canal }: { canal: string }) {
  const canais = canal === "WhatsApp" ? ["WhatsApp", "Marketplace", "Instagram"] : ["Marketplace", "WhatsApp", "Instagram"];
  return (
    <Tela>
      <Cartao titulo="Fotos" acao={<span className="rounded-full bg-fill px-3 py-1 text-[12px] font-semibold text-ink">Baixar todas</span>}>
        <div className="grid grid-cols-3 gap-2">
          <Foto tom="bg-brand-tint text-brand-text" capa />
          <Foto tom="bg-info-tint text-info" />
          <Foto tom="bg-warning-tint text-warning" />
        </div>
      </Cartao>
      <Cartao titulo="Títulos e descrições">
        <div className="mb-3 flex gap-1 overflow-hidden">
          {canais.map((c, i) => (
            <span
              key={c}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] ${
                i === 0 ? "bg-brand-fill font-semibold text-on-brand" : "bg-fill text-ink-2"
              }`}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="rounded-2xl border border-line p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-ink-2">
              Título <span className="font-normal text-ink-muted">(36/100)</span>
            </span>
            <span className="rounded-full bg-fill px-2.5 py-0.5 text-[11px] font-semibold text-ink">Copiar título</span>
          </div>
          <p className="rounded-xl bg-fill px-3 py-2 text-[13px] text-ink">Fone KZ ZSN Pro Preto com Microfone</p>
          <div className="mb-1 mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-ink-2">Descrição</span>
            <span className="rounded-full bg-fill px-2.5 py-0.5 text-[11px] font-semibold text-ink">Copiar descrição</span>
          </div>
          <p className="rounded-xl bg-fill px-3 py-2 text-[12px] leading-snug text-ink-2">
            Fone in ear KZ ZSN Pro com cabo removível e microfone.
            <br />• Driver híbrido
            <br />• Conector P2
          </p>
        </div>
      </Cartao>
    </Tela>
  );
}

function TelaImportar() {
  return (
    <Tela>
      <Cartao
        titulo={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[12px] font-semibold text-brand-text">
              1
            </span>
            Produtos (48)
          </span>
        }
      >
        <p className="mb-2.5 text-[12px] text-ink-muted">Você pode corrigir qualquer valor aqui antes de importar.</p>
        <div className="rounded-2xl border border-line">
          <ItemImportado nome="Parafusadeira 12V Bivolt" custo="98,00" venda="169,90" estoque="4" />
          <ItemImportado nome="Carrinho controle remoto 4x4" custo="62,00" venda="119,90" estoque="7" />
          <ItemImportado nome="Relógio smartwatch D20" custo="21,50" venda="59,90" estoque="12" />
        </div>
        <span className="bg-brand-fill mt-3 inline-flex rounded-full px-4 py-2 text-[14px] font-semibold text-on-brand shadow-sm shadow-brand/30">
          Importar 48 produtos
        </span>
      </Cartao>
    </Tela>
  );
}

function TelaInicio() {
  return (
    <Tela>
      <div className="px-1.5 pt-1.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Sexta-feira, 2 de outubro</p>
        <p className="text-[26px] font-bold leading-[1.15] tracking-tight text-ink">Boa tarde, Lucas</p>
      </div>
      <Grupo titulo="Resumo">
        <LinhaResumo icone={<IconReceipt width={15} height={15} />} tom="bg-tile-warning text-on-tile-warning" rotulo="A receber" valor="R$ 180,00" />
        <LinhaResumo icone={<IconBox width={15} height={15} />} tom="bg-brand text-on-brand" rotulo="Repor estoque" valor="3 itens" />
        <LinhaResumo icone={<IconWallet width={15} height={15} />} tom="bg-tile-positive text-on-tile-positive" rotulo="Dinheiro em caixa" valor="R$ 2.318,40" />
      </Grupo>
      <Grupo titulo="Vendas de hoje">
        <LinhaVenda cliente="Rafael Costa" sub="Pix · 14:32" valor="R$ 129,80" />
        <LinhaVenda cliente="Venda avulsa" sub="Dinheiro · 11:05" valor="R$ 169,90" />
        <LinhaVenda cliente="Bruna Alves" sub="Pix · 09:48" valor="R$ 59,90" />
      </Grupo>
    </Tela>
  );
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

// Texto de um lado, tela do outro. Alterna o lado a cada seção no desktop;
// no celular a tela vem sempre embaixo do texto.
function Recurso({
  id,
  rotulo,
  titulo,
  texto,
  pontos,
  invertido = false,
  fundo = "bg-surface",
  flutuante,
  children,
}: {
  id: string;
  rotulo: string;
  titulo: ReactNode;
  texto: string;
  pontos: string[];
  invertido?: boolean;
  fundo?: string;
  flutuante?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`scroll-mt-11 overflow-hidden px-5 py-20 sm:py-28 ${fundo}`}>
      <div className="mx-auto grid max-w-[1024px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className={invertido ? "lg:order-2" : ""}>
          <p className="text-[17px] font-semibold text-brand-text">{rotulo}</p>
          <h2 id={`${id}-titulo`} className="mt-2 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl">
            {titulo}
          </h2>
          <p className="mt-4 text-[17px] leading-[1.47] text-ink-muted sm:text-[19px]">{texto}</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {pontos.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[15px] text-ink-2 sm:text-[17px]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-text">
                  <IconCheck width={12} height={12} strokeWidth={2.6} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={`relative mx-auto w-full max-w-[380px] ${invertido ? "lg:order-1" : ""}`}>
          <Cena giro={invertido ? -2.5 : 2.5}>{children}</Cena>
          {flutuante}
        </div>
      </div>
    </section>
  );
}

function PlanoItens({ itens }: { itens: readonly string[] }) {
  return (
    // flex-1 empurra o botão para o pé do cartão, alinhando os dois planos
    <ul className="mt-6 flex flex-1 flex-col gap-2.5">
      {itens.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[15px] text-ink-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-text">
            <IconCheck width={12} height={12} strokeWidth={2.6} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Landing({ publico }: { publico: Publico }) {
  const p = PUBLICOS[publico];
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <header className="glass sticky top-0 z-20 flex h-11 items-center justify-between border-b border-line px-4 text-xs sm:justify-center sm:gap-9">
        <a href="#topo" aria-label="Marcon, voltar ao topo">
          <Icone tamanho={18} />
        </a>
        <nav aria-label="Seções" className="hidden items-center gap-9 sm:flex">
          {SECOES.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-ink-2 transition hover:text-ink">
              {s.rotulo}
            </a>
          ))}
        </nav>
        <span className="flex items-center gap-3 sm:absolute sm:right-4">
          <Link href="/login" className="font-medium text-brand-text hover:underline">
            Entrar
          </Link>
          <ThemeToggle variante="icone" />
        </span>
      </header>

      <main id="topo" className="flex flex-1 flex-col">
        <section className="relative flex flex-col items-center overflow-hidden px-5 pb-20 pt-14 text-center sm:pb-28 sm:pt-16">
          <div className="drop-shadow-[0_24px_40px_rgba(212,95,48,0.28)] drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)]">
            <Icone tamanho={96} brilho />
          </div>
          <p className="mt-5 text-[17px] font-semibold tracking-tight text-brand-text">{p.selo}</p>
          <h1 className="mt-3 max-w-[980px] text-[42px] font-bold leading-[1.02] tracking-[-0.05em] sm:text-7xl lg:text-[80px]">
            {p.manchete[0]}
            <br />
            {p.manchete[1]}
          </h1>
          <p className="mt-5 max-w-[640px] text-[19px] font-medium leading-[1.4] tracking-[-0.015em] text-ink-muted sm:text-[22px]">
            {p.apoio}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            <Link
              href="/login?modo=signup"
              className="bg-brand-fill inline-flex items-center rounded-full px-6 py-3 text-[17px] font-semibold text-on-brand shadow-sm shadow-brand/30 transition active:scale-[0.98]"
            >
              Começar grátis
            </Link>
            <Link href="/login" className="text-[17px] font-medium text-brand-text hover:underline">
              Já tenho conta ›
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-ink-muted">{DIAS_DE_TESTE} dias com tudo liberado, sem cartão.</p>

          <div className="relative mx-auto mt-16 w-full max-w-[400px]">
            <Cena giro={-2}>
              <Tela>
                <PainelMetas />
              </Tela>
            </Cena>
            <div className="-mt-3 flex flex-col gap-2 px-2 sm:-mt-10 sm:-mr-24 sm:ml-24">
              <Cena giro={1.5} className="flutuar-atrasado">
                <div className="flex flex-col gap-2">
                  <Notificacao titulo="Caiu mais uma! 💸" corpo={`Fone KZ ZSN Pro +1 · R$ 129,80 · lucro R$ 64,30 · ${p.canal}`} />
                  <Notificacao titulo="Mais uma pra conta 🙌" corpo="Parafusadeira 12V Bivolt · R$ 169,90 · lucro R$ 71,90" quando="11:05" />
                </div>
              </Cena>
            </div>
          </div>
        </section>

        <Recurso
          id="estoque"
          rotulo="Estoque e custo"
          fundo="bg-panel"
          titulo={
            <>
              Tem? Quanto custou?
              <br />
              Tá tudo aqui.
            </>
          }
          texto="O cliente chamou perguntando? Abre o produto e vê na hora se tem, quanto você pagou e quanto ganha em cada preço. Dá pra negociar sem medo de vender no prejuízo."
          pontos={[
            "Estoque por cor, modelo ou voltagem",
            "Custo, preço e margem de cada produto",
            "Aviso quando algo está acabando",
          ]}
          flutuante={
            <Flutuante className="ml-auto sm:-bottom-6 sm:-right-16 sm:ml-0">
              <div className="hairline overflow-hidden rounded-3xl bg-surface shadow-[0_24px_40px_-18px_rgba(0,0,0,0.35)]">
                <LinhaResumo icone={<IconBox width={15} height={15} />} tom="bg-brand text-on-brand" rotulo="Repor estoque" valor="3 itens" />
              </div>
            </Flutuante>
          }
        >
          <TelaProduto />
        </Recurso>

        <Recurso
          id="vendas"
          rotulo="Vendas"
          invertido
          titulo={
            <>
              Vendeu? Plim.
              <br />
              O lucro já aparece.
            </>
          }
          texto="Registra a venda em segundos e o Marcon faz a conta: baixa o estoque, soma no caixa e mostra o lucro, já tirando frete e embalagem. E o app avisa a cada venda."
          pontos={[
            "Pix, dinheiro, cartão ou parcelado",
            "Saiba se a venda veio do Marketplace, do WhatsApp ou do Instagram",
            "Frete, motoboy e embalagem descontados do lucro",
          ]}
          flutuante={
            <Flutuante className="mr-auto sm:-left-16 sm:-top-16">
              <Notificacao titulo="Vendeu! 🎉" corpo={`Fone KZ ZSN Pro +1 · R$ 129,80 · lucro R$ 64,30 · ${p.canal}`} />
            </Flutuante>
          }
        >
          <TelaNovaVenda />
        </Recurso>

        <Recurso
          id="anuncios"
          rotulo="Anúncios"
          fundo="bg-panel"
          titulo={
            <>
              Fotos e texto prontos.
              <br />
              É só copiar e colar.
            </>
          }
          texto="Cada produto guarda as fotos e um anúncio pra cada canal. Na hora de postar no Marketplace ou no status, você copia, cola e pronto. Se der branco, a IA escreve uma versão pra você revisar."
          pontos={[
            "Até 10 fotos por produto, pra copiar ou baixar todas",
            "Um texto pra cada canal, no tamanho certo",
            "IA que escreve título e descrição a partir do cadastro",
          ]}
          flutuante={
            <Flutuante className="ml-auto sm:-bottom-6 sm:-right-16 sm:ml-0">
              <div className="hairline glass flex items-center gap-2.5 rounded-[22px] px-3.5 py-3 text-left shadow-[0_24px_40px_-18px_rgba(0,0,0,0.35)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                  <IconSparkles width={18} height={18} />
                </span>
                <span className="text-[13px] leading-snug text-ink-2">
                  <span className="block font-semibold text-ink">Anúncio escrito</span>
                  Revise antes de usar.
                </span>
              </div>
            </Flutuante>
          }
        >
          <TelaAnuncios canal={p.canal} />
        </Recurso>

        <Recurso
          id="importar"
          rotulo="Importar"
          invertido
          titulo={
            <>
              Já usa outro app?
              <br />
              Não começa do zero.
            </>
          }
          texto="Traga todo o seu histórico pro Marcon: produtos, vendas e caixa. Você confere tudo numa prévia, corrige o que quiser e só então importa."
          pontos={[
            "Produtos com custo, preço e estoque",
            "Histórico de vendas e de caixa",
            "Nada entra antes de você conferir",
          ]}
        >
          <TelaImportar />
        </Recurso>

        <Recurso
          id="lucro"
          rotulo="Lucro"
          fundo="bg-panel"
          titulo={
            <>
              Tá valendo a pena?
              <br />
              Agora você sabe.
            </>
          }
          texto="O Início mostra quanto você vendeu, quanto lucrou e quanto falta pra meta, no dia, na semana ou no mês. Tudo que entra e sai vai pro caixa sozinho."
          pontos={[
            "Lucro de cada venda e do mês inteiro",
            "Meta de vendas e de lucro que enche conforme você vende",
            "Fluxo de caixa com o que entrou e o que saiu",
          ]}
        >
          <TelaInicio />
        </Recurso>

        <section aria-labelledby="quem-fez-titulo" className="px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-[720px] text-center">
            <p className="text-[17px] font-semibold text-brand-text">Feito por quem também vende.</p>
            <h2 id="quem-fez-titulo" className="mt-2 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl">
              Eu vendo como você.
              <br />
              <span className="text-ink-muted">Por isso fiz o Marcon.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[600px] text-[17px] leading-[1.6] text-ink-2 sm:text-[19px]">
              Vendo no Marketplace e no WhatsApp e cansei de planilha, de caderninho e de app lotado de coisa que eu não usava.
              Cada tela do Marcon foi pensada pro jeito que a gente vende: rápido, entre uma conversa e outra.
            </p>
          </div>
        </section>

        <section aria-labelledby="app-titulo" className="px-5 py-20 text-center sm:py-28">
          <div className="mx-auto max-w-[720px]">
            <Icone tamanho={72} />
            <h2 id="app-titulo" className="mt-6 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl">
              Sem loja de aplicativos.
              <br />
              <span className="text-ink-muted">Direto na tela de início.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[560px] text-[17px] leading-[1.47] text-ink-muted sm:text-[19px]">
              Abre o Marcon no navegador e toca em “Adicionar à tela de início”. Ele abre em tela cheia, como um app, e avisa
              cada venda.
            </p>
            <ol className="mx-auto mt-10 grid max-w-[640px] gap-3 text-left sm:grid-cols-3">
              {["Crie sua conta", "Cadastre os produtos", "Registre a primeira venda"].map((passo, i) => (
                <li key={passo} className="hairline flex items-center gap-3 rounded-2xl bg-panel px-4 py-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-surface">
                    {i + 1}
                  </span>
                  <span className="text-[15px] font-medium">{passo}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-11 bg-panel px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-[880px]">
            <p className="text-center text-[17px] font-semibold text-brand-text">Planos</p>
            <h2
              id="planos-titulo"
              className="mx-auto mt-2 max-w-[640px] text-center text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
            >
              Comece grátis.
              <br />
              Assine se fizer sentido.
            </h2>
            <p className="mx-auto mt-4 max-w-[560px] text-center text-[17px] leading-[1.47] text-ink-muted sm:text-[19px]">
              {DIAS_DE_TESTE} dias com tudo liberado, sem cartão. Depois você escolhe.
            </p>

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              <div className="hairline flex flex-col rounded-3xl bg-surface p-6 sm:p-8">
                <h3 className="text-[19px] font-semibold tracking-tight">{PLANO_GRATIS.nome}</h3>
                <p className="mt-1 text-[15px] text-ink-muted">Pra quem está começando.</p>
                <p className="mt-5 text-[40px] font-bold tracking-[-0.04em] tabular-nums">
                  R$ 0<span className="text-[15px] font-medium tracking-normal text-ink-muted"> /mês</span>
                </p>
                <PlanoItens itens={PLANO_GRATIS.inclui} />
                <Link
                  href="/login?modo=signup"
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-fill px-6 py-3 text-[17px] font-medium text-ink transition hover:bg-fill-strong active:scale-[0.98]"
                >
                  Criar conta
                </Link>
              </div>

              <div className="relative flex flex-col rounded-3xl border border-brand bg-surface p-6 shadow-[0_30px_60px_-30px_rgba(212,95,48,0.45)] sm:p-8">
                <span className="absolute -top-3 left-6 rounded-full bg-brand-fill px-3 py-1 text-[12px] font-semibold text-on-brand sm:left-8">
                  {DIAS_DE_TESTE} dias grátis
                </span>
                <h3 className="text-[19px] font-semibold tracking-tight">{PLANOS.marcon.nome}</h3>
                <p className="mt-1 text-[15px] text-ink-muted">Pra quem já vende toda semana.</p>
                <p className="mt-5 text-[40px] font-bold tracking-[-0.04em] tabular-nums">
                  {formatBRL(PLANOS.marcon.valor)}
                  <span className="text-[15px] font-medium tracking-normal text-ink-muted"> /mês</span>
                </p>
                <PlanoItens itens={PLANOS.marcon.inclui} />
                <Link
                  href="/login?modo=signup"
                  className="bg-brand-fill mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-[17px] font-semibold text-on-brand shadow-sm shadow-brand/30 transition active:scale-[0.98]"
                >
                  Começar teste grátis
                </Link>
                <p className="mt-3 text-center text-[13px] text-ink-muted">Sem fidelidade. Cancele quando quiser.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="perguntas-titulo" className="px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-[720px]">
            <h2 id="perguntas-titulo" className="text-center text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl">
              Perguntas frequentes
            </h2>
            <div className="hairline mt-10 overflow-hidden rounded-3xl bg-panel">
              {PERGUNTAS.map((q) => (
                <details key={q.p} className="group border-t border-line first:border-t-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                    {q.p}
                    <span aria-hidden="true" className="text-xl leading-none text-ink-faint transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[15px] leading-[1.5] text-ink-muted">{q.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-titulo" className="bg-panel px-5 py-24 text-center sm:py-32">
          <h2 id="cta-titulo" className="mx-auto max-w-[800px] text-[40px] font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl">
            De renda extra
            <br />
            a negócio de verdade.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-xl font-medium text-ink-muted">
            Comece hoje, de graça. Leva menos de um minuto.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            <Link
              href="/login?modo=signup"
              className="bg-brand-fill inline-flex items-center rounded-full px-6 py-3 text-[17px] font-semibold text-on-brand shadow-sm shadow-brand/30 transition active:scale-[0.98]"
            >
              Criar conta grátis
            </Link>
            <Link href="/login" className="text-[17px] font-medium text-brand-text hover:underline">
              Já tenho conta ›
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-panel px-5 py-8 text-xs text-ink-muted">
        <div className="mx-auto flex max-w-[1024px] flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="flex items-center gap-2">
            <Icone tamanho={16} />
            Marcon · O app de quem vende no Marketplace e no WhatsApp
          </span>
          <nav aria-label="Rodapé" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {SECOES.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="hover:text-ink">
                {s.rotulo}
              </a>
            ))}
            <Link href="/login" className="hover:text-ink">
              Entrar
            </Link>
            <Link href="/termos" className="hover:text-ink">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-ink">
              Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

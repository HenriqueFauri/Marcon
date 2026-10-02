import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  IconAlert,
  IconBox,
  IconCart,
  IconCheck,
  IconMegaphone,
  IconReceipt,
  IconSparkles,
  IconUsers,
  IconWallet,
  IconWhatsapp,
} from "@/components/icons";
import { formatBRL } from "@/lib/format";
import { DIAS_DE_TESTE, PLANO_GRATIS, PLANOS } from "@/lib/planos";

export const metadata: Metadata = {
  title: { absolute: "Marcon — gestão para quem vende no Marketplace" },
  description:
    "Anúncio pronto, venda em dois toques e o lucro de verdade. Feito para quem vende no Facebook Marketplace, na OLX e em grupos de desapego.",
};

const SECOES = [
  { id: "anuncios", rotulo: "Anúncios" },
  { id: "vendas", rotulo: "Vendas" },
  { id: "estoque", rotulo: "Estoque" },
  { id: "lucro", rotulo: "Lucro" },
  { id: "planos", rotulo: "Planos" },
];

const EXTRAS: { icone: ReactNode; titulo: string; texto: string }[] = [
  {
    icone: <IconBox width={20} height={20} />,
    titulo: "Galeria de fotos",
    texto: "Até 10 fotos por produto e por variação. Baixe ou compartilhe todas de uma vez na hora de anunciar.",
  },
  {
    icone: <IconReceipt width={20} height={20} />,
    titulo: "Recibo para o comprador",
    texto: "Um link com o recibo da venda para mandar no chat do Marketplace ou no WhatsApp.",
  },
  {
    icone: <IconAlert width={20} height={20} />,
    titulo: "Aviso de venda no celular",
    texto: "Notificação a cada venda registrada, com valor, lucro e o canal onde ela saiu.",
  },
  {
    icone: <IconUsers width={20} height={20} />,
    titulo: "Compradores",
    texto: "Quem já comprou de você, o que levou e o WhatsApp a um toque para chamar de novo.",
  },
  {
    icone: <IconWhatsapp width={20} height={20} />,
    titulo: "Parcelado, quando precisar",
    texto: "Combinou parcelas com um comprador? Elas vão para Contas a receber e você cobra pelo WhatsApp.",
  },
  {
    icone: <IconCheck width={20} height={20} />,
    titulo: "Veio de outro sistema?",
    texto: "Importe seus produtos, vendas e caixa de um relatório em PDF e confira numa prévia antes.",
  },
];

const PERGUNTAS = [
  {
    p: "O Marcon é só para quem vende no Marketplace?",
    r: "Ele foi feito para quem vende principalmente no Facebook Marketplace. Funciona também para OLX, grupos de desapego e Instagram, que são canais do mesmo jeito de vender: pelo celular, produto por produto. Se você tem uma loja com balcão e caixa, outros sistemas combinam mais.",
  },
  {
    p: "Preciso publicar o anúncio de dentro do Marcon?",
    r: "Não. O Facebook e a OLX não deixam um app publicar por você. O Marcon deixa o anúncio pronto, com título e descrição no tamanho que cada canal aceita, e as fotos reunidas. Você copia, cola e publica.",
  },
  {
    p: "A IA escreve o anúncio sozinha?",
    r: "Ela escreve o título e a descrição a partir dos dados do produto, das fotos e da dica que você der, respeitando o limite de cada canal. Você sempre revisa antes de usar. Cada plano tem uma cota mensal de anúncios escritos com IA.",
  },
  {
    p: "Quanto custa?",
    r: `Os primeiros ${DIAS_DE_TESTE} dias são grátis, com tudo liberado e sem cartão. Depois, o plano Marcon sai por ${formatBRL(PLANOS.marcon.valor)} por mês, sem fidelidade. Se não quiser assinar, sua conta continua no plano grátis, com limite de vendas e produtos.`,
  },
  {
    p: "Já uso outro sistema. Tenho que começar do zero?",
    r: "Não. Baixe em PDF os relatórios de produtos, vendas e caixa do sistema antigo e envie no Marcon. Você confere tudo numa prévia antes de importar.",
  },
  {
    p: "Precisa instalar alguma coisa?",
    r: "Não. O Marcon abre no navegador do celular ou do computador. Se quiser, é só adicionar à tela de início: ele vira um app, com ícone e notificações.",
  },
  {
    p: "E se o comprador pagar parcelado?",
    r: "Na hora da venda você escolhe à vista, a prazo ou parcelado. As parcelas vão sozinhas para Contas a receber e você marca como pago quando o comprador acertar.",
  },
  {
    p: "Meus dados ficam seguros?",
    r: "Cada conta só enxerga os próprios dados, com regras de acesso no próprio banco de dados. Excluir um produto ou comprador nunca apaga o histórico financeiro.",
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

const INCLINACAO = {
  esq: "perspective(1800px) rotateY(15deg) rotateX(4deg) rotate(-4deg)",
  dir: "perspective(1800px) rotateY(-15deg) rotateX(4deg) rotate(4deg)",
} as const;

// As telas são imagens do app, não o app. Por isso aparecem num aparelho
// inclinado, flutuando, sem nada que convide ao toque.
function Aparelho({
  lado,
  className = "",
  children,
}: {
  lado: keyof typeof INCLINACAO;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-hidden="true" className={`flutuar pointer-events-none relative select-none ${className}`}>
      <div
        style={{ transform: INCLINACAO[lado] }}
        className="rounded-[46px] bg-[#1d1d1f] p-[7px] shadow-[0_50px_80px_-30px_rgba(0,0,0,0.5),0_18px_30px_-18px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.16)]"
      >
        <div className="overflow-hidden rounded-[39px] bg-canvas px-3 pb-5">
          <span className="mx-auto mt-2.5 block h-[22px] w-[84px] rounded-full bg-[#1d1d1f]" />
          {children}
        </div>
      </div>
    </div>
  );
}

// Cartão que "sai" do aparelho, como as notificações e os avisos do app.
function Destaque({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`flutuar flutuar-atrasado pointer-events-none absolute select-none ${className}`}
    >
      <div className="hairline glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-[0_24px_40px_-16px_rgba(0,0,0,0.35)]">
        {children}
      </div>
    </div>
  );
}

// Seção de recurso: texto de um lado, uma tela do app do outro. Alterna o lado a
// cada seção no desktop; no celular o aparelho vem sempre embaixo do texto.
function Recurso({
  id,
  rotulo,
  titulo,
  texto,
  pontos,
  invertido = false,
  fundo = "bg-surface",
  destaque,
  children,
}: {
  id: string;
  rotulo: string;
  titulo: ReactNode;
  texto: string;
  pontos: string[];
  invertido?: boolean;
  fundo?: string;
  destaque?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={`scroll-mt-11 overflow-hidden px-5 py-20 sm:py-28 ${fundo}`}
    >
      <div className="mx-auto grid max-w-[1024px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className={invertido ? "lg:order-2" : ""}>
          <p className="text-[17px] font-semibold text-brand-text">{rotulo}</p>
          <h2
            id={`${id}-titulo`}
            className="mt-2 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
          >
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
        <div className={`relative mx-auto w-full max-w-[310px] ${invertido ? "lg:order-1" : ""}`}>
          <Aparelho lado={invertido ? "esq" : "dir"}>{children}</Aparelho>
          {destaque}
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

function Tela({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-2 pt-3 text-[22px] font-bold tracking-tight">{titulo}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Lista({ children }: { children: ReactNode }) {
  return <div className="hairline overflow-hidden rounded-3xl bg-surface">{children}</div>;
}

function Linha({
  icone,
  tom,
  titulo,
  sub,
  valor,
  valorTom = "text-ink",
}: {
  icone?: ReactNode;
  tom?: string;
  titulo: string;
  sub?: string;
  valor?: ReactNode;
  valorTom?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
      {icone && (
        <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${tom}`}>{icone}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] text-ink">{titulo}</span>
        {sub && <span className="truncate text-[13px] text-ink-muted">{sub}</span>}
      </span>
      {valor && <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${valorTom}`}>{valor}</span>}
    </div>
  );
}

function TelaAnuncio() {
  return (
    <Tela titulo="Anúncio">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-fill p-1 text-center text-[11px] font-medium">
        <span className="truncate rounded-full bg-surface px-1 py-1.5 shadow-sm">Marketplace</span>
        <span className="py-1.5 text-ink-muted">OLX</span>
        <span className="py-1.5 text-ink-muted">Instagram</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <span className="flex aspect-square items-center justify-center rounded-2xl bg-brand-tint text-brand-text">
          <IconBox width={22} height={22} />
        </span>
        <span className="flex aspect-square items-center justify-center rounded-2xl bg-info-tint text-info">
          <IconBox width={22} height={22} />
        </span>
        <span className="flex aspect-square items-center justify-center rounded-2xl bg-warning-tint text-warning">
          <IconBox width={22} height={22} />
        </span>
      </div>
      <div className="hairline rounded-2xl bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-ink-muted">Título</span>
          <span className="text-[12px] tabular-nums text-ink-faint">41/100</span>
        </div>
        <p className="mt-1 text-[15px] leading-snug">Bicicleta Caloi Aro 29 Azul 21 Marchas</p>
      </div>
      <div className="hairline rounded-2xl bg-surface px-4 py-3">
        <span className="text-[12px] font-medium text-ink-muted">Descrição</span>
        <p className="mt-1 text-[13px] leading-snug text-ink-2">
          Bicicleta aro 29 com quadro de alumínio, 21 marchas e freio a disco.
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-2">• Câmbio Shimano • Suspensão dianteira</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="flex items-center justify-center gap-1.5 rounded-full bg-fill py-2.5 text-[14px] font-semibold">
          <IconSparkles width={15} height={15} /> Escrever
        </span>
        <span className="bg-brand-fill flex items-center justify-center rounded-full py-2.5 text-[14px] font-semibold text-on-brand">
          Copiar
        </span>
      </div>
    </Tela>
  );
}

function TelaVendas() {
  return (
    <Tela titulo="Nova venda">
      <Lista>
        <Linha titulo="Bicicleta Caloi Aro 29" sub="Azul · usada" valor="R$ 890,00" />
        <Linha titulo="Capacete infantil" sub="2 × R$ 45,00" valor="R$ 90,00" />
      </Lista>
      <Lista>
        <Linha titulo="Canal" valor="Marketplace" valorTom="text-brand-text" />
        <Linha titulo="Frete" sub="Outros gastos" valor="− R$ 25,00" valorTom="text-danger" />
      </Lista>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-fill p-1 text-center text-[13px] font-medium">
        <span className="rounded-full bg-surface py-1.5 shadow-sm">Pix</span>
        <span className="py-1.5 text-ink-muted">Cartão</span>
        <span className="py-1.5 text-ink-muted">A prazo</span>
      </div>
      <div className="flex items-center justify-between px-2 pt-1">
        <span className="text-[15px] text-ink-muted">Total</span>
        <span className="text-[26px] font-bold tracking-tight tabular-nums">R$ 980,00</span>
      </div>
      <span className="bg-brand-fill flex items-center justify-center rounded-full py-3 text-[17px] font-semibold text-on-brand">
        Registrar venda
      </span>
    </Tela>
  );
}

function TelaEstoque() {
  return (
    <Tela titulo="Produtos">
      <div className="flex gap-2 px-1">
        <span className="rounded-xl bg-tile-danger px-3 py-2 text-[13px] font-semibold text-on-tile-danger">2 zerados</span>
        <span className="rounded-xl bg-tile-warning px-3 py-2 text-[13px] font-semibold text-on-tile-warning">3 acabando</span>
      </div>
      <Lista>
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-brand-tint text-brand-text"
          titulo="Tênis Nike Air Max"
          sub="38 · 40 · 42 · 43"
          valor="9 un."
        />
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-warning-tint text-warning"
          titulo="Air Fryer 4L"
          sub="Mínimo 3"
          valor="2 un."
          valorTom="text-warning"
        />
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-danger-tint text-danger"
          titulo="Bicicleta Caloi Aro 29"
          sub="Vendida hoje, 14:32"
          valor="0 un."
          valorTom="text-danger"
        />
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-brand-tint text-brand-text"
          titulo="Fone Bluetooth"
          sub="Preto · Branco"
          valor="14 un."
        />
      </Lista>
    </Tela>
  );
}

function TelaLucro() {
  const barras = [38, 52, 44, 70, 58, 86, 64];
  return (
    <Tela titulo="Fluxo de caixa">
      <div className="hairline rounded-3xl bg-surface px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-ink-muted">Saldo do mês</p>
          <p className="text-[12px] font-semibold text-positive">+ R$ 940 de agosto</p>
        </div>
        <p className="text-[30px] font-bold tracking-tight tabular-nums">R$ 3.318,20</p>
        <div className="mt-4 flex h-20 items-end gap-2">
          {barras.map((b, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-md ${i === barras.length - 1 ? "bg-brand" : "bg-brand-tint"}`}
              style={{ height: `${b}%` }}
            />
          ))}
        </div>
      </div>
      <Lista>
        <Linha
          icone={<IconCart width={16} height={16} />}
          tom="bg-positive-tint text-positive"
          titulo="Venda #214"
          sub="Hoje · Marketplace · Pix"
          valor="+ R$ 980,00"
          valorTom="text-positive"
        />
        <Linha
          icone={<IconWallet width={16} height={16} />}
          tom="bg-danger-tint text-danger"
          titulo="Frete e embalagem"
          sub="Hoje · Outros gastos"
          valor="− R$ 25,00"
          valorTom="text-danger"
        />
      </Lista>
    </Tela>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <header className="glass sticky top-0 z-10 flex h-11 items-center justify-between border-b border-line px-4 text-xs sm:justify-center sm:gap-9">
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
        <section className="relative flex flex-col items-center overflow-hidden px-5 pt-14 text-center sm:pt-16">
          <div className="drop-shadow-[0_24px_40px_rgba(212,95,48,0.28)] drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)]">
            <Icone tamanho={112} brilho />
          </div>
          <p className="mt-5 text-[17px] font-semibold tracking-tight text-brand-text">
            Marcon · para quem vende no Marketplace
          </p>
          <h1 className="mt-4 max-w-[980px] text-[44px] font-bold leading-[1.02] tracking-[-0.05em] sm:text-7xl lg:text-[80px]">
            Anunciou. Vendeu.
            <br />
            Sabe quanto lucrou.
          </h1>
          <p className="mt-4 max-w-[660px] text-xl font-medium leading-[1.35] tracking-[-0.015em] text-ink-muted sm:text-2xl">
            O app de quem vende no Facebook Marketplace: anúncio pronto para copiar, venda em dois toques e o lucro de
            cada uma, sem planilha.
          </p>
          <div className="mt-8 flex items-center gap-3.5">
            <Link
              href="/login?modo=signup"
              className="bg-brand-fill inline-flex items-center rounded-full px-6 py-3 text-[17px] font-semibold text-on-brand shadow-sm shadow-brand/30 transition active:scale-[0.98]"
            >
              Começar teste grátis
            </Link>
            <Link href="/login" className="text-[17px] font-medium text-brand-text hover:underline">
              Entrar ›
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-ink-muted">
            Serve também para OLX, grupos de desapego e Instagram. {DIAS_DE_TESTE} dias grátis, sem cartão.
          </p>

          <div className="mt-14 -mx-5 flex h-[330px] w-[calc(100%+2.5rem)] justify-center gap-5 overflow-hidden [mask-image:linear-gradient(to_bottom,black_58%,transparent)] sm:h-[440px] sm:gap-8">
            <Aparelho lado="esq" className="mt-8 w-[290px] shrink-0 text-left">
              <TelaAnuncio />
            </Aparelho>
            <Aparelho lado="dir" className="hidden w-[290px] shrink-0 text-left sm:block">
              <TelaVendas />
            </Aparelho>
          </div>
        </section>

        <Recurso
          id="anuncios"
          rotulo="Anúncios"
          fundo="bg-panel"
          titulo={
            <>
              Anúncio pronto.
              <br />
              É só copiar e colar.
            </>
          }
          texto="Cadastrou o produto, o anúncio já tem por onde começar. Título e descrição no tamanho que cada canal aceita, com as fotos reunidas no mesmo lugar."
          pontos={[
            "Uma versão para cada canal: Marketplace, OLX, Instagram",
            "A IA escreve o título e a descrição, você só revisa",
            "Copie o texto e compartilhe todas as fotos de uma vez",
          ]}
          destaque={
            <Destaque className="-left-2 top-48 sm:-left-24">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
                <IconSparkles width={16} height={16} />
              </span>
              <span className="flex flex-col text-left">
                <span className="text-[13px] font-semibold">Anúncio escrito</span>
                <span className="text-[12px] text-ink-muted">41 de 100 caracteres</span>
              </span>
            </Destaque>
          }
        >
          <TelaAnuncio />
        </Recurso>

        <Recurso
          id="vendas"
          rotulo="Vendas"
          invertido
          titulo={
            <>
              Vendeu? Anotou.
              <br />
              Em dois toques.
            </>
          }
          texto="Escolha o produto, o canal e a forma de pagamento. O estoque baixa, o caixa sobe e o lucro da venda aparece na hora, já descontando frete e embalagem."
          pontos={[
            "Pix, dinheiro, cartão, a prazo ou parcelado",
            "Saiba em qual canal cada venda saiu",
            "Frete, gasolina e embalagem entram como outros gastos",
          ]}
          destaque={
            <Destaque className="-bottom-3 -left-2 sm:bottom-24 sm:-left-24">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-positive-tint text-positive">
                <IconCart width={16} height={16} />
              </span>
              <span className="flex flex-col text-left">
                <span className="text-[13px] font-semibold">Venda registrada</span>
                <span className="text-[12px] text-ink-muted">R$ 980,00 · Marketplace</span>
              </span>
            </Destaque>
          }
        >
          <TelaVendas />
        </Recurso>

        <Recurso
          id="estoque"
          rotulo="Estoque"
          fundo="bg-panel"
          titulo={
            <>
              Saiba o que ainda
              <br />
              tem para vender.
            </>
          }
          texto="Cada venda desconta do estoque sozinha, variação por variação. Quando algo zera, aparece em destaque no Início, para você tirar o anúncio do ar."
          pontos={[
            "Estoque por tamanho, cor ou modelo",
            "Entrada de mercadoria com custo e fornecedor",
            "Margem de cada produto calculada para você",
          ]}
          destaque={
            <Destaque className="-bottom-3 -right-2 sm:bottom-20 sm:-right-24">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-tint text-danger">
                <IconAlert width={16} height={16} />
              </span>
              <span className="flex flex-col text-left">
                <span className="text-[13px] font-semibold">Bicicleta Caloi zerou</span>
                <span className="text-[12px] text-ink-muted">Tire o anúncio do ar</span>
              </span>
            </Destaque>
          }
        >
          <TelaEstoque />
        </Recurso>

        <Recurso
          id="lucro"
          rotulo="Lucro"
          invertido
          titulo={
            <>
              Quanto entrou.
              <br />
              Quanto sobrou.
            </>
          }
          texto="Vendas e recebimentos entram no caixa sozinhos. Lance o que gastou e veja o saldo do mês, já somando o que sobrou do anterior."
          pontos={[
            "Entradas e saídas mês a mês",
            "Lucro de verdade, descontando custo do produto e frete",
            "Metas do mês que enchem conforme você vende",
          ]}
          destaque={
            <Destaque className="-left-2 top-24 sm:-left-24">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
                <IconMegaphone width={16} height={16} />
              </span>
              <span className="flex flex-col text-left">
                <span className="text-[13px] font-semibold">Meta batida</span>
                <span className="text-[12px] text-ink-muted">R$ 3.000 em vendas</span>
              </span>
            </Destaque>
          }
        >
          <TelaLucro />
        </Recurso>

        <section aria-labelledby="extras-titulo" className="bg-panel px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-[1024px]">
            <h2
              id="extras-titulo"
              className="mx-auto max-w-[640px] text-center text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
            >
              E tudo o que vem junto.
            </h2>
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EXTRAS.map((e) => (
                <li key={e.titulo} className="hairline rounded-3xl bg-surface p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                    {e.icone}
                  </span>
                  <h3 className="mt-4 text-[19px] font-semibold tracking-tight">{e.titulo}</h3>
                  <p className="mt-1 text-[15px] leading-[1.47] text-ink-muted">{e.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="app-titulo" className="px-5 py-20 text-center sm:py-28">
          <div className="mx-auto max-w-[720px]">
            <Icone tamanho={72} />
            <h2
              id="app-titulo"
              className="mt-6 text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
            >
              Sem loja de aplicativos.
              <br />
              <span className="text-ink-muted">Direto na tela de início.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[560px] text-[17px] leading-[1.47] text-ink-muted sm:text-[19px]">
              Abra o Marcon no navegador e toque em “Adicionar à tela de início”. Ele abre em tela cheia, como um app, e
              manda notificações.
            </p>
            <ol className="mx-auto mt-10 grid max-w-[640px] gap-3 text-left sm:grid-cols-3">
              {["Crie sua conta", "Cadastre o produto e as fotos", "Anuncie e registre a venda"].map((passo, i) => (
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
                <p className="mt-1 text-[15px] text-ink-muted">Para quem está começando.</p>
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
                <p className="mt-1 text-[15px] text-ink-muted">{PLANOS.marcon.resumo}</p>
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
            <h2
              id="perguntas-titulo"
              className="text-center text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
            >
              Perguntas frequentes
            </h2>
            <div className="hairline mt-10 overflow-hidden rounded-3xl bg-panel">
              {PERGUNTAS.map((q) => (
                <details key={q.p} className="group border-t border-line first:border-t-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                    {q.p}
                    <span
                      aria-hidden="true"
                      className="text-xl leading-none text-ink-faint transition group-open:rotate-45"
                    >
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
          <h2
            id="cta-titulo"
            className="mx-auto max-w-[800px] text-[40px] font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl"
          >
            Venda no Marketplace
            <br />
            com as contas em dia.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-xl font-medium text-ink-muted">
            Comece hoje. Leva menos de um minuto.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3.5">
            <Link
              href="/login?modo=signup"
              className="bg-brand-fill inline-flex items-center rounded-full px-6 py-3 text-[17px] font-semibold text-on-brand shadow-sm shadow-brand/30 transition active:scale-[0.98]"
            >
              Criar conta
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
            Marcon · Gestão para quem vende no Marketplace
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

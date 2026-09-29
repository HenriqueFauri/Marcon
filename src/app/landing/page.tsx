import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  IconAlert,
  IconBox,
  IconCart,
  IconCheck,
  IconReceipt,
  IconTruck,
  IconUsers,
  IconWallet,
  IconWhatsapp,
} from "@/components/icons";

export const metadata: Metadata = {
  title: { absolute: "Marcon — a loja inteira na palma da mão" },
  description: "Vendas, estoque, fiado e caixa. Tudo se atualiza sozinho, a cada venda.",
};

const NUMEROS = [
  { valor: "R$ 8.426", rotulo: "vendidos em setembro" },
  { valor: "36,8%", rotulo: "de margem no mês" },
  { valor: "2 toques", rotulo: "pra registrar uma venda" },
];

const SECOES = [
  { id: "vendas", rotulo: "Vendas" },
  { id: "estoque", rotulo: "Estoque" },
  { id: "fiado", rotulo: "Fiado" },
  { id: "caixa", rotulo: "Caixa" },
];

const EXTRAS: { icone: ReactNode; titulo: string; texto: string }[] = [
  {
    icone: <IconUsers width={20} height={20} />,
    titulo: "Clientes",
    texto: "Histórico de compras e o que cada um ainda deve, com o WhatsApp a um toque.",
  },
  {
    icone: <IconTruck width={20} height={20} />,
    titulo: "Fornecedores",
    texto: "Quem fornece o quê, com contato e anotações guardados num lugar só.",
  },
  {
    icone: <IconBox width={20} height={20} />,
    titulo: "Variações e fotos",
    texto: "Tamanho, cor, sabor: cada variação com o próprio estoque e a própria foto.",
  },
  {
    icone: <IconReceipt width={20} height={20} />,
    titulo: "Anúncios por canal",
    texto: "Preço e link de cada produto no Instagram, no marketplace ou na loja física.",
  },
  {
    icone: <IconAlert width={20} height={20} />,
    titulo: "Avisos no celular",
    texto: "Notificação no celular a cada venda registrada e a cada parcela recebida.",
  },
  {
    icone: <IconCheck width={20} height={20} />,
    titulo: "Metas do mês",
    texto: "Anéis de vendas e de lucro que enchem conforme o mês anda.",
  },
];

const PERGUNTAS = [
  {
    p: "Precisa instalar alguma coisa?",
    r: "Não. O Marcon abre no navegador do celular ou do computador. Se quiser, é só adicionar à tela de início: ele vira um app, com ícone e notificações.",
  },
  {
    p: "Funciona pra qualquer tipo de loja?",
    r: "Foi feito pra quem vende produto: loja de roupa, cosméticos, papelaria, doceria, revenda. Se você vende e precisa saber o que entrou, o que saiu e quem está devendo, serve.",
  },
  {
    p: "Posso vender fiado e parcelado?",
    r: "Pode. Na hora da venda você escolhe à vista, fiado ou parcelado. As parcelas vão sozinhas pra Contas a receber e você marca como pago quando o cliente acertar.",
  },
  {
    p: "Meus dados ficam seguros?",
    r: "Cada conta só enxerga os próprios dados, com regras de acesso no próprio banco de dados. Excluir um produto ou cliente nunca apaga o histórico financeiro.",
  },
  {
    p: "Dá pra usar no computador também?",
    r: "Dá. No computador o painel mostra mais coisas de uma vez, como a tabela de vendas e o que precisa de atenção. Tudo sincroniza entre os aparelhos.",
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

// Seção de recurso: texto de um lado, uma "tela" do app do outro. Alterna o
// lado a cada seção no desktop; no celular a tela vem sempre embaixo do texto.
function Recurso({
  id,
  rotulo,
  titulo,
  texto,
  pontos,
  invertido = false,
  fundo = "bg-surface",
  children,
}: {
  id: string;
  rotulo: string;
  titulo: ReactNode;
  texto: string;
  pontos: string[];
  invertido?: boolean;
  fundo?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`scroll-mt-11 px-5 py-20 sm:py-28 ${fundo}`}>
      <div className="mx-auto grid max-w-[1024px] items-center gap-12 lg:grid-cols-2 lg:gap-20">
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
        <div aria-hidden="true" className={`mx-auto w-full max-w-[400px] ${invertido ? "lg:order-1" : ""}`}>
          {children}
        </div>
      </div>
    </section>
  );
}

// Moldura das "telas" de exemplo: parece um card do próprio app.
function Tela({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-[36px] bg-canvas p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.25),inset_0_0_0_0.5px_var(--line)]">
      <p className="px-3 pb-2 pt-3 text-[22px] font-bold tracking-tight">{titulo}</p>
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

function TelaVendas() {
  return (
    <Tela titulo="Nova venda">
      <Lista>
        <Linha titulo="Vestido midi linho" sub="Areia · M" valor="R$ 189,90" />
        <Linha titulo="Brinco argola dourada" sub="2 × R$ 34,90" valor="R$ 69,80" />
        <Linha titulo="Bolsa palha" sub="Natural" valor="R$ 119,00" />
      </Lista>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-fill p-1 text-center text-[13px] font-medium">
        <span className="rounded-full bg-surface py-1.5 shadow-sm">Pix</span>
        <span className="py-1.5 text-ink-muted">Cartão</span>
        <span className="py-1.5 text-ink-muted">Fiado</span>
      </div>
      <div className="flex items-center justify-between px-3 pt-1">
        <span className="text-[15px] text-ink-muted">Total</span>
        <span className="text-[28px] font-bold tracking-tight tabular-nums">R$ 378,70</span>
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
        <span className="rounded-xl bg-tile-warning px-3 py-2 text-[13px] font-semibold text-on-tile-warning">5 acabando</span>
      </div>
      <Lista>
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-brand-tint text-brand-text"
          titulo="Vestido midi linho"
          sub="P 3 · M 1 · G 4"
          valor="8 un."
        />
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-warning-tint text-warning"
          titulo="Brinco argola dourada"
          sub="Mínimo 5"
          valor="2 un."
          valorTom="text-warning"
        />
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-danger-tint text-danger"
          titulo="Bolsa palha"
          sub="Última venda hoje, 14:32"
          valor="0 un."
          valorTom="text-danger"
        />
        <Linha
          icone={<IconBox width={16} height={16} />}
          tom="bg-brand-tint text-brand-text"
          titulo="Camisa oversized"
          sub="Branca · Preta"
          valor="21 un."
        />
      </Lista>
    </Tela>
  );
}

function TelaFiado() {
  return (
    <Tela titulo="Contas a receber">
      <div className="hairline rounded-3xl bg-surface px-4 py-4">
        <p className="text-[13px] text-ink-muted">Total a receber</p>
        <p className="text-[32px] font-bold tracking-tight tabular-nums">R$ 1.284,50</p>
        <p className="mt-1 text-[13px] font-semibold text-danger">R$ 210,00 em atraso</p>
      </div>
      <Lista>
        <Linha
          icone={<IconWhatsapp width={16} height={16} />}
          tom="bg-danger-tint text-danger"
          titulo="Juliana Prado"
          sub="Parcela 2/3 · venceu dia 20"
          valor="R$ 210,00"
          valorTom="text-danger"
        />
        <Linha
          icone={<IconWhatsapp width={16} height={16} />}
          tom="bg-warning-tint text-warning"
          titulo="Marcos Lima"
          sub="Fiado · vence amanhã"
          valor="R$ 86,00"
        />
        <Linha
          icone={<IconWhatsapp width={16} height={16} />}
          tom="bg-fill text-ink-muted"
          titulo="Ana Beatriz"
          sub="Parcela 1/4 · vence 12/10"
          valor="R$ 97,50"
        />
      </Lista>
    </Tela>
  );
}

function TelaCaixa() {
  const barras = [38, 52, 44, 70, 58, 86, 64];
  return (
    <Tela titulo="Fluxo de caixa">
      <div className="hairline rounded-3xl bg-surface px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-ink-muted">Saldo de setembro</p>
          <p className="text-[13px] font-semibold text-positive">+ R$ 1.940 de agosto</p>
        </div>
        <p className="text-[32px] font-bold tracking-tight tabular-nums">R$ 5.318,20</p>
        <div className="mt-4 flex h-24 items-end gap-2">
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
          sub="Hoje, 14:32 · Pix"
          valor="+ R$ 378,70"
          valorTom="text-positive"
        />
        <Linha
          icone={<IconWallet width={16} height={16} />}
          tom="bg-danger-tint text-danger"
          titulo="Aluguel"
          sub="Hoje · Despesa fixa"
          valor="− R$ 1.200,00"
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
        <section className="relative flex flex-col items-center overflow-hidden px-5 pb-[190px] pt-16 text-center">
          <div className="drop-shadow-[0_24px_40px_rgba(212,95,48,0.28)] drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)]">
            <Icone tamanho={148} brilho />
          </div>
          <p className="mt-6 text-[19px] font-semibold tracking-tight text-brand-text">Marcon</p>
          <h1 className="mt-[18px] max-w-[980px] text-[44px] font-bold leading-[1.02] tracking-[-0.05em] sm:text-7xl lg:text-[80px]">
            A loja inteira.
            <br />
            Na palma da mão.
          </h1>
          <p className="mt-4 max-w-[640px] text-xl font-medium leading-[1.35] tracking-[-0.015em] text-ink-muted sm:text-2xl">
            Vendas, estoque, fiado e caixa. Tudo se atualiza sozinho, a cada venda.
          </p>
          <div className="mt-8 flex items-center gap-3.5">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-[17px] font-medium text-surface transition active:scale-[0.98]"
            >
              Entrar
            </Link>
            <Link href="/login?modo=signup" className="text-[17px] font-medium text-brand-text hover:underline">
              Criar conta ›
            </Link>
          </div>

          <div
            aria-hidden="true"
            className="absolute -bottom-[170px] left-1/2 grid h-[300px] w-[min(900px,calc(100%-32px))] -translate-x-1/2 grid-cols-3 rounded-t-[48px] bg-panel px-4 pt-7 shadow-[inset_0_0.5px_0_var(--line)] sm:px-12"
          >
            {NUMEROS.map((n) => (
              <div key={n.valor} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-bold tabular-nums tracking-[-0.04em] sm:text-[40px]">{n.valor}</span>
                <span className="text-xs text-ink-muted sm:text-sm">{n.rotulo}</span>
              </div>
            ))}
          </div>
        </section>

        <Recurso
          id="vendas"
          rotulo="Vendas"
          fundo="bg-panel"
          titulo={
            <>
              Vendeu? Anotou.
              <br />
              Em dois toques.
            </>
          }
          texto="Escolha os produtos, a forma de pagamento e pronto. O estoque baixa, o caixa sobe e o lucro da venda aparece na hora."
          pontos={[
            "Pix, dinheiro, cartão, fiado ou parcelado",
            "Busca rápida por nome, cor ou tamanho",
            "Desconto e cliente opcionais, sem travar a venda",
          ]}
        >
          <TelaVendas />
        </Recurso>

        <Recurso
          id="estoque"
          rotulo="Estoque"
          invertido
          titulo={
            <>
              Saiba o que acabou
              <br />
              antes do cliente.
            </>
          }
          texto="Cada venda desconta do estoque sozinha, variação por variação. Quando algo chega no mínimo, aparece em destaque no Início."
          pontos={[
            "Estoque por tamanho, cor ou sabor",
            "Entrada de mercadoria com custo e fornecedor",
            "Margem de cada produto calculada pra você",
          ]}
        >
          <TelaEstoque />
        </Recurso>

        <Recurso
          id="fiado"
          rotulo="Fiado"
          fundo="bg-panel"
          titulo={
            <>
              O caderninho,
              <br />
              sem o caderninho.
            </>
          }
          texto="Venda fiado ou parcelado e deixe o Marcon lembrar. Você vê quem deve, quanto e desde quando, e cobra pelo WhatsApp num toque."
          pontos={[
            "Parcelas com vencimento, criadas na hora da venda",
            "Atrasados em destaque, com contador no Início",
            "Marcou como pago, entrou no caixa",
          ]}
        >
          <TelaFiado />
        </Recurso>

        <Recurso
          id="caixa"
          rotulo="Caixa"
          invertido
          titulo={
            <>
              Quanto entrou.
              <br />
              Quanto sobrou.
            </>
          }
          texto="Vendas e recebimentos entram no caixa sozinhos. Lance as despesas e veja o saldo do mês, já somando o que sobrou do mês anterior."
          pontos={[
            "Entradas e saídas mês a mês",
            "Despesas por categoria",
            "Lucro de verdade, descontando o custo dos produtos",
          ]}
        >
          <TelaCaixa />
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

        <section aria-labelledby="perguntas-titulo" className="bg-panel px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-[720px]">
            <h2
              id="perguntas-titulo"
              className="text-center text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-5xl"
            >
              Perguntas frequentes
            </h2>
            <div className="hairline mt-10 overflow-hidden rounded-3xl bg-surface">
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

        <section aria-labelledby="cta-titulo" className="px-5 py-24 text-center sm:py-32">
          <h2
            id="cta-titulo"
            className="mx-auto max-w-[800px] text-[40px] font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl"
          >
            Sua loja merece
            <br />
            mais que um caderno.
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
            Marcon · Gestão pra quem vende
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
          </nav>
        </div>
      </footer>
    </div>
  );
}

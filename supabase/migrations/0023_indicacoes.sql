-- Programa "Indique e ganhe": cada conta tem um link; quem se cadastra por ele e assina
-- gera 20% de comissão em cada mensalidade paga. O pagamento ao afiliado é manual (PIX).
--
-- Quem escreve é o servidor com a chave de serviço (webhook do Asaas, vínculo no cadastro
-- e painel do admin). O usuário só lê as próprias linhas e pede saque pela função
-- pedir_saque, que confere o saldo com a linha do afiliado travada.

create table afiliados (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[a-z0-9]{4,12}$'),
  chave_pix text,
  created_at timestamptz not null default now()
);

alter table afiliados enable row level security;

create policy "afiliados_select_own" on afiliados
  for select using (owner_id = auth.uid());
create policy "afiliados_insert_own" on afiliados
  for insert with check (owner_id = auth.uid());

-- quem indicou quem. Um indicado só tem um afiliado, e o vínculo não muda.
create table indicacoes (
  indicado_id uuid primary key references auth.users (id) on delete cascade,
  afiliado_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (indicado_id <> afiliado_id)
);

create index indicacoes_afiliado_idx on indicacoes (afiliado_id);

alter table indicacoes enable row level security;

create policy "indicacoes_select_own" on indicacoes
  for select using (afiliado_id = auth.uid());

-- uma linha por cobrança paga do indicado. O id da cobrança do Asaas é único: o webhook
-- pode repetir o evento sem gerar comissão em dobro.
create table comissoes (
  id uuid primary key default gen_random_uuid(),
  afiliado_id uuid not null references auth.users (id) on delete cascade,
  indicado_id uuid not null references auth.users (id) on delete cascade,
  asaas_payment_id text not null unique,
  valor_pago numeric(12, 2) not null,
  percentual numeric(5, 2) not null,
  valor numeric(12, 2) not null,
  -- só vira saldo depois da carência, para cobrir o prazo de estorno do cartão
  liberada_em timestamptz not null,
  estornada_em timestamptz,
  created_at timestamptz not null default now()
);

create index comissoes_afiliado_idx on comissoes (afiliado_id, created_at desc);

alter table comissoes enable row level security;

create policy "comissoes_select_own" on comissoes
  for select using (afiliado_id = auth.uid());

create table saques (
  id uuid primary key default gen_random_uuid(),
  afiliado_id uuid not null references auth.users (id) on delete cascade,
  valor numeric(12, 2) not null check (valor > 0),
  chave_pix text not null,
  status text not null default 'pedido' check (status in ('pedido', 'pago', 'recusado')),
  pedido_em timestamptz not null default now(),
  resolvido_em timestamptz
);

create index saques_afiliado_idx on saques (afiliado_id, pedido_em desc);
create index saques_pendentes_idx on saques (pedido_em) where status = 'pedido';

alter table saques enable row level security;

create policy "saques_select_own" on saques
  for select using (afiliado_id = auth.uid());

-- Pede o saque de todo o saldo disponível (comissões liberadas e não estornadas, menos
-- o que já foi pedido ou pago). Devolve o valor pedido.
create or replace function pedir_saque(p_chave text) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_chave text := btrim(coalesce(p_chave, ''));
  v_disponivel numeric(12, 2);
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.';
  end if;
  if char_length(v_chave) < 5 or char_length(v_chave) > 140 then
    raise exception 'Informe uma chave PIX válida.';
  end if;

  -- trava a linha do afiliado: dois pedidos ao mesmo tempo não gastam o mesmo saldo
  perform 1 from afiliados where owner_id = v_uid for update;
  if not found then
    raise exception 'Você ainda não tem link de indicação.';
  end if;

  select
    coalesce((select sum(valor) from comissoes
      where afiliado_id = v_uid and estornada_em is null and liberada_em <= now()), 0)
    - coalesce((select sum(valor) from saques
      where afiliado_id = v_uid and status in ('pedido', 'pago')), 0)
  into v_disponivel;

  if v_disponivel < 20 then
    raise exception 'O saque mínimo é R$ 20,00.';
  end if;

  insert into saques (afiliado_id, valor, chave_pix) values (v_uid, v_disponivel, v_chave);
  update afiliados set chave_pix = v_chave where owner_id = v_uid;

  return v_disponivel;
end;
$$;

revoke all on function pedir_saque(text) from public, anon;
grant execute on function pedir_saque(text) to authenticated;

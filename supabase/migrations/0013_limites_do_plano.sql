-- Limites do plano grátis, impostos no banco (quem chama a API direto também passa por aqui).
--
--  * teste (14 dias desde a criação da conta) e plano pago: sem limite de vendas e produtos;
--  * grátis (depois do teste, sem assinatura ativa): 30 vendas por mês, 50 produtos,
--    1 foto por produto e sem importar vendas/extrato de outro sistema.
--
-- Nada é apagado nem escondido: os gatilhos só barram NOVOS registros. Quem cai no
-- grátis com 80 produtos continua vendo os 80; só não cadastra o 81º.
-- Vendas contam pelo mês em que foram REGISTRADAS (fuso de Brasília), não pela data
-- digitada, para não dar para driblar o limite datando vendas para trás. Cancelar uma
-- venda não devolve a cota.

-- Depende da 0012 (coluna importado_ref). Sem ela os gatilhos abaixo quebrariam TODA venda
-- nova, então é melhor parar aqui com uma mensagem clara.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendas' and column_name = 'importado_ref'
  ) then
    raise exception 'Aplique a migration 0012 (importação) antes da 0013.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- qual é o plano de um usuário
-- ---------------------------------------------------------------------------
create or replace function plano_do_usuario(p_owner uuid) returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    -- atrasada ainda conta como paga: o Asaas tenta cobrar de novo antes de cancelar
    when exists (select 1 from assinaturas where owner_id = p_owner and status in ('ativa', 'atrasada')) then 'pago'
    when coalesce((select created_at from auth.users where id = p_owner), '-infinity'::timestamptz) + interval '14 days' > now() then 'teste'
    else 'gratis'
  end;
$$;

-- só os gatilhos e a função de uso (que rodam com privilégio do dono) chamam esta:
-- ela recebe o id de qualquer usuário, então não pode ficar aberta à API
revoke execute on function plano_do_usuario(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- limites de cada plano (única fonte da verdade; o app lê daqui)
-- ---------------------------------------------------------------------------
create or replace function limites_do_plano(p_plano text) returns jsonb
language sql
immutable
as $$
  select case
    when p_plano = 'gratis' then
      jsonb_build_object('vendas_mes', 30, 'produtos', 50, 'fotos_por_item', 1, 'importa_historico', false)
    else
      jsonb_build_object('vendas_mes', null, 'produtos', null, 'fotos_por_item', 10, 'importa_historico', true)
  end;
$$;

-- vendas registradas neste mês (fuso de Brasília)
create or replace function vendas_do_mes(p_owner uuid) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from vendas
  where owner_id = p_owner
    and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;

revoke execute on function vendas_do_mes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- gatilhos
-- ---------------------------------------------------------------------------
create or replace function aplicar_limites_venda() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_limites jsonb := limites_do_plano(plano_do_usuario(new.owner_id));
  v_max integer := (v_limites->>'vendas_mes')::integer;
begin
  if new.importado_ref is not null and not (v_limites->>'importa_historico')::boolean then
    raise exception 'Importar vendas de outro sistema faz parte do plano Marcon. No plano grátis dá para importar só os produtos.';
  end if;
  if v_max is not null and vendas_do_mes(new.owner_id) >= v_max then
    raise exception 'Você chegou ao limite de % vendas por mês do plano grátis. Assine o plano Marcon para vender sem limite.', v_max;
  end if;
  return new;
end;
$$;

create trigger vendas_limites_do_plano
  before insert on vendas
  for each row execute function aplicar_limites_venda();

create or replace function aplicar_limites_produto() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_max integer := (limites_do_plano(plano_do_usuario(new.owner_id))->>'produtos')::integer;
begin
  if v_max is not null and (select count(*) from produtos where owner_id = new.owner_id) >= v_max then
    raise exception 'Você chegou ao limite de % produtos do plano grátis. Assine o plano Marcon para cadastrar sem limite.', v_max;
  end if;
  return new;
end;
$$;

create trigger produtos_limites_do_plano
  before insert on produtos
  for each row execute function aplicar_limites_produto();

-- o teto de 10 fotos por produto e por variação vale para todos (migration 0011);
-- aqui só o limite menor do plano grátis
create or replace function aplicar_limites_foto() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_plano text := plano_do_usuario(new.owner_id);
  v_max integer := (limites_do_plano(v_plano)->>'fotos_por_item')::integer;
begin
  if v_plano = 'gratis' and (
    select count(*) from produto_fotos
    where produto_id = new.produto_id and variacao_id is not distinct from new.variacao_id
  ) >= v_max then
    raise exception 'No plano grátis cada produto tem % foto. Assine o plano Marcon para ter até 10.', v_max;
  end if;
  return new;
end;
$$;

create trigger produto_fotos_limites_do_plano
  before insert on produto_fotos
  for each row execute function aplicar_limites_foto();

create or replace function aplicar_limites_lancamento() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.importado_ref is not null and not (limites_do_plano(plano_do_usuario(new.owner_id))->>'importa_historico')::boolean then
    raise exception 'Importar o extrato de caixa de outro sistema faz parte do plano Marcon. No plano grátis dá para importar só os produtos.';
  end if;
  return new;
end;
$$;

create trigger lancamentos_caixa_limites_do_plano
  before insert on lancamentos_caixa
  for each row execute function aplicar_limites_lancamento();

-- ---------------------------------------------------------------------------
-- uso atual, para a tela mostrar "12 de 30 vendas este mês"
-- ---------------------------------------------------------------------------
create or replace function uso_do_plano() returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid := auth.uid();
  v_plano text;
begin
  if v_owner is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  v_plano := plano_do_usuario(v_owner);
  return jsonb_build_object(
    'plano', v_plano,
    'vendas_mes', vendas_do_mes(v_owner),
    'produtos', (select count(*) from produtos where owner_id = v_owner),
    'limites', limites_do_plano(v_plano)
  );
end;
$$;

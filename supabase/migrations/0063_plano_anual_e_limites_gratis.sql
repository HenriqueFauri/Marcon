-- Plano anual e novos limites do plano grátis (decisão de 2026-10-24).
--
-- 1. assinaturas.ciclo: 'mensal' (R$ 15,90 por mês) ou 'anual' (R$ 149 por ano), os dois no cartão pelo
--    Asaas. As assinaturas que já existem eram todas mensais e ficam 'mensal' pelo default.
-- 2. Plano grátis: 20 vendas por mês e 30 produtos (antes 30 e 50). Fotos (3), IA (10 por mês) e
--    importar histórico (não) continuam iguais. O pago não muda.
--
-- Quem já passou do limite novo não perde nada: os gatilhos da 0013 (aplicar_limites_venda e
-- aplicar_limites_produto) só rodam em INSERT e comparam a contagem atual com o limite. Uma conta grátis
-- com 45 produtos continua vendo, editando e vendendo os 45; só não cadastra o 46º até assinar ou ficar
-- abaixo de 30. Vendas: quem já registrou 25 neste mês só não registra a 26ª até o mês virar.
-- Os gatilhos leem o limite desta função, então basta trocá-la. Idempotente.

alter table assinaturas add column if not exists ciclo text not null default 'mensal';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assinaturas_ciclo_check') then
    alter table assinaturas add constraint assinaturas_ciclo_check check (ciclo in ('mensal', 'anual'));
  end if;
end;
$$;

-- create or replace troca a definição inteira, inclusive o search_path da 0035: por isso ele vem de novo aqui
create or replace function limites_do_plano(p_plano text) returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_plano = 'gratis' then
      jsonb_build_object('vendas_mes', 20, 'produtos', 30, 'fotos_por_item', 3, 'importa_historico', false, 'ia_mes', 10)
    else
      jsonb_build_object('vendas_mes', null, 'produtos', null, 'fotos_por_item', 10, 'importa_historico', true, 'ia_mes', 30)
  end;
$$;

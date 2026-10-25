-- Quem cancela mantém o plano até o fim do período já pago, no mensal e no anual (decisão do dono, 2026-10-24).
-- A assinatura cancelada guarda proximo_vencimento: é o dia da cobrança que não vai mais acontecer,
-- então o plano vale até esse dia, ele incluído. Cancelada sem data (nunca paga) ou com data passada: grátis.
-- Assinou de novo antes do fim: a linha volta a pendente com o mesmo proximo_vencimento e segue liberada até lá.
-- (pendente comum tem proximo_vencimento nulo e não muda.) Idempotente.

create or replace function plano_do_usuario(p_owner uuid) returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when exists (
      select 1 from assinaturas
      where owner_id = p_owner
        and (
          status in ('ativa', 'atrasada')
          or (
            status = 'cortesia'
            and (cortesia_ate is null or cortesia_ate >= (now() at time zone 'America/Sao_Paulo')::date)
          )
          or (
            status in ('cancelada', 'pendente')
            and proximo_vencimento is not null
            and proximo_vencimento >= (now() at time zone 'America/Sao_Paulo')::date
          )
        )
    ) then 'pago'
    when coalesce((select created_at from auth.users where id = p_owner), '-infinity'::timestamptz) + interval '14 days' > now() then 'teste'
    else 'gratis'
  end;
$$;

revoke execute on function plano_do_usuario(uuid) from public, anon, authenticated;

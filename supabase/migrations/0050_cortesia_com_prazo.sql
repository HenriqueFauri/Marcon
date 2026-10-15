-- Cortesia com prazo, motivo e histórico (antes ela valia para sempre e sem explicação).
--
-- cortesia_ate: último dia em que a cortesia vale, contando o dia em que foi dada (7 dias dados
--   hoje vencem daqui a 6 dias). Nulo = cortesia antiga, sem prazo (as que já existiam).
-- cortesia_motivo: etiqueta para saber depois quem ganhou e por quê.
-- cortesia_por e cortesia_em: quem deu e quando.
-- A regra de limites (plano_do_usuario) olha o prazo: vencida, a conta deixa de valer como plano
-- pago na hora, mesmo antes da rotina diária marcar a assinatura como cancelada.

alter table assinaturas
  add column cortesia_ate date,
  add column cortesia_motivo text,
  add column cortesia_por uuid references auth.users (id) on delete set null,
  add column cortesia_em timestamptz,
  add constraint assinaturas_cortesia_motivo_check
    check (cortesia_motivo is null or cortesia_motivo in ('parceiro', 'influenciador', 'indicacao', 'suporte', 'outro'));

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
        )
    ) then 'pago'
    when coalesce((select created_at from auth.users where id = p_owner), '-infinity'::timestamptz) + interval '14 days' > now() then 'teste'
    else 'gratis'
  end;
$$;

revoke execute on function plano_do_usuario(uuid) from public, anon, authenticated;

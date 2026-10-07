-- Fecha o /rest/v1/rpc para quem não está logado (lint anon_security_definer_function_executable).
-- No Supabase toda função nova nasce com execute para public e anon. Estas são security definer
-- e só fazem sentido para usuário logado, então anon perde o acesso.
-- Ficam de fora, de propósito, as públicas da loja e do recibo: recibo_publico, vitrine_publica,
-- vitrine_banner, validar_cupom_vitrine, registrar_evento_vitrine.

-- Chamadas pelo app via supabase.rpc com a sessão do usuário: só authenticated (e service_role).
revoke execute on function ajustar_estoque(uuid, uuid, integer, text) from public, anon;
grant execute on function ajustar_estoque(uuid, uuid, integer, text) to authenticated, service_role;

revoke execute on function cancelar_venda(uuid) from public, anon;
grant execute on function cancelar_venda(uuid) to authenticated, service_role;

revoke execute on function excluir_produto(uuid, boolean) from public, anon;
grant execute on function excluir_produto(uuid, boolean) to authenticated, service_role;

revoke execute on function pagar_parcela(uuid, date) from public, anon;
grant execute on function pagar_parcela(uuid, date) to authenticated, service_role;

revoke execute on function registrar_entrada_estoque(uuid, uuid, integer, numeric, date, text, text, uuid, boolean) from public, anon;
grant execute on function registrar_entrada_estoque(uuid, uuid, integer, numeric, date, text, text, uuid, boolean) to authenticated, service_role;

revoke execute on function registrar_saida_estoque(uuid, uuid, integer, text, date, text) from public, anon;
grant execute on function registrar_saida_estoque(uuid, uuid, integer, text, date, text) to authenticated, service_role;

revoke execute on function registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric) from public, anon;
grant execute on function registrar_venda(uuid, text, jsonb, numeric, venda_tipo_pagamento, text, text, integer, date, date, uuid, uuid, numeric) to authenticated, service_role;

revoke execute on function uso_do_plano() from public, anon;
grant execute on function uso_do_plano() to authenticated, service_role;

-- Funções de gatilho dos limites do plano: ninguém chama pela API. O Postgres só confere
-- execute ao criar o gatilho, não quando ele dispara, então os limites continuam valendo.
revoke execute on function aplicar_limites_foto() from public, anon, authenticated;
revoke execute on function aplicar_limites_ia() from public, anon, authenticated;
revoke execute on function aplicar_limites_lancamento() from public, anon, authenticated;
revoke execute on function aplicar_limites_produto() from public, anon, authenticated;
revoke execute on function aplicar_limites_venda() from public, anon, authenticated;

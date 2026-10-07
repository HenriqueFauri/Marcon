-- Aviso do advisor de segurança do Supabase (function_search_path_mutable): 9 funções não fixavam o
-- search_path, então o schema usado para achar tabelas e funções dependia de quem chamava.
-- Nenhuma é SECURITY DEFINER e todas só usam funções nativas e tabelas do schema public.

alter function limitar_fotos_produto() set search_path = public;
alter function limites_do_plano(text) set search_path = public;
alter function validar_foto_variacao() set search_path = public;
alter function normalizar_nome(text) set search_path = public;
alter function hoje_br() set search_path = public;
alter function caminho_do_dono(text, uuid) set search_path = public;
alter function caminhos_do_dono(text[], uuid) set search_path = public;
alter function manter_created_at() set search_path = public;
alter function novo_codigo_afiliado() set search_path = public;

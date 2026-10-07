-- Vitrine, banner principal: até 3 imagens em carrossel, com título, subtítulo e botão opcionais.
-- As imagens ficam num bucket privado (uma pasta por dono, como logo-empresa) e a loja pública
-- recebe links curtos assinados pelo servidor. O banner sai por uma função própria, para não
-- mexer em vitrine_publica.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vitrine-banner', 'vitrine-banner', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "vitrine_banner_storage_owner" on storage.objects;
create policy "vitrine_banner_storage_owner" on storage.objects
  for all using (
    bucket_id = 'vitrine-banner' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'vitrine-banner' and (storage.foldername(name))[1] = auth.uid()::text
  );

alter table vitrines
  add column if not exists banner_paths text[] not null default '{}' check (cardinality(banner_paths) <= 3),
  add column if not exists banner_titulo text check (char_length(banner_titulo) <= 60),
  add column if not exists banner_subtitulo text check (char_length(banner_subtitulo) <= 120),
  add column if not exists banner_botao text check (char_length(banner_botao) <= 24);

-- Banner de uma vitrine no ar, sem login. Mesma regra de vitrine_publica: loja ligada e
-- dono no teste ou no plano pago. Devolve null caso contrário.
create or replace function vitrine_banner(p_slug text) returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'paths', to_jsonb(vt.banner_paths),
    'titulo', vt.banner_titulo,
    'subtitulo', vt.banner_subtitulo,
    'botao', vt.banner_botao
  )
  from vitrines vt
  where vt.slug = lower(p_slug)
    and vt.ativa
    and plano_do_usuario(vt.owner_id) in ('pago', 'teste');
$$;

revoke execute on function vitrine_banner(text) from public;
grant execute on function vitrine_banner(text) to anon, authenticated;

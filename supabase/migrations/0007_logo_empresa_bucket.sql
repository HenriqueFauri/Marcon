-- Bucket para o logo da empresa (aparece no cabeçalho de recibos, quando essa
-- feature existir). Mesmo padrão de "produto-fotos": privado, uma pasta por
-- dono, acesso via signed URL.
insert into storage.buckets (id, name, public)
values ('logo-empresa', 'logo-empresa', false)
on conflict (id) do nothing;

create policy "logo_empresa_storage_owner" on storage.objects
  for all using (
    bucket_id = 'logo-empresa' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'logo-empresa' and (storage.foldername(name))[1] = auth.uid()::text
  );

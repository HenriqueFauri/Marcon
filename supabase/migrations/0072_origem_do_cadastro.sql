-- De onde veio cada cadastro: marcas do link (utm e código de indicação) e a resposta opcional
-- "como conheceu". Uma linha por conta. Só o servidor com a chave de serviço lê e escreve
-- (as ações pegam o dono da sessão; o admin lê no painel).

create table cadastro_origem (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  utm_source text check (char_length(utm_source) <= 60),
  utm_medium text check (char_length(utm_medium) <= 60),
  utm_campaign text check (char_length(utm_campaign) <= 60),
  ref text check (char_length(ref) <= 12),
  como_conheceu text check (como_conheceu in ('instagram', 'tiktok', 'youtube', 'grupo', 'indicacao', 'google', 'outro')),
  criado_em timestamptz not null default now()
);

alter table cadastro_origem enable row level security;
-- sem policies de propósito
revoke all on table cadastro_origem from anon, authenticated;

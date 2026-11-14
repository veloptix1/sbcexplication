-- AppForge : tables des boutiques publiées.
-- À coller dans Supabase > SQL Editor > Run. Le serveur utilise la clé « service_role » (jamais dans le navigateur).

create table if not exists shops (
  slug        text primary key,
  owner_hash  text   not null,
  project     jsonb  not null,
  order_seq   int    not null default 0,
  rev         int    not null default 1,
  created_at  bigint not null,
  updated_at  bigint not null
);

create table if not exists customers (
  id          text primary key,
  slug        text   not null references shops(slug) on delete cascade,
  name        text   not null,
  phone       text   not null,
  pass_hash   text   not null,
  created_at  bigint not null,
  unique (slug, phone)
);

create table if not exists orders (
  id             text primary key,
  slug           text   not null references shops(slug) on delete cascade,
  number         int    not null,
  customer_id    text,
  status         text   not null,
  payment_status text   not null,
  created_at     bigint not null,
  data           jsonb  not null,
  unique (slug, number)
);
create index if not exists orders_slug_number on orders (slug, number desc);
create index if not exists orders_customer on orders (slug, customer_id);

-- Sécurité : aucune lecture publique. Seule la clé service_role (côté serveur) passe outre le RLS.
alter table shops     enable row level security;
alter table customers enable row level security;
alter table orders    enable row level security;

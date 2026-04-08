-- ═══════════════════════════════════════════════════════
--  app_settings — global branding & theme config (1 row)
-- ═══════════════════════════════════════════════════════
create table if not exists public.app_settings (
  id           uuid primary key default gen_random_uuid(),
  logo_url     text,
  theme        text    not null default 'dark_indigo',
  font_family  text    not null default 'Outfit',
  font_size    text    not null default 'md',
  nav_icons    jsonb   not null default '{}',
  updated_at   timestamptz not null default now()
);

-- Seed one row so there is always a record to UPDATE
insert into public.app_settings (theme, font_family, font_size, nav_icons)
values ('dark_indigo', 'Outfit', 'md', '{}')
on conflict do nothing;

-- RLS: all authenticated users can read; only superadmin can write
alter table public.app_settings enable row level security;

create policy "app_settings_read"
  on public.app_settings for select
  using (auth.role() = 'authenticated');

create policy "app_settings_write"
  on public.app_settings for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'superadmin'
    )
  );

-- ShiftPay: database schema + row level security
-- Run this once in your Supabase project's SQL editor (Project > SQL Editor > New query).

create table if not exists employers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('DPP', 'DPČ')),
  rate numeric not null,
  track_tips boolean not null default true,
  monthly_limit numeric,
  created_at timestamptz not null default now()
);

create table if not exists shift_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_time text not null,
  end_time text not null,
  pause_min int not null default 0,
  surcharge_pct numeric not null default 0,
  icon text not null default 'Sun',
  created_at timestamptz not null default now()
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employer_id uuid not null references employers(id) on delete cascade,
  shift_type_id uuid not null references shift_types(id) on delete cascade,
  shift_date date not null,
  tip numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table employers enable row level security;
alter table shift_types enable row level security;
alter table shifts enable row level security;

create policy "employers: owner select" on employers for select using (auth.uid() = user_id);
create policy "employers: owner insert" on employers for insert with check (auth.uid() = user_id);
create policy "employers: owner update" on employers for update using (auth.uid() = user_id);
create policy "employers: owner delete" on employers for delete using (auth.uid() = user_id);

create policy "shift_types: owner select" on shift_types for select using (auth.uid() = user_id);
create policy "shift_types: owner insert" on shift_types for insert with check (auth.uid() = user_id);
create policy "shift_types: owner update" on shift_types for update using (auth.uid() = user_id);
create policy "shift_types: owner delete" on shift_types for delete using (auth.uid() = user_id);

create policy "shifts: owner select" on shifts for select using (auth.uid() = user_id);
create policy "shifts: owner insert" on shifts for insert with check (auth.uid() = user_id);
create policy "shifts: owner update" on shifts for update using (auth.uid() = user_id);
create policy "shifts: owner delete" on shifts for delete using (auth.uid() = user_id);

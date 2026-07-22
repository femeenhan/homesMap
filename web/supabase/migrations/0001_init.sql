create extension if not exists pgcrypto;

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  emoji text not null default '🧑',
  color text not null default '#4a7fa5',
  role text not null default 'member' check (role in ('owner','member')),
  wrapped_family_key text,          -- 패스프레이즈로 래핑된 FDK {salt,iv,ct}
  joined_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16),'hex'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null, x int not null, y int not null, w int not null, h int not null,
  color_index int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table storages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null, name text not null, x int not null, y int not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  storage_id uuid not null references storages(id) on delete cascade,
  enc_name text not null,           -- 암호블롭 {iv,ct}
  enc_memo text,                    -- 암호블롭 or null
  emoji text not null default '📦',
  photo_path text,                  -- 암호화 사진 경로 or null
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  kind text not null,
  enc_payload text not null,        -- 암호블롭(물건 이름 등 포함)
  created_at timestamptz not null default now()
);

create index on rooms(family_id);
create index on storages(family_id);
create index on items(family_id);
create index on items(storage_id);
create index on activity(family_id, created_at desc);

create or replace function is_family_member(fid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

-- 비멤버가 초대 토큰으로 가족 id/이름만 확인(멤버십 삽입은 클라이언트가 RLS로)
create or replace function get_invite_family(p_token text)
returns table(family_id uuid, family_name text)
language sql security definer set search_path = public as $$
  select f.id, f.name from family_invites i join families f on f.id = i.family_id
  where i.token = p_token and i.expires_at > now();
$$;

-- 초대 토큰 검증 후 멤버 추가. 비멤버는 fm_insert 정책에 막히므로 참여는 이 RPC로만 가능
create or replace function join_family(p_token text, p_display_name text, p_wrapped_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from family_invites where token = p_token and expires_at > now();
  if v_family is null then raise exception 'invalid or expired invite'; end if;
  insert into family_members(family_id, user_id, display_name, wrapped_family_key)
    values (v_family, auth.uid(), p_display_name, p_wrapped_key)
    on conflict (family_id, user_id) do update set wrapped_family_key = excluded.wrapped_family_key;
  return v_family;
end; $$;

alter table families        enable row level security;
alter table family_members  enable row level security;
alter table family_invites  enable row level security;
alter table rooms           enable row level security;
alter table storages        enable row level security;
alter table items           enable row level security;
alter table activity        enable row level security;

-- 생성 직후 insert().select() 반환 시점엔 아직 멤버 행이 없어 생성자 예외 필요
create policy fam_select on families for select using (is_family_member(id) or created_by = auth.uid());
create policy fam_insert on families for insert with check (created_by = auth.uid());
create policy fam_update on families for update using (is_family_member(id));

create policy fm_select on family_members for select using (is_family_member(family_id));
-- 직접 insert는 '내가 만든 가족에 내 행'(생성자 owner 행)만. 초대 참여는 join_family RPC(definer) 경유 —
-- user_id 체크만 두면 인증 유저가 임의 가족에 self-join 가능해지는 보안 홀
create policy fm_insert on family_members for insert with check (
  user_id = auth.uid() and exists (select 1 from families f where f.id = family_id and f.created_by = auth.uid())
);
create policy fm_update on family_members for update using (user_id = auth.uid());
create policy fm_delete on family_members for delete using (user_id = auth.uid());

create policy inv_all on family_invites for all
  using (is_family_member(family_id)) with check (is_family_member(family_id));

create policy rooms_all    on rooms    for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy storages_all on storages for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy items_all    on items    for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy activity_all on activity for all using (is_family_member(family_id)) with check (is_family_member(family_id));

-- Storage policy for item-photos bucket (requires item-photos bucket to exist in Supabase)
create policy photos_rw on storage.objects for all
  using (bucket_id = 'item-photos' and is_family_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'item-photos' and is_family_member(((storage.foldername(name))[1])::uuid));

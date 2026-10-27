-- ─────────────────────────────────────────────────────────────────
-- 001_accounts.sql — 아이디·비밀번호를 한 표(accounts)에 둔다. 일반 · 관리자 둘 다.
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 파일 내용을 붙여 넣고 Run. 한 번이면 된다.
--       (여러 번 실행해도 안전하다 — 이미 있는 것은 건너뛴다)
--
-- 무엇이 바뀌나
--   · public.accounts 한 표에 계정이 모인다.
--       username       로그인 아이디
--       password_hash  비밀번호 — **원문이 아니라 해시**로만 둔다(scrypt).
--                      원문을 두면 이 표를 볼 수 있는 사람이 모든 비밀번호를 읽게 된다.
--                      비밀번호를 잊으면 관리자 화면에서 새로 정해 준다.
--       role           'user'(일반) · 'admin'(관리자)
--   · 예전 계정(profiles · admins · Supabase Auth)은 그대로 옮겨 온다.
--     옮겨 온 계정은 **지금 쓰던 비밀번호 그대로** 로그인된다 — 첫 로그인 때
--     Supabase Auth 로 한 번 확인한 뒤 이 표의 해시로 바꿔 둔다.
--   · 예전 표(profiles · admins)는 지우지 않는다. 확인이 끝나면 따로 지워도 된다.
--
-- 누가 읽나
--   RLS 를 켜고 정책을 하나도 두지 않는다. 브라우저가 가진 publishable key 로는
--   이 표에 손도 못 댄다. 서버(secret key)만 읽고 쓴다.
-- ─────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  username       text not null,
  username_key   text generated always as (lower(username)) stored,
  password_hash  text not null,
  name           text not null default '',
  email          text,
  email_key      text generated always as (lower(nullif(email, ''))) stored,
  role           text not null default 'user' check (role in ('user', 'admin')),
  active         boolean not null default true,
  legacy_email   text,          -- 옮겨 온 계정의 예전 로그인 이메일 (첫 로그인 확인용)
  auth_user_id   uuid,          -- 옮겨 온 계정의 예전 Supabase Auth id
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

create unique index if not exists accounts_username_key_idx on public.accounts (username_key);
create unique index if not exists accounts_email_key_idx on public.accounts (email_key)
  where email_key is not null;

alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;

-- 접속 이력 — 없으면 만들고, 있으면 계정 번호 칸만 더한다
create table if not exists public.login_history (
  id          bigserial primary key,
  user_id     uuid,
  email       text,
  username    text,
  event       text not null,
  ok          boolean not null default true,
  reason      text,
  user_agent  text,
  ip          text,
  at          timestamptz not null default now()
);
alter table public.login_history add column if not exists account_id uuid;
create index if not exists login_history_at_idx on public.login_history (at desc);
alter table public.login_history enable row level security;
revoke all on public.login_history from anon, authenticated;

-- 예전 계정 옮기기 (profiles · admins 가 있을 때만)
-- (없는 표를 가리키면 실행 전에 오류가 나므로 글로 만들어 돌린다)
do $$
declare
  role_expr text := '''user''';
begin
  if to_regclass('public.admins') is not null then
    role_expr := 'case when exists (select 1 from public.admins a where a.user_id = u.id) '
                 'then ''admin'' else ''user'' end';
  end if;
  -- 아이디(profiles)가 있던 계정
  if to_regclass('public.profiles') is not null then
    execute format($q$
      insert into public.accounts
        (username, password_hash, name, email, role, legacy_email, auth_user_id, created_at)
      select p.username,
             'supabase-auth',               -- 첫 로그인 때 확인하고 해시로 바꾼다
             coalesce(p.name, ''),
             coalesce(nullif(p.email, ''), u.email),
             %s,
             u.email,
             u.id,
             u.created_at
      from public.profiles p
      join auth.users u on u.id = p.user_id
      where p.username is not null and p.username <> ''
      on conflict do nothing
    $q$, role_expr);
  end if;
  -- 아이디 없이 이메일로만 쓰던 계정 — 이메일을 그대로 아이디로
  execute format($q$
    insert into public.accounts
      (username, password_hash, name, email, role, legacy_email, auth_user_id, created_at)
    select u.email,
           'supabase-auth',
           coalesce(u.raw_user_meta_data->>'name', ''),
           u.email,
           %s,
           u.email,
           u.id,
           u.created_at
    from auth.users u
    where u.email is not null
      and not exists (select 1 from public.accounts x where x.auth_user_id = u.id)
    on conflict do nothing
  $q$, role_expr);
end $$;

-- 확인
select username, name, email, role, active,
       case when password_hash = 'supabase-auth' then '첫 로그인 때 옮김' else '해시' end as pw
from public.accounts
order by created_at;

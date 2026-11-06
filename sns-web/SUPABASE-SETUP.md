# Supabase 설정 (무료)

1. https://supabase.com 에서 가입 → New project (Free).
2. 왼쪽 SQL Editor에 아래를 붙여넣고 Run:

```sql
create table public.pairing (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  token text not null check (token ~ '^[0-9a-f]{32}$')
);
alter table public.pairing enable row level security;
create policy "own select" on public.pairing for select using (auth.uid() = user_id);
create policy "own insert" on public.pairing for insert with check (auth.uid() = user_id);
create policy "own update" on public.pairing for update using (auth.uid() = user_id);
create policy "own delete" on public.pairing for delete using (auth.uid() = user_id);
```

3. Authentication → Sign In / Providers → Email 가 켜져 있는지 확인.
   (가입 때 확인 메일 없이 바로 쓰려면 "Confirm email"을 끕니다.)
4. Authentication → URL Configuration 의 Site URL 을 https://sns-sns-web.vercel.app 로 설정.
5. Project Settings → API 에서 Project URL 과 anon public key 를 복사해
   index.html 의 `const SB_URL = ""`, `SB_KEY = ""` 에 넣고 GitHub에 올립니다.
   (anon key 는 공개되어도 되는 키이며, 위 정책 때문에 각자 자기 행만 읽고 쓸 수 있습니다. service_role 키는 절대 넣지 마세요.)

-- 관리자 계정: 아이디 test1234 / 비밀번호 12345678
-- Supabase Auth는 이메일이 필요하므로 test1234@omr.local 로 저장합니다.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
  admin_email text := 'test1234@omr.local';
  admin_password text := '12345678';
begin
  if exists (select 1 from auth.users where id = admin_id or email = admin_email) then
    update auth.users
    set
      email = admin_email,
      encrypted_password = extensions.crypt(admin_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = '{"username":"test1234"}'::jsonb,
      updated_at = now()
    where id = admin_id or email = admin_email;
  else
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      admin_id,
      'authenticated',
      'authenticated',
      admin_email,
      extensions.crypt(admin_password, extensions.gen_salt('bf')),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"test1234"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  end if;

  if not exists (
    select 1 from auth.identities
    where user_id = admin_id and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      admin_id,
      admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', admin_email),
      'email',
      admin_id::text,
      now(),
      now(),
      now()
    );
  end if;
end
$$;

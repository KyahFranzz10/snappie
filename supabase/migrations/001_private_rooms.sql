-- Apply once using Supabase SQL editor / supabase db push.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 60),
 host_id uuid not null references auth.users(id) on delete cascade,
 secret_hash text not null,
 passcode_hash text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '30 minutes',
 closed boolean not null default false
);
create table public.room_members (
 room_id uuid not null references public.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 nickname text not null check (char_length(nickname) between 1 and 24),
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
create index on public.room_members(user_id);
create index on public.rooms(expires_at);
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
-- No direct table writes or reads. All room access goes through scoped RPCs.
revoke all on public.rooms, public.room_members from anon, authenticated;

create function public.is_room_member(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.room_members m join public.rooms r on r.id=m.room_id
 where m.room_id=p_id and m.user_id=auth.uid() and not r.closed and r.expires_at>now());
$$;

create function public.create_room(p_name text,p_nickname text,p_secret text,p_passcode text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in anonymously first.'; end if;
 if char_length(p_secret)<>64 or p_secret !~ '^[a-f0-9]+$' then raise exception 'Invalid invitation key.'; end if;
 if char_length(p_passcode)>64 then raise exception 'Passcode must be at most 64 characters.'; end if;
 -- Bound active rooms per identity. Production must also enable Auth CAPTCHA and edge rate limits.
 if (select count(*) from public.rooms where host_id=auth.uid() and not closed and expires_at>now())>=3 then
  raise exception 'You already have three active rooms. Close one or wait for it to expire.';
 end if;
 insert into public.rooms(name,host_id,secret_hash,passcode_hash)
 values(trim(p_name),auth.uid(),encode(extensions.digest(p_secret,'sha256'),'hex'),
 case when p_passcode='' then null else extensions.crypt(p_passcode,extensions.gen_salt('bf')) end) returning id into rid;
 insert into public.room_members(room_id,user_id,nickname) values(rid,auth.uid(),trim(p_nickname));
 return rid;
end; $$;

create function public.preview_room(p_id uuid,p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
 if auth.uid() is null then raise exception 'Sign in anonymously first.'; end if;
 select * into r from public.rooms where id=p_id and secret_hash=encode(extensions.digest(p_secret,'sha256'),'hex') and not closed and expires_at>now();
 if not found then raise exception 'This invitation is invalid, closed, or expired. Ask your host for a new room.'; end if;
 return jsonb_build_object('name',r.name,'locked',r.passcode_hash is not null);
end; $$;

create function public.join_room(p_id uuid,p_secret text,p_passcode text,p_nickname text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
 if auth.uid() is null then raise exception 'Sign in anonymously first.'; end if;
 -- Row lock serializes capacity checks so concurrent joins cannot exceed two participants.
 select * into r from public.rooms where id=p_id for update;
 if not found or r.closed or r.expires_at<=now() or p_secret is null or r.secret_hash<>encode(extensions.digest(p_secret,'sha256'),'hex') then
  raise exception 'This invitation is invalid, closed, or expired.';
 end if;
 if r.passcode_hash is not null and (p_passcode is null or extensions.crypt(p_passcode,r.passcode_hash)<>r.passcode_hash) then raise exception 'That room passcode does not match.'; end if;
 if not exists(select 1 from public.room_members where room_id=p_id and user_id=auth.uid()) and
 (select count(*) from public.room_members where room_id=p_id)>=2 then raise exception 'This booth already has two people.'; end if;
 insert into public.room_members(room_id,user_id,nickname) values(p_id,auth.uid(),trim(p_nickname))
 on conflict(room_id,user_id) do update set nickname=excluded.nickname;
end; $$;

create function public.room_status(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.is_room_member(p_id) then raise exception 'This room has expired, closed, or you have not joined. Open your invitation to join.'; end if;
 select jsonb_build_object('id',r.id,'name',r.name,'host_id',r.host_id,'closed',r.closed,'expires_at',r.expires_at,
 'members',(select jsonb_agg(jsonb_build_object('user_id',m.user_id,'nickname',m.nickname)) from public.room_members m where m.room_id=r.id))
 into result from public.rooms r where r.id=p_id;
 return result;
end; $$;

create function public.heartbeat_room(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_room_member(p_id) then raise exception 'This room has expired or closed.'; end if;
 update public.rooms set expires_at=now()+interval '30 minutes' where id=p_id;
 return public.room_status(p_id);
end; $$;

create function public.close_room(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 update public.rooms set closed=true, expires_at=now() where id=p_id and host_id=auth.uid();
 if not found then raise exception 'Only the host can close this room.'; end if;
end; $$;

-- Only a live room's two authorized anonymous identities can use its private topic.
create function public.authorized_room_topic(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
 if topic !~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return public.is_room_member(substring(topic from 6)::uuid);
end; $$;
create policy "Room members receive private messages" on realtime.messages for select to authenticated
 using (public.authorized_room_topic(realtime.topic()));
create policy "Room members send private messages" on realtime.messages for insert to authenticated
 with check (public.authorized_room_topic(realtime.topic()));

revoke execute on function public.is_room_member(uuid),public.authorized_room_topic(text),public.create_room(text,text,text,text),public.preview_room(uuid,text),public.join_room(uuid,text,text,text),public.room_status(uuid),public.heartbeat_room(uuid),public.close_room(uuid) from public,anon;
grant execute on function public.is_room_member(uuid),public.authorized_room_topic(text),public.create_room(text,text,text,text),public.preview_room(uuid,text),public.join_room(uuid,text,text,text),public.room_status(uuid),public.heartbeat_room(uuid),public.close_room(uuid) to authenticated;

-- Expiry is enforced on every RPC / channel admission even without cron.
-- For data retention, enable pg_cron and schedule (as postgres):
-- select cron.schedule('snapbooth-cleanup','*/10 * * * *',
--   $$delete from public.rooms where expires_at < now() - interval '1 day'$$);

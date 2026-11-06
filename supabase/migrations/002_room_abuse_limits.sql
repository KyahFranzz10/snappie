begin;

alter table public.rooms
 add column passcode_failures integer not null default 0,
 add column passcode_window_start timestamptz;
create index on public.rooms(host_id, created_at);

create or replace function public.create_room(p_name text,p_nickname text,p_secret text,p_passcode text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in anonymously first.'; end if;
 if char_length(p_secret)<>64 or p_secret !~ '^[a-f0-9]+$' then raise exception 'Invalid invitation key.'; end if;
 if char_length(p_passcode)>64 then raise exception 'Passcode must be at most 64 characters.'; end if;
 -- Serialize creation across requests made by the same identity.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
 if (select count(*) from public.rooms where host_id=auth.uid() and created_at>now()-interval '10 minutes')>=6 then
  raise exception 'Too many rooms created. Wait a few minutes and try again.';
 end if;
 if (select count(*) from public.rooms where host_id=auth.uid() and not closed and expires_at>now())>=3 then
  raise exception 'You already have three active rooms. Close one or wait for it to expire.';
 end if;
 insert into public.rooms(name,host_id,secret_hash,passcode_hash)
 values(trim(p_name),auth.uid(),encode(extensions.digest(p_secret,'sha256'),'hex'),
 case when p_passcode='' then null else extensions.crypt(p_passcode,extensions.gen_salt('bf')) end) returning id into rid;
 insert into public.room_members(room_id,user_id,nickname) values(rid,auth.uid(),trim(p_nickname));
 return rid;
end; $$;

drop function public.join_room(uuid,text,text,text);
create function public.join_room(p_id uuid,p_secret text,p_passcode text,p_nickname text) returns text
language plpgsql security definer set search_path = '' as $$
declare
 r public.rooms;
 checked_at timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in anonymously first.'; end if;
 -- Row lock serializes capacity checks so concurrent joins cannot exceed two participants.
 select * into r from public.rooms where id=p_id for update;
 checked_at := clock_timestamp();
 if not found or r.closed or r.expires_at<=checked_at or p_secret is null or r.secret_hash<>encode(extensions.digest(p_secret,'sha256'),'hex') then
  raise exception 'This invitation is invalid, closed, or expired.';
 end if;
 if r.passcode_hash is not null then
  if r.passcode_window_start > checked_at-interval '5 minutes' and r.passcode_failures >= 8 then
   return 'Too many passcode attempts. Wait five minutes or ask your host for a new room.';
  end if;
  if p_passcode is null or char_length(p_passcode)>64 or
     extensions.crypt(p_passcode,r.passcode_hash) is distinct from r.passcode_hash then
   -- Return a rejection so the failure counter commits with this RPC.
   update public.rooms set
    passcode_failures=case when passcode_window_start > checked_at-interval '5 minutes' then passcode_failures+1 else 1 end,
    passcode_window_start=case when passcode_window_start > checked_at-interval '5 minutes' then passcode_window_start else checked_at end
   where id=p_id;
   return 'That room passcode does not match.';
  end if;
 end if;
 if not exists(select 1 from public.room_members where room_id=p_id and user_id=auth.uid()) and
 (select count(*) from public.room_members where room_id=p_id)>=2 then raise exception 'This booth already has two people.'; end if;
 insert into public.room_members(room_id,user_id,nickname) values(p_id,auth.uid(),trim(p_nickname))
 on conflict(room_id,user_id) do update set nickname=excluded.nickname;
 return null;
end; $$;

revoke execute on function public.join_room(uuid,text,text,text) from public,anon;
grant execute on function public.join_room(uuid,text,text,text) to authenticated;

commit;

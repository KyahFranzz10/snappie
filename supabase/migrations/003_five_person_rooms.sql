begin;

create or replace function public.join_room(p_id uuid,p_secret text,p_passcode text,p_nickname text) returns text
language plpgsql security definer set search_path = '' as $$
declare
 r public.rooms;
 checked_at timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in anonymously first.'; end if;
 -- Row lock serializes capacity checks so concurrent joins cannot exceed five participants.
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
 (select count(*) from public.room_members where room_id=p_id)>=5 then raise exception 'This booth already has five people.'; end if;
 insert into public.room_members(room_id,user_id,nickname) values(p_id,auth.uid(),trim(p_nickname))
 on conflict(room_id,user_id) do update set nickname=excluded.nickname;
 return null;
end; $$;

commit;

-- Run once in Supabase SQL Editor. Public browser roles have no access.
begin;
create table public.sklo_leads (
  id uuid primary key,
  created_at timestamptz not null default now(),
  payload jsonb not null,
  payload_hash text not null,
  status text not null default 'new',
  manager_note text not null default ''
);
create table public.sklo_rate_limits (
  client_hash text primary key,
  window_start timestamptz not null,
  hits integer not null
);
create table public.sklo_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.sklo_leads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  lease uuid,
  sent_at timestamptz
);
create index on public.sklo_notifications(status, next_attempt_at);
alter table public.sklo_leads enable row level security;
alter table public.sklo_rate_limits enable row level security;
alter table public.sklo_notifications enable row level security;
revoke all on public.sklo_leads, public.sklo_rate_limits, public.sklo_notifications from public, anon, authenticated;
grant all on public.sklo_leads, public.sklo_rate_limits, public.sklo_notifications to service_role;

-- Rate limit, idempotency, lead and notification are one transaction.
create function public.sklo_submit_lead(p_id uuid, p_payload jsonb, p_hash text, p_client_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_hash text;
  counter integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select payload_hash into old_hash from public.sklo_leads where id = p_id;
  if found then
    if old_hash <> p_hash then return jsonb_build_object('error', 'conflict'); end if;
    return jsonb_build_object('id', p_id, 'duplicate', true);
  end if;
  insert into public.sklo_rate_limits(client_hash, window_start, hits)
    values(p_client_hash, now(), 1)
  on conflict(client_hash) do update set
    hits = case when sklo_rate_limits.window_start < now() - interval '15 minutes' then 1 else sklo_rate_limits.hits + 1 end,
    window_start = case when sklo_rate_limits.window_start < now() - interval '15 minutes' then now() else sklo_rate_limits.window_start end
  returning hits into counter;
  if counter > 5 then return jsonb_build_object('error', 'rate_limit'); end if;
  delete from public.sklo_rate_limits where window_start < now() - interval '1 day';
  insert into public.sklo_leads(id, payload, payload_hash) values (p_id, p_payload, p_hash);
  insert into public.sklo_notifications(lead_id) values(p_id);
  return jsonb_build_object('id', p_id, 'duplicate', false);
end;
$$;

create function public.sklo_claim_notification(p_lead_id uuid default null)
returns table(id uuid, lead_id uuid, payload jsonb, lease uuid)
language sql security definer set search_path = '' as $$
  with candidate as (
    select n.id from public.sklo_notifications n
    where (p_lead_id is null or n.lead_id = p_lead_id)
      and ((n.status = 'pending' and n.next_attempt_at <= now())
        or (n.status = 'sending' and n.locked_until < now()))
    order by n.next_attempt_at
    for update skip locked limit 1
  ), claimed as (
    update public.sklo_notifications n set status = 'sending',
      locked_until = now() + interval '2 minutes', lease = gen_random_uuid(), attempts = attempts + 1
    from candidate c where n.id = c.id
    returning n.id, n.lead_id, n.lease
  )
  select c.id, c.lead_id, l.payload, c.lease from claimed c
    join public.sklo_leads l on l.id = c.lead_id;
$$;

create function public.sklo_finish_notification(p_id uuid, p_lease uuid, p_sent boolean)
returns void language sql security definer set search_path = '' as $$
  update public.sklo_notifications set
    status = case when p_sent then 'sent' else 'pending' end,
    sent_at = case when p_sent then now() else null end,
    next_attempt_at = now() + (least(attempts, 60) * interval '1 minute'),
    locked_until = null, lease = null
  where id = p_id and lease = p_lease and status = 'sending';
$$;

revoke all on function public.sklo_submit_lead(uuid,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.sklo_claim_notification(uuid) from public, anon, authenticated;
revoke all on function public.sklo_finish_notification(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.sklo_submit_lead(uuid,jsonb,text,text) to service_role;
grant execute on function public.sklo_claim_notification(uuid) to service_role;
grant execute on function public.sklo_finish_notification(uuid,uuid,boolean) to service_role;
commit;

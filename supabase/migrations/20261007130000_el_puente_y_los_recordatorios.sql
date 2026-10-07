/*
  El puente y los recordatorios, juntos.

  1. El puente (20261006200000) va antes que los recordatorios
     (20261007120000): cuando se aplicó, `core_reminders` no existía y su
     disparador del feed no se puso. `puente_vigilar_tablas()` lo pone ahora
     (y apunta los que ya hubiera); si ya estaba, no hace nada.

  2. «hecho» y «en 1 h» / «mañana» desde WhatsApp tienen que hacer lo mismo que
     los botones del push: cerrar o posponer ese disparo, que el recordatorio
     vuelva a sonar a esa hora (`snooze_until`, que es lo que mira el reloj) y
     apagar el aviso de la campana. `recordatorio_hecho` y
     `recordatorio_posponer` usan `auth.uid()`, y el puente escribe con el rol
     de servicio (sin usuario): éstas son sus gemelas con el usuario explícito,
     sólo para el rol de servicio. Si cambias una, cambia la otra.
*/

create or replace function public.recordatorio_hecho_puente(p_user uuid, p_reminder uuid, p_fire_at timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_snooze timestamptz;
begin
  if p_user is null then
    return false;
  end if;

  select r.snooze_until into v_snooze
    from public.core_reminders r
   where r.id = p_reminder and r.user_id = p_user;
  if not found then
    return false;
  end if;

  insert into public.core_reminder_fires as f (reminder_id, user_id, fire_at, done_at, done_via)
  values (p_reminder, p_user, p_fire_at, now(), 'WHATSAPP')
  on conflict (reminder_id, fire_at) do update
    set done_at = coalesce(f.done_at, excluded.done_at),
        done_via = coalesce(f.done_via, excluded.done_via);

  if v_snooze is not null and exists (
    select 1 from public.core_reminder_fires f
     where f.reminder_id = p_reminder and f.fire_at = p_fire_at and f.snoozed_to = v_snooze
  ) then
    update public.core_reminders set snooze_until = null where id = p_reminder and user_id = p_user;
  end if;

  update public.notifications n
     set is_read = true, resolved_at = now()
   where n.user_id = p_user
     and n.dedup_key = 'rem:' || p_reminder || ':' || floor(extract(epoch from p_fire_at))::bigint
     and n.resolved_at is null;

  return true;
end;
$$;

comment on function public.recordatorio_hecho_puente(uuid, uuid, timestamptz) is
  'Lo mismo que recordatorio_hecho, desde WhatsApp por el puente: con el usuario explícito y sólo para el rol de servicio.';

-- El bot dice hasta cuándo («en 1 h», «mañana»). Nunca antes de un minuto ni
-- después de una semana, y fuera de la noche si el recordatorio la respeta.
create or replace function public.recordatorio_posponer_puente(
  p_user uuid, p_reminder uuid, p_fire_at timestamptz, p_hasta timestamptz
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_to timestamptz;
begin
  if p_user is null or p_hasta is null then
    return null;
  end if;

  select c.tz, c.quiet into r
    from public.core_reminders c
   where c.id = p_reminder and c.user_id = p_user;
  if not found then
    return null;
  end if;

  v_to := date_trunc('minute', least(greatest(p_hasta, now() + interval '1 minute'), now() + interval '7 days'));
  if r.quiet then
    v_to := public.recordatorio_fuera_de_noche(v_to, r.tz);
  end if;

  insert into public.core_reminder_fires as f (reminder_id, user_id, fire_at, snoozed_to)
  values (p_reminder, p_user, p_fire_at, v_to)
  on conflict (reminder_id, fire_at) do update
    set snoozed_to = excluded.snoozed_to
    where f.done_at is null;

  update public.core_reminders set snooze_until = v_to where id = p_reminder and user_id = p_user;

  update public.notifications n
     set is_read = true, resolved_at = now()
   where n.user_id = p_user
     and n.dedup_key = 'rem:' || p_reminder || ':' || floor(extract(epoch from p_fire_at))::bigint
     and n.resolved_at is null;

  return v_to;
end;
$$;

comment on function public.recordatorio_posponer_puente(uuid, uuid, timestamptz, timestamptz) is
  'Lo mismo que recordatorio_posponer, desde WhatsApp por el puente: hasta la hora que dice el bot, con el usuario explícito y sólo para el rol de servicio.';

revoke all on function public.recordatorio_hecho_puente(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.recordatorio_posponer_puente(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.recordatorio_hecho_puente(uuid, uuid, timestamptz) to service_role;
grant execute on function public.recordatorio_posponer_puente(uuid, uuid, timestamptz, timestamptz) to service_role;

select public.puente_vigilar_tablas();

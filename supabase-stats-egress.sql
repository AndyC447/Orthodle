-- Apply after the base schema and account migration, before deploying the stats routes.
begin;

create or replace function public.orthodle_city_label(raw text)
returns text
language plpgsql immutable strict security invoker
set search_path = ''
as $$
declare
  original text := regexp_replace(raw, '^\s+|\s+$', '', 'g');
  input text := replace(original, '+', ' ');
  decoded bytea := ''::bytea;
  position integer := 1;
  chunk text;
  label text;
begin
  -- Vercel city headers are URI-encoded. Decode UTF-8 bytes, preserving malformed labels.
  begin
    while position <= length(input) loop
      chunk := substr(input, position, 1);
      if chunk = '%' then
        chunk := substr(input, position + 1, 2);
        if chunk !~ '^[[:xdigit:]]{2}$' then
          raise invalid_parameter_value;
        end if;
        decoded := decoded || decode(chunk, 'hex');
        position := position + 3;
      else
        decoded := decoded || convert_to(chunk, 'UTF8');
        position := position + 1;
      end if;
    end loop;
    label := convert_from(decoded, 'UTF8');
  exception when invalid_parameter_value or character_not_in_repertoire or untranslatable_character then
    label := original;
  end;
  label := btrim(regexp_replace(label, '\s+', ' ', 'g'));
  return case when label = '' or label ~* '^(unknown|undefined|null|n/a|not available)$'
    then null else label end;
end;
$$;

create or replace function public.orthodle_impact_snapshot(excluded_ids text[])
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with visits as materialized (
    select session_id, (created_at at time zone 'America/Los_Angeles')::date as day, geo_country, geo_city
    from public.visits
    where not coalesce(session_id = any(excluded_ids), false)
  ), guesses as materialized (
    select session_id, case_id, (created_at at time zone 'America/Los_Angeles')::date as day
    from public.guesses
    where not coalesce(session_id = any(excluded_ids), false)
  ), audience as (
    select session_id, day from visits where session_id <> '' and day is not null
    union
    select session_id, day from guesses where session_id <> '' and day is not null
  ), audience_totals as (
    select count(*) as daily_users, count(distinct session_id) as unique_users from audience
  ), city_labels as materialized (
    select geo_city, public.orthodle_city_label(geo_city) as city
    from (select distinct geo_city from visits where geo_city is not null) labels
  ), top_cities as (
    select city, count(distinct session_id) as users
    from visits join city_labels using (geo_city)
    where city is not null
    group by city
    order by users desc, city
    limit 6
  )
  select jsonb_build_object(
    'usersReached', daily_users,
    'uniqueUsers', unique_users,
    'combinedDailyUsers', daily_users,
    'totalGuesses', (select count(*) from guesses),
    'archiveGuesses', (
      select count(distinct (g.session_id, g.case_id))
      from guesses g join public.cases c on c.id = g.case_id
      where g.session_id <> '' and c.case_date < g.day
    ),
    'countriesReached', (select count(distinct nullif(btrim(geo_country), '')) from visits),
    'topCities', (select coalesce(jsonb_agg(city order by users desc, city), '[]'::jsonb) from top_cities),
    'caseCount', (select count(*) from public.cases)
  )
  from audience_totals;
$$;

-- The personal query reads only this player's correct guesses; ranking reads at most ten profiles.
create index if not exists orthodle_correct_guesses_session_idx
  on public.guesses (session_id) where is_correct = true;
create index if not exists orthodle_guesses_case_session_idx
  on public.guesses (case_id, session_id);

create or replace function public.orthodle_streak_runs(
  reporting_day date, excluded_ids text[], player_id text
)
returns table (
  session_id text, longest integer, current_streak integer,
  best_start date, best_end date, last_solved date
)
language sql stable security invoker
set search_path = ''
as $$
  with publication as (
    select to_jsonb(p) as settings from public.play_mode_settings p where p.id = 'default'
  ), solved_days as (
    select distinct btrim(g.session_id) as session_id, c.case_date as day
    from public.guesses g
    join public.cases c on c.id = g.case_id
    left join publication p on true
    where g.is_correct = true
      and (player_id is null or g.session_id = player_id)
      and btrim(g.session_id) <> ''
      and not coalesce(btrim(g.session_id) = any(excluded_ids), false)
      and c.case_date between date '2026-04-27' and reporting_day
      and (g.created_at at time zone 'America/Los_Angeles')::date = c.case_date
      and (
        c.level = 'med_student'
        or (p.settings is not null and c.level = 'resident' and (
          not coalesce((p.settings->>'no_resident_mode')::boolean, false)
          or c.case_date < (p.settings->>'no_resident_mode_start_date')::date
        ))
        or (p.settings is not null and c.level = 'attending' and (
          not coalesce((p.settings->>'no_anatomy_mode')::boolean, false)
          or c.case_date < (p.settings->>'no_anatomy_mode_start_date')::date
        ))
      )
  ), numbered as (
    select d.*, day - row_number() over (partition by d.session_id order by day)::integer as island
    from solved_days d
  ), runs as (
    select n.session_id, count(*)::integer as length, min(day) as start_day, max(day) as end_day
    from numbered n
    group by n.session_id, island
  ), scored as (
    select r.*,
      row_number() over (partition by r.session_id order by length desc, end_day desc) as best,
      max(end_day) over (partition by r.session_id) as last_day,
      max(length) filter (where end_day >= reporting_day - 1) over (partition by r.session_id) as current_run
    from runs r
  )
  select s.session_id, length, coalesce(current_run, 0), start_day, end_day, last_day
  from scored s where best = 1;
$$;

create or replace function public.orthodle_streak_snapshot(reporting_day date, excluded_ids text[])
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with ranked as (
    select r.*, count(*) over () as total
    from public.orthodle_streak_runs(reporting_day, excluded_ids, null) r
    order by longest desc, current_streak desc, last_solved desc, session_id
    limit 10
  ), leaders as (
    select r.*, nullif(btrim(a.username), '') as username,
      coalesce(nullif(btrim(a.display_name), ''), nullif(btrim(a.username), ''), member.display_name) as name
    from ranked r
    left join public.user_accounts a on a.id::text = r.session_id
    left join lateral (
      select btrim(m.display_name) as display_name
      from public.group_members m
      where m.session_id = r.session_id and btrim(m.display_name) <> ''
      order by m.created_at desc, m.id
      limit 1
    ) member on true
  )
  select jsonb_build_object(
    'trackedPlayers', coalesce(max(total), 0),
    'longestStreak', coalesce(max(longest), 0),
    'leaders', coalesce(jsonb_agg(jsonb_build_object(
      'sessionId', session_id,
      'name', coalesce(name, 'Anonymous ' || chr(183) || ' ' || right(session_id, 8)),
      'username', username,
      'anonymous', name is null,
      'longest', longest,
      'current', current_streak,
      'bestStart', best_start,
      'bestEnd', best_end,
      'lastSolved', last_solved
    ) order by longest desc, current_streak desc, last_solved desc, session_id), '[]'::jsonb)
  )
  from leaders;
$$;

revoke execute on function public.orthodle_city_label(text) from public, anon, authenticated;
revoke execute on function public.orthodle_impact_snapshot(text[]) from public, anon, authenticated;
revoke execute on function public.orthodle_streak_runs(date, text[], text) from public, anon, authenticated;
revoke execute on function public.orthodle_streak_snapshot(date, text[]) from public, anon, authenticated;
grant execute on function public.orthodle_city_label(text) to service_role;
grant execute on function public.orthodle_impact_snapshot(text[]) to service_role;
grant execute on function public.orthodle_streak_runs(date, text[], text) to service_role;
grant execute on function public.orthodle_streak_snapshot(date, text[]) to service_role;

commit;

-- Run once in the Supabase SQL Editor. Safe to rerun.
-- Normalizes existing cases and future writes, including automated fallback cases.
begin;

create or replace function public.normalize_case_category(value text)
returns text language plpgsql immutable set search_path = public as $$
declare
  cleaned text;
  category_key text;
begin
  if value is null then return null; end if;
  cleaned := regexp_replace(regexp_replace(btrim(value), '\s+', ' ', 'g'), '\s*/\s*', ' / ', 'g');
  category_key := regexp_replace(lower(cleaned), '[^a-z0-9]', '', 'g');
  return case
    when category_key in ('bone', 'bonedisease', 'bonediseases', 'bonedisorders', 'bonefracture', 'bonefractures', 'bonetumor', 'bonetumors', 'bonetumour', 'bonetumours') then 'Bone Disorders'
    when category_key in ('footankle', 'footandankle') then 'Foot / Ankle'
    when category_key in ('hand', 'handtrauma', 'handandtrauma') then 'Hand'
    when category_key in ('sports', 'sportsmedicine') then 'Sports'
    when category_key in ('pediatrics', 'paediatrics', 'pediatric') then 'Pediatrics'
    when category_key = 'trauma' then 'Trauma'
    when category_key = 'spine' then 'Spine'
    when category_key = 'shoulder' then 'Shoulder'
    when category_key = 'elbow' then 'Elbow'
    when category_key = 'hip' then 'Hip'
    when category_key = 'knee' then 'Knee'
    when category_key in ('msk', 'musculoskeletal') then 'MSK'
    when category_key = 'surgicalanatomy' then 'Surgical Anatomy'
    else cleaned
  end;
end;
$$;

update public.cases
set category = public.normalize_case_category(category)
where category is distinct from public.normalize_case_category(category);

create or replace function public.normalize_case_category_on_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.category := public.normalize_case_category(new.category);
  return new;
end;
$$;

drop trigger if exists normalize_case_category on public.cases;
create trigger normalize_case_category
before insert or update of category on public.cases
for each row execute function public.normalize_case_category_on_write();

commit;

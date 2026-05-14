alter table public.cases
  add column if not exists learning_image_url text,
  add column if not exists learning_image_credit text,
  add column if not exists learning_image_url_2 text,
  add column if not exists learning_image_credit_2 text;

alter table public.case_submissions
  add column if not exists learning_image_url text,
  add column if not exists learning_image_credit text,
  add column if not exists learning_image_url_2 text,
  add column if not exists learning_image_credit_2 text;

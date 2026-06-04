alter table public.cases
  add column if not exists learning_image_caption text,
  add column if not exists learning_image_caption_2 text;

alter table public.case_submissions
  add column if not exists learning_image_caption text,
  add column if not exists learning_image_caption_2 text;

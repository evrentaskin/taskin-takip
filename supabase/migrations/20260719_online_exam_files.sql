-- Taşkın Takip: Online deneme PDF/resim dosyaları
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'online-exam-files',
  'online-exam-files',
  false,
  20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dosya yolları rastgele UUID içerir. Öğrenciler yalnızca uygulamanın ürettiği
-- iki dakikalık imzalı bağlantılarla erişir. Yazma/silme öğretmen oturumlarına aittir.
drop policy if exists "online_exam_files_authenticated_read" on storage.objects;
create policy "online_exam_files_authenticated_read"
on storage.objects for select to authenticated
using (bucket_id = 'online-exam-files');

drop policy if exists "online_exam_files_authenticated_insert" on storage.objects;
create policy "online_exam_files_authenticated_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'online-exam-files');

drop policy if exists "online_exam_files_authenticated_update" on storage.objects;
create policy "online_exam_files_authenticated_update"
on storage.objects for update to authenticated
using (bucket_id = 'online-exam-files')
with check (bucket_id = 'online-exam-files');

drop policy if exists "online_exam_files_authenticated_delete" on storage.objects;
create policy "online_exam_files_authenticated_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'online-exam-files');

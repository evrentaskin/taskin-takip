-- Öğrenci kullanıcı adları benzersiz olsun
create unique index if not exists students_username_unique_idx
on public.students (lower(username))
where username is not null;

-- Profil trigger'ı öğrenci hesaplarını student rolünde oluşturmaya devam eder.
-- İlk öğretmen hesabınız zaten mevcut olduğu için yeni Auth kullanıcıları student olur.

-- Öğrencinin kendi kaydını görebilmesi için mevcut politika yoksa oluştur.
drop policy if exists "Öğrenci kendini görür" on public.students;
create policy "Öğrenci kendini görür"
on public.students
for select
to authenticated
using (auth_user_id = auth.uid());

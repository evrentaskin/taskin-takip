# Bugün Giriş Yapan Öğrenciler

- Başarılı oturum açmalar `student_login_events` tablosuna kaydedilir.
- Öğrenciler sayfasında bugünkü benzersiz öğrenci sayısı görünür.
- Son giriş yapan öğrencinin adı ve saati kartta gösterilir.
- `Tümünü Gör` penceresinde saat, öğrenci, sınıf, cihaz ve günlük giriş sayısı listelenir.
- Telefon/tablet/bilgisayar cihaz türü kaydedilir.
- Kayıtlar 60 saniyede bir ve pencereye geri dönüldüğünde yenilenir.

## Kurulum
Supabase SQL Editor'da bir kez çalıştırın:

`supabase/migrations/009_student_login_tracking.sql`

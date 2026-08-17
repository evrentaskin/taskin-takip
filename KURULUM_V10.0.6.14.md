# V10.0.6.14 – Özel Ders Öğrenci Paneli

## Eklenenler
- Ödevler ekranı
- Online denemeleri görme ve çözme
- Online + okul denemelerinin ortak analizi
- Son 10 deneme net grafiği
- Ayarlar, şifre değiştirme ve çıkış
- Özel ders öğrencisi için gerçek giriş hesabı oluşturma

## Kurulum
1. ZIP içindeki dosyaları proje klasörüne aynı yollarla kopyalayın.
2. Supabase SQL Editor'da `supabase/migrations/20260721_private_student_portal.sql` dosyasını çalıştırın.
3. Güncellenen Edge Function'ı yayınlayın:
   `supabase functions deploy student-account`
4. Uygulamayı yeniden yayınlayın.

## Mevcut özel ders öğrencileri
Daha önce eklenmiş öğrencilerin gerçek giriş hesabının oluşması için öğretmen panelinde öğrenciyi açıp **Düzenle > Kaydet** yapın.

Öğrenci, öğretmenin verdiği kullanıcı adı ve şifreyle normal giriş ekranından giriş yapar.

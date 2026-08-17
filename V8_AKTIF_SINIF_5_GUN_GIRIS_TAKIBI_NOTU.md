# V8 Aktif Sınıf ve 5 Günlük Giriş Takibi

- Öğrenciler sayfasındaki sınıf filtresi yalnızca öğretmenin Ayarlar bölümünde seçtiği aktif sınıfları gösterir.
- Sayfa açıldığında ilk aktif sınıf otomatik seçilir.
- Aktif sınıf tanımı yoksa güvenli geri dönüş olarak tüm sınıflar gösterilir.
- Elle Öğrenci Ekle penceresinde tüm sınıflar görünür.
- 5 gündür giriş yapmayan aktif öğrenciler ayrı kartta sayılır.
- Hiç giriş yapmamış öğrenciler de takip listesine dahil edilir.
- Ayrıntı penceresinde öğrenci, sınıf, son giriş tarihi ve kaç gündür giriş yapmadığı gösterilir.
- Bugünkü giriş kartındaki yenileme düğmesi iki listeyi de yeniler.
- Mevcut `009_student_login_tracking.sql` yapısı kullanılır; yeni migration eklenmemiştir.
- `npm run build` başarıyla tamamlanmıştır.

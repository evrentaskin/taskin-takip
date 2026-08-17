# Taşkın Akademi V6.3 — Güvenli Dönem Geçişi

Bu sürümde:

- Aktif Dönemi Kaydet: yalnızca mevcut dönem adı ve tarihlerini günceller.
- Yeni Dönemi Başlat: mevcut dönemi arşivler ve yeni aktif dönem oluşturur.
- LGS Grubu hiçbir şekilde sıfırlanmaz veya etkilenmez.
- Normal sınıflarda öğrenci listeleri ve giriş hesapları korunur.
- Dönemlik modüller yeni dönemde boş başlar.
- Eski dönem verileri silinmez, arşivde kalır.
- Dönem geçişi kayıt altına alınır.

Kurulum:

1. Supabase SQL Editor'da:
   `supabase/migrations/004_period_transition.sql`
   dosyasını çalıştırın.

2. Eski CMD'de Ctrl+C yapın.

3. V6.3 klasöründe:
   npm install
   npm run dev

Edge Function güncellemesi gerekmez.


## V6.4 Öğretmen Ana Sayfası
- Aktif sınıf seçildiğinde öğrenci listesi kaldırıldı.
- Tam genişlik Ayın Öğrencileri ilk 5 kartı.
- Sınıf mevcudu ve son deneme net ortalaması.
- Yaklaşan ödev ve online deneme hızlı erişim kartları.
- Son 5 deneme sınıf ortalaması çizgi grafiği.
- Son deneme en düşük / ortalama / en yüksek net sütun grafiği.
- Yapay zekâ destek merkezi.
- En fazla yükselen ve en fazla düşüş yaşayan 5 öğrenci alanları.
- LGS sınıfında mevcut LGS sonuçlarından gerçek grafik ve sıralama üretilir.
- Henüz veri tablosu oluşturulmamış modüller güvenli boş durum gösterir.
- SQL veya Edge Function güncellemesi gerekmez.

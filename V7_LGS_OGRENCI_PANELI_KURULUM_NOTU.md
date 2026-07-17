# Taşkın Takip Sistemi V7 — LGS Öğrenci Paneli

## Bu sürümde
- Son Türkiye Sıralaması başlığı, Son Deneme Sıralaması olarak değiştirildi.
- En Yüksek Puan kartı yerine öğretmen tarafından belirlenen Hedef Puanı gösterilir.
- Hedef puanı geçme sayısı, hedef geçmişindeki toplam başarı sayısıyla gösterilir.
- Son denemede ilk üçte olan öğrenciye altın/gümüş/bronz rozet gösterilir.
- Puan ve net grafikleri X/Y eksenli ve çok renkli hale getirildi.
- Son denemede öğrenci, sınıf ortalaması, en yüksek ve en düşük puan karşılaştırılır.
- Deneme sonuçlarına göre otomatik güncellenen kişisel analiz eklendi.
- Öğretmenin oluşturduğu 14 günlük çalışma programı öğrenci panelinde görünür ve işaretlenebilir.
- LGS denemeleri ayrıntılı, zebra desenli ve tarih sıralı tabloya dönüştürüldü.
- Her ders için doğru/net, toplam doğru/net, puan ve sıra gösterilir.
- Bir önceki denemeye göre yeşil/kırmızı oklar gösterilir.
- Katılınmayan denemeler ortalamaya dahil edilmez.
- Logo ve zebra düzenli öğrenci LGS PDF çıktısı eklendi.

## Zorunlu SQL
Supabase Dashboard > SQL Editor bölümünde şu dosyayı çalıştırın:

`supabase/migrations/005_lgs_student_portal.sql`

Bu tablo hedef puanı, hedef geçmişini ve çalışma programını öğretmen ile öğrenci paneli arasında senkronize eder.

## Çalıştırma
```bash
npm install
npm run dev
```

## Derleme doğrulaması
`npm run build` başarıyla tamamlanmıştır.

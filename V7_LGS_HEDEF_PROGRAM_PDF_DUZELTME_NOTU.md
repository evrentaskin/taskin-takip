# V7 LGS hedef, program ve PDF okunabilirlik düzeltmesi

- Öğrenci paneli hedef puanı ve çalışma programını `get_my_lgs_portal_settings()` fonksiyonuyla güvenli biçimde okur.
- Öğretmen panelinde otomatik oluşturulan 14 günlük programlar artık veritabanına da kaydedilir.
- LGS PDF'lerinde doğru, net, toplam net ve puan değerleri daha büyük ve kalın gösterilir.
- Supabase SQL Editor'da `supabase/migrations/006_lgs_portal_student_read_fix.sql` bir kez çalıştırılmalıdır.

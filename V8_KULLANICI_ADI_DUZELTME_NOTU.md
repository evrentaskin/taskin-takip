# V8 Kullanıcı Adı Düzeltmesi

- Excel toplu öğrenci ekleme, tek öğrenci ekleme ve öğretmen kullanıcı adı değiştirme doğrulamaları ortak kurala bağlandı.
- 1 ve 2 haneli sayısal kullanıcı adları kabul edilir: `3`, `17`.
- Harfli ve karışık kullanıcı adları kabul edilir: `mustafa`, `ogr17`, `ogr_17`, `fen-2026`.
- Türkçe harfler giriş hesabı için güvenli ASCII karşılıklarına dönüştürülür.
- SQL Editor'da Edge Function kodu çalıştırılmaz.
- `student-account` fonksiyonunu güncellemek için CMD'de şu komut kullanılır:

  npx supabase functions deploy student-account

- Üretim derlemesi başarıyla tamamlandı.

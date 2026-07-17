# V8 Excel Kullanıcı Adı Doğrulama Düzeltmesi

- Excel ile toplu öğrenci eklemede 1-30 karakter kullanıcı adı kabul edilir.
- Sadece sayı, sadece harf veya harf-sayı karışımı kullanılabilir.
- Nokta, tire ve alt çizgi desteklenir.
- Aynı kural tek öğrenci ekleme, öğrenci kullanıcı adı değiştirme ve öğretmen kullanıcı adı değiştirme işlemlerinde uygulanır.
- Boşluk ve diğer özel karakterler kabul edilmez.
- Edge Function güncellendiği için `student-account` fonksiyonunun yeniden deploy edilmesi gerekir.

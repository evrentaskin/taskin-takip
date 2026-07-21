# V10.0.6.10 Kurulum

ZIP içindeki dosyaları ana projenin aynı klasörlerine kopyalayıp üzerine yazın.

Ardından:

npm install
npm run build
git add .
git commit -m "V10.0.6.10 PDF başlık ve kullanıcı adı düzeltmesi"
git push

## Düzeltilenler
- PDF üst bilgi alanına öğrenci adı soyadı, öğrenci numarası, toplam deneme ve ortalama net eklendi.
- PDF tablo başlıkları açık turuncu zemin ve koyu yazıyla okunur hale getirildi.
- Deneme yokken de tablo başlıkları görünür.
- Özel ders öğrencisi eklerken aktif sınıf öğrencilerinin kullanıcı adları kontrol edilir.
- Sınıf öğrencisi eklerken aktif özel ders öğrencilerinin kullanıcı adları kontrol edilir.
- Silinmiş/pasif sınıf öğrencilerinin kullanıcı adları tekrar kullanılabilir.
- Özel ders öğrenci formuna isteğe bağlı öğrenci numarası alanı eklendi.

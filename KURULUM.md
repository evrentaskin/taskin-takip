# V10.0.6.12 Okul Denemesi Otomatik Net Yaması

1. `src/pages/PrivateLessonsPage.jsx` dosyasını ana projedeki aynı konuma kopyalayıp üzerine yazın.
2. Proje klasöründe aşağıdaki komutları çalıştırın:

```bash
npm run build
git add .
git commit -m "V10.0.6.12 okul denemesi otomatik net"
git push
```

## Eklenenler
- Doğru ve yanlış değerleri 0–20 aralığıyla sınırlandırıldı.
- Doğru + yanlış toplamı 20'yi aşarsa giriş kabul edilmez ve uyarı gösterilir.
- Boş sayısı otomatik hesaplanır: `20 - doğru - yanlış`.
- Net otomatik hesaplanır: `doğru - yanlış / 3`.
- Net ve boş alanları salt okunurdur; elle değiştirilemez.
- Kayıt sırasında ikinci doğrulama yapılarak hatalı veri kaydedilmesi engellenir.

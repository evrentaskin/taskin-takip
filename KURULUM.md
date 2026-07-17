# Taşkın Takip V8.1 Cloud — Temiz Kurulum

Bu paket GitHub, Vercel ve yeni Supabase projesi için hazırlanmış tek parça sürümdür.

## 1. Supabase
1. Yeni Supabase projesi oluşturun.
2. SQL Editor bölümünde `supabase/migrations` klasöründeki SQL dosyalarını dosya adındaki numara sırasıyla çalıştırın.
3. Project Settings > API bölümünden Project URL ve Publishable/Anon Key değerlerini alın.

## 2. Bilgisayarda ortam dosyası
1. `.env.example` dosyasının kopyasını `.env` adıyla oluşturun.
2. İçindeki iki değeri yeni Supabase projenize göre doldurun.
3. `.env` GitHub'a yüklenmez.

## 3. GitHub
Bu klasörün içeriğini yeni, boş GitHub repository'sine yükleyin.

## 4. Vercel
1. GitHub repository'sini Vercel'e bağlayın.
2. Framework Preset: Vite
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Environment Variables bölümüne şunları ekleyin:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. Deploy edin.

## 5. Kontrol
Aynı kullanıcıyla telefondan ve bilgisayardan giriş yapıp ödev, deneme ve LGS tarihini kontrol edin. Veriler yeni Supabase projesinde ortak saklanır.

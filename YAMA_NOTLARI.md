# V9.4.1 Online Deneme Kalıcı Kayıt Düzeltmesi

## Sorunun nedeni
Fen online denemesinde öğrenci cevabı cihazda kaydediliyor, ardından güncelleme olayı hemen çalışıyordu. Buluttaki eski kayıt henüz güncellenmediği için eski veri tekrar yükleniyor ve öğrencinin `answers`, `finishedAt` ve `locked` bilgileri siliniyordu.

## Yapılan düzeltmeler
- Fen online deneme cevapları önce `shared_app_state / exams-v1` kaydına yazılıyor.
- Bulut kaydı tamamlanmadan yenileme olayı gönderilmiyor.
- Kaydetme başarısız olursa sınav ekranı kapanmıyor ve öğrenci uyarılıyor.
- Başarılı kayıttan sonra `finishedAt` ve `locked` kalıcı hale geliyor.
- LGS online denemeleri için `lgs-online-exams-v1` bulut kaydı eklendi.
- LGS öğrenci cevapları ve bitirme durumu cihazlar arasında senkronize ediliyor.
- Öğretmen LGS online sınav yönetiminde yalnızca veri senkronizasyonu eklendi; arayüz, analiz ve PDF değiştirilmedi.

## Beklenen sonuç
Öğrenci denemeyi kaydettikten sonra tekrar başlayamaz. Önceki cevapları korunur ve deneme süresi bitince analiz ekranında görünür.

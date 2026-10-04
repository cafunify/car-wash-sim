# Sürüm notları

Her sürüm `main`'e birleşince GitHub Releases'e otomatik yayınlanır (sürüm numarası `package.json`'dan alınır).
Yeni sürüm için: `npm version <x.y.z> --no-git-tag-version` + aşağıya `## vX.Y.Z` bölümü ekle.

## v0.5.2
- Giriş ekranı tam ekran iki sütun: solda logo, araç animasyonu, ilerleme ve düğmeler; sağda kontroller. Kaydırma çubuğu kalktı, boyutlar ekran yüksekliğine göre ölçeklenir

## v0.5.1
- Sigil '07 havada duruyordu (modeldeki bozuk rozet mesh'i sınırı 4 m'ye uzatıyordu): rozet çıkarıldı, araçlar lastik tabanından zemine oturtulur
- Geliş animasyonundaki öne eğilme küçültüldü
- Chapman '73 oyundan tamamen kaldırıldı
- Lastik parlatma yalnızca lastiğin dışa bakan yanağında sayılır; iç yanak ve taban hesaba girmez

## v0.5.0
- Havlu ikonu: tuvalet kağıdı emojisi yerine mikrofiber havlu SVG ikonu; havlu animasyonu yenilendi (elden yüzeye geçiş, "8" süpürme, kırışma dalgası)
- Yeni müşteri gelirken geçiş kartı (donma hissi yerine animasyon)
- Su ve köpük akışı dikey yelpaze
- Lastik parlatma yalnızca lastiğin yanağında sayılır
- Tüm müşteri süreleri 1.6 kat uzadı (bahşiş daha kolay)

## v0.4.1
- Sol alttaki "Eksik yerler" haritası kaldırıldı; yerine F kir tarayıcı bilgi kutusu eklendi (renk anlamları + ne yaptığı)

## v0.4.0
- Yeni açılış ekranı: kirli → parlak araç animasyonu, gerçek aşama aşama ilerleme çubuğu, dönen ipuçları
- Başlangıç kartı yükleme sırasında görünür (kontroller okunabilir); düğme hazır olunca açılır
- İlk araç modeli garaj kurulurken paralel indirilir (açılış kısalır)

## v0.3.1
- Başlangıç seviyesinde gelen araç çeşidi 3'ten 12'ye çıktı; son 6 araçta aynı model tekrar gelmez

## v0.3.0
- 15 yeni araç eklendi (toplam 24): Compact '07, Kiri '10, Lolita '91, Olympic '95, Chapman '73, Urban '10, Murphy '92, Milano '95, Sigil '07, Riverside '88, Tozzo '98, Stinger '96, Phoenix '93, Roadster '00, Libeccio V6 '91

## v0.2.1
- Eksik temizlikte T ile teslim iki basışa döndü: ilk basış ücret önizlemesini ekranda gösterir, ikinci basış onaylar

## v0.2.0
- Gün döngüsü (günde 6 müşteri), itibar (1–5 yıldız) ve gün sonu raporu
- Teslimde önce/sonra fotoğrafı, puan ve müşteri yorumu
- Kuş pisliği ve böcek lekesi (yeni "Kuş/Böcek" adımı; kuruyan pislik puan düşürür)
- Havlu ovalama animasyonu yenilendi, kenarları artık parçalanmıyor
- Köpük tabancası su gibi yatay yelpaze; standart temizlik süresi uzadı
- T tek basışla teslim eder; C çömelmeyi aç/kapa yapar

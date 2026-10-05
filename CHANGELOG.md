# Sürüm notları

Her sürüm `main`'e birleşince GitHub Releases'e otomatik yayınlanır (sürüm numarası `package.json`'dan alınır).
Yeni sürüm için: `npm version <x.y.z> --no-git-tag-version` + aşağıya `## vX.Y.Z` bölümü ekle.

## v1.1.0
- Yeni dekorlar: dükkân kedisi (nefes alır, E ile sevilir), buharı tüten çay köşesi, hafif titreyen ışık dizisi, neon "AÇIK" tabelası (pembe/camgöbeği/kehribar), albüm duvarı (en iyi 3 fotoğraf)
- Bitkiler daha dolgun ve yapraklı yeniden çizildi (saksı bitkisi, sarkan yapraklı palmiye)

## v1.0.0
- Dükkân kişiselleştirme (mağazada yeni Dekor sekmesi): özel tabela yazısı (üç garaj seviyesinde de görünür, uzun yazı sığacak şekilde küçülür), duvar posterleri (en fazla 3 asılı), saksı bitkisi ve palmiye
- Radyo istasyonları: Klasik Lo-fi, Pazar Sabahı (majör), Gece Yarısı (minör)
- Hasan Amca, Zehra Öğretmen ve Selim Bey son ziyarette poster hediye eder
- Tabela yazısı yazılırken oyun kısayolları devre dışı kalır

## v0.11.0
- Garaj albümü: ≥4★ teslimlerin önce/sonra fotoğrafları albüme kaydedilir (en fazla 18, ayrı `localStorage` anahtarı)
- Araç koleksiyonu (yıkanan modeller açılır, diğerleri ???) ve müdavim kartları
- 📷 Albüm düğmesi başlangıç ekranında ve mağazada; telefon genişliğinde tek sütun

## v0.10.0
- Müdavimler: 7 isimli müşteri favori araçlarıyla ara sıra gelir, her ziyarette küçük bir hikâye anlatır (3 ziyaret), son ziyarette hediye bırakır
- Cezasız tasarım: hikâye yıldızdan bağımsız ilerler; ≥3★ teslimde müdavimin teşekkür yorumu görünür
- Yeni başarım: Mahalle dostu (tüm hikâyeleri tamamla)

## v0.9.2
- FPS göstergesi para panelinin soluna taşındı (gün paneline binmiyor)
- Otomatik grafik: ilk açılışta GPU adı, CPU/RAM ve kısa kare ölçümüyle cihaza uygun seviye seçilir (yazılımsal/entegre GPU düşük, güçlü GPU yüksek); giriş ekranında bildirilir
- Ayarlar → Grafik → "Otomatik" ile yeniden ölçülür; elle seçim otomatiği kapatır. Otomatik modda FPS 6 sn <24 kalırsa seviye bir kademe düşer. Eski kayıtların ayarı değişmez

## v0.9.1
- Hava durumu: her gün açık, yağmurlu (çamurlu araçlar, ücret ×1.1) ya da tuzlu kış (tuz lekeli araçlar, ücret ×1.15); gün panelinde ve raporda görünür
- Özel müşteri istekleri: Acele (süre ×0.6) ve Kusursuz; 5★ ile teslimde bonus
- Olay araçları: Taksi, Düğün arabası (kusursuz istek, ×1.6), Çamurlu pikap; %12 şansla gelir
- Yeni başarımlar (Olay avcısı, Müşteri dostu) ve günlük hedef "özel isteği yerine getir"

## v0.9.0
- Kil Bar: yeni alet (mağazada $180) ve katran/reçine lekesi. Etek ve kapı altlarındaki koyu leke kil barla ovularak sökülür
- Katranlı araçlar yalnızca kil barı olan oyuncuya ve Detaylı/Premium paketlerde gelir; yeni "Katran" adımı durulamadan sonra
- "Katran avcısı" başarımı

## v0.8.0
- İlk açılış rehberi: 5 adımlık kontrol listesi (yürü, çamuru sök, köpükle, durula, teslim); Atla düğmesi, Ayarlar'dan yeniden oynat. Eski kayıtlar rehberi görmez
- Günlük hedef: her gün bir hedef (ör. 3 bahşiş, 2 kusursuz iş), tamamlanınca para ödülü; gün panelinde görünür
- 12 başarım ve Başarımlar paneli (başlangıç ekranı ve mağazadan açılır)

## v0.7.0
- Parça bazlı geri bildirim: kaput, tavan, bagaj, yanlar ve tamponlar temizlenince küçük parıltı, "ding" ve ✓ bildirimi
- Adım bitince adım çipi parlar ve ses çalar
- Teslim kartında yıldızlar sırayla dolar

## v0.6.0
- Mobil kontroller: Ayarlar → "Mobil kontroller" (dokunmatik cihazda varsayılan açık). Sol joystick (yürü/koş), ekranda sürükleyerek bakış, büyük KULLAN düğmesi, Su/Köpük, E, Q, C, F, T, Menü ve Mağaza düğmeleri
- Dokunmatik modda giriş ekranı dokunmatik kontrolleri anlatır, HUD küçülür, dikey duruşta "telefonu yatay çevir" uyarısı

## v0.5.3
- Giriş ekranı artık her pencere boyutunda yatay iki sütun: dar pencerede/tarayıcı yakınlaştırmasında alt alta düşüp kaydırma çıkarmak yerine içerik orantılı küçülür

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

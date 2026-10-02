# Sürüm notları

Her sürüm `main`'e birleşince GitHub Releases'e otomatik yayınlanır (sürüm numarası `package.json`'dan alınır).
Yeni sürüm için: `npm version <x.y.z> --no-git-tag-version` + aşağıya `## vX.Y.Z` bölümü ekle.

## v0.2.1
- Eksik temizlikte T ile teslim iki basışa döndü: ilk basış ücret önizlemesini ekranda gösterir, ikinci basış onaylar

## v0.2.0
- Gün döngüsü (günde 6 müşteri), itibar (1–5 yıldız) ve gün sonu raporu
- Teslimde önce/sonra fotoğrafı, puan ve müşteri yorumu
- Kuş pisliği ve böcek lekesi (yeni "Kuş/Böcek" adımı; kuruyan pislik puan düşürür)
- Havlu ovalama animasyonu yenilendi, kenarları artık parçalanmıyor
- Köpük tabancası su gibi yatay yelpaze; standart temizlik süresi uzadı
- T tek basışla teslim eder; C çömelmeyi aç/kapa yapar

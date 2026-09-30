# Parıltı Oto Yıkama

Tarayıcıda çalışan birinci şahıs oto yıkama simülatörü (Three.js + Vite).

**Oyna:** https://cafunify.github.io/car-wash-sim/

Müşteri bir yıkama paketiyle gelir → aletleri raftan alıp aracı temizlersin → para ve bahşiş kazanırsın → mağazadan yeni ekipman ve dükkân yükseltmesi alırsın → sıradaki müşteri.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç. Fare kilidi (Pointer Lock) desteklenmeyen ortamlarda (ör. gömülü önizleme panelleri) oyun otomatik olarak serbest fare moduna geçer: sağ tuşla sürükleyerek bakılır, alet imlecin gösterdiği yere nişan alır, Esc duraklatır.

Üretim derlemesi: `npm run build` → `dist/`. `main` dalına her push GitHub Actions ile Pages'e yayınlanır.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| WASD / oklar | Hareket (Shift: koş) |
| Fare | Etrafa bak |
| Sol tık (basılı) | Elindeki aleti kullan |
| E | Rafa bakarken: alet al / bırak · ekrana bakarken: mağaza |
| Q | Elindekini rafa bırak |
| Tab | Mağaza |
| F | Kir tarayıcı (kalan kir turuncu, cila gereken boya sarı, ıslaklık mavi) |
| M | Ses aç/kapat |

## Oynanış

**Aletler** aracın sağındaki rafta asılı durur; bakıp E ile alınır. Kilitli olanlar mağazadan açılır.

| Alet | Ne yapar |
| --- | --- |
| Basınçlı yıkama tabancası | Çamuru söker, köpüğü durular, aracı ıslatır |
| Köpük tabancası | Aktif köpük; köpüklü yüzeyde sünger 3 kat hızlı |
| Yıkama süngeri | Leke ve toz filmini siler (ovalamak hızlandırır) |
| Kurulama havlusu | Islaklığı ve damlaları alır |
| Jant temizleyici | Fren tozunu söker (tozla temas edince morarır) |
| Lastik parlatıcı | Soluk lastikleri derin siyaha çevirir |
| Cam temizleyici | Camdaki puslu filmi ve kireç lekelerini siler |
| Cila makinesi | Temiz, kuru boyaya cila: ayna parlaklığı ve metalik pul ışıltısı |

**Yıkama paketleri** — ekipmanlar açıldıkça müşteriler daha kapsamlı paket ister:

| Paket | Katmanlar | Kazanç |
| --- | --- | --- |
| Standart Yıkama | çamur, leke, kuruluk | ×1 |
| Detaylı Yıkama | + jant, lastik, cam | ×1.7 |
| Premium Detailing | + cila | ×2.6 |

Paket bitirilince ödeme alınır; bahşiş süresi dolmadan bitirirsen %35'e kadar bahşiş eklenir. İlerleme `localStorage`'a kaydedilir (mağazada "İlerlemeyi sıfırla").

## Mimari

```
src/
  main.js           Oyun döngüsü, renderer, bloom, kontroller, raf etkileşimi, olay akışı
  DirtVolume.js     8 kanallı 3D kir hacmi + malzemelere shader enjeksiyonu (çekirdek mekanik)
  CarParts.js       Parça sınıflandırması (boya/cam/lastik/jant/trim) → köşe başına `aPart`
  CarManager.js     Araç yaşam döngüsü, arka plan yükleme, asenkron shader derleme, yüzey örnekleme
  CarModels.js      Araç kataloğu, GLB hazırlama/yönlendirme, rastgele metalik boya, prosedürel yedek
  Packages.js       Yıkama paketleri, katman eşikleri, ilerleme hesabı
  Tools.js          8 aletin davranışı ve birinci şahıs modelleri
  ToolRack.js       Alet rafı, etiketler, mağaza terminali
  Particles.js      Su, köpük, sis, damla ve ışıltı partikülleri
  Environment.js    3 seviyeli prosedürel garaj (Basit → Yenilenmiş → Neon stüdyo)
  EconomyManager.js Para, yükseltmeler, müşteri zamanlayıcı, kayıt, mağaza arayüzü
  HUD.js            DOM tabanlı arayüz
  Audio.js          Prosedürel ASMR sesler (pembe/kahverengi gürültü, kabarcık patlamaları, kompresör)
```

### Kir sistemi

Kir, UV'ye boyanan bir doku yerine **araç-yerel 3D voxel hacminde** tutulur (iki `Data3DTexture`, RGBA8):

- Doku 0: çamur · leke · ıslaklık · köpük
- Doku 1: fren tozu (jant) · lastik matlığı · cam filmi · cila

Bunun nedeni birçok GLB modelinin paylaşılan doku atlası UV'si kullanmasıdır: UV'ye boyamak aynı UV'yi paylaşan tüm
yüzeyleri birden temizlerdi. Hangi katmanın nerede geçerli olduğunu `CarParts.js`'in her köşeye yazdığı parça etiketi
belirler (isim, malzeme, saydamlık ve tekerleklerde doku parlaklığına göre).

- Aracın mevcut PBR malzemesine `onBeforeCompile` ile katmanlar eklenir; temiz hal orijinal malzemedir.
- Raycaster isabet noktası araç-yerel uzaya çevrilir ve yumuşak küresel fırçayla hacim boyanır.
- İlerleme, yüzeyden alan ağırlıklı alınan ve oyuncunun **erişebileceği** noktalarda, parça bazında hesaplanır.

### Kendi aracını eklemek

`src/CarModels.js` içindeki `CAR_CATALOG`'a bir kayıt ekle ve `glb` alanına dosya yolunu ver. `autoOrient` uzun ekseni
ve farları kullanarak aracı otomatik çevirir. Büyük modelleri önce küçült:

```bash
npx @gltf-transform/cli optimize girdi.glb public/models/cars/dz/cikti.glb --texture-compress webp --texture-size 1024 --compress false --simplify false --flatten false --join false
```

### Debug

Tarayıcı konsolunda `game`: `cleanAll()`, `addMoney(1000)`, `unlockAll()`, `nextCar('premium')`, `setLevel(2)`, `stats()`.

## Varlıklar ve lisans

- Araç modelleri: **Daniel Zhabotinsky** — [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/), ayrıntılı künye:
  [`public/models/cars/dz/CREDITS.md`](public/models/cars/dz/CREDITS.md). Dokular web için küçültüldü, boya rengi oyunda değiştiriliyor.
- Diğer tüm görseller (garaj, dokular, tabelalar, aletler) ve sesler kodda prosedürel olarak üretilir.

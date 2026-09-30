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
| C (basılı) | Çömel — etekler, alt kısım ve lastikler için |
| Fare | Etrafa bak |
| Sol tık (basılı) | Elindeki aleti kullan |
| 1 / 2 | Beldeki su / köpük tabancası |
| E | Rafa bakarken: alet al / bırak · ekrana bakarken: mağaza |
| Q | Raf aletini bırak, tabancaya dön |
| Tab | Mağaza |
| F | Kir tarayıcı (kalan kir turuncu, cila gereken boya sarı, ıslaklık mavi) |
| M / N | Tüm sesler / fon müziği |

## Oynanış

Oyuncu **su ve köpük tabancası belinde** başlar. Diğer aletler aracın sağındaki rafta durur; bakıp E ile alınır, sıradaki adımın aleti rafta parlar.

**Yıkama paketleri** sıralı adımlardan oluşur; panel her zaman sıradaki adımı ve gereken aleti gösterir:

| Paket | Adımlar | Kazanç |
| --- | --- | --- |
| Standart Temizlik | Su ➔ Köpük ➔ Su (durulama) — kurulama gerekmez | ×1 |
| Detaylı Yıkama | Su ➔ Köpük ➔ Su ➔ Cam ➔ Kurulama ➔ Lastik | ×1.7 |
| Premium Temizlik | Su ➔ Köpük ➔ Su ➔ Cam ➔ Kurulama ➔ Jant ➔ Lastik ➔ Cila | ×2.6 |

- **Su** çamuru söker. **Köpük** yüzeyde kaldıkça lekeleri çözer ve kendiliğinden kaybolmaz; su ile durulanınca çözdüğü lekeyi de götürür.
- Durulamadan sonraki **su lekeleri** kendiliğinden kurumaz; havlu araca serilir ve kaportanın kıvrımlarını takip eder.
- **Jant temizleyici** (tozla temas edince morarır), **lastik parlatıcı**, **cam temizleyici** ve **cila makinesi** mağazadan açılır ve üst paketleri getirir.
- **Premium Şampuan** köpüğün gücünü ve kazancı artırır. **Pembe Nano Köpük** kozmetik bir seçenektir (mağazadan açılıp kapatılır).
- Bahşiş süresi dolmadan bitirirsen %35'e kadar bahşiş eklenir. İlerleme `localStorage`'a kaydedilir.
- Arka planda prosedürel, kısık sesli bir lo-fi müzik döner (N ile kapatılır).

## Mimari

```
src/
  main.js           Oyun döngüsü, renderer, bloom, kontroller, raf etkileşimi, olay akışı
  DirtVolume.js     8 kanallı 3D kir hacmi + malzemelere shader enjeksiyonu (çekirdek mekanik)
  CarParts.js       Parça sınıflandırması (boya/cam/lastik/jant/trim) → köşe başına `aPart`
  CarManager.js     Araç yaşam döngüsü, arka plan yükleme, asenkron shader derleme, yüzey örnekleme
  CarModels.js      Araç kataloğu, GLB hazırlama/yönlendirme, rastgele metalik boya, prosedürel yedek
  Packages.js       Yıkama paketleri, sıralı adımlar, ilerleme hesabı
  Tools.js          Aletlerin davranışı ve birinci şahıs modelleri
  Towel.js          Araç yüzeyine serilen, kıvrımlara uyan kurulama havlusu
  ToolRack.js       Alet rafı, etiketler, mağaza terminali
  Particles.js      Hacimli su/köpük huzmesi, sıçrama, sis, damla ve ışıltı partikülleri
  Environment.js    3 seviyeli prosedürel garaj (Basit → Yenilenmiş → Neon stüdyo)
  EconomyManager.js Para, yükseltmeler, müşteri zamanlayıcı, kayıt, mağaza arayüzü
  HUD.js            DOM tabanlı arayüz
  Audio.js          Prosedürel ASMR sesler (pembe/kahverengi gürültü, kabarcık patlamaları, kompresör)
  Music.js          Prosedürel lo-fi fon müziği (Rhodes akorları, bas, fırça davul, plak cızırtısı)
```

### Kir sistemi

Kir, UV'ye boyanan bir doku yerine **araç-yerel 3D voxel hacminde** tutulur (iki `Data3DTexture`, RGBA8):

- Doku 0: çamur · leke · ıslaklık · köpük
- Doku 1: fren tozu (jant) · lastik matlığı · cam filmi · cila

Bunun nedeni birçok GLB modelinin paylaşılan doku atlası UV'si kullanmasıdır: UV'ye boyamak aynı UV'yi paylaşan tüm
yüzeyleri birden temizlerdi. Hangi katmanın nerede geçerli olduğunu `CarParts.js`'in her köşeye yazdığı parça etiketi
belirler (isim, malzeme, saydamlık ve tekerleklerde doku parlaklığına göre). İç aksam (koltuk, torpido, direksiyon) kirlenmez.

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

Tarayıcı konsolunda `game`: `cleanAll()`, `addMoney(1000)`, `unlockAll()`, `nextCar('premium')`, `setLevel(2)`, `stats()`, `play()`, `fire()`, `teleport(x, z, bakX, bakY, bakZ)`.

## Varlıklar ve lisans

- Araç modelleri: **Daniel Zhabotinsky** — [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/), ayrıntılı künye:
  [`public/models/cars/dz/CREDITS.md`](public/models/cars/dz/CREDITS.md). Dokular web için küçültüldü, boya rengi oyunda değiştiriliyor.
- Diğer tüm görseller (garaj, dokular, tabelalar, aletler), sesler ve müzik kodda prosedürel olarak üretilir.

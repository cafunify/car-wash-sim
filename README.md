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
| T | Erken teslim (ilk basış ücret önizlemesi, ikinci basış onay) |
| Tab | Mağaza |
| F | Kir tarayıcı (kalan kir turuncu, kuş pisliği/böcek mor, cila gereken boya sarı, ıslaklık mavi) |
| M / N / P | Tüm sesler / fon müziği / FPS göstergesi |
| Esc | Menü (Ayarlar: müzik ve efekt sesi, fare hassasiyeti, grafik kalitesi, FPS, eksik yer haritası) |

## Oynanış

Oyuncu **su ve köpük tabancası belinde** başlar. Diğer aletler aracın sağındaki rafta durur; bakıp E ile alınır, sıradaki adımın aleti rafta parlar.

**Yıkama paketleri** sıralı adımlardan oluşur; panel her zaman sıradaki adımı ve gereken aleti gösterir:

| Paket | Adımlar | Kazanç |
| --- | --- | --- |
| Standart Temizlik | Su ➔ Köpük ➔ (Kuş/Böcek) ➔ Su (durulama) — kurulama gerekmez | ×1 |
| Detaylı Yıkama | Su ➔ Köpük ➔ (Kuş/Böcek) ➔ Su ➔ Cam ➔ Kurulama ➔ Lastik | ×1.7 |
| Premium Temizlik | Su ➔ Köpük ➔ (Kuş/Böcek) ➔ Su ➔ Cam ➔ Kurulama ➔ Jant ➔ Lastik ➔ Cila | ×2.6 |

**Kuş/Böcek** adımı yalnızca bu kirlerle gelen araçlarda pakete girer (kuş pisliği ~%55, böcek lekesi ~%60 olasılıkla).

- **Su** çamuru söker. **Köpük** yüzeyde kaldıkça lekeleri çözer ve kendiliğinden kaybolmaz; su ile durulanınca çözdüğü lekeyi de götürür.
- Durulamadan sonraki **su lekeleri** kendiliğinden kurumaz; havlu araca serilir ve kaportanın kıvrımlarını takip eder.
- **Jant temizleyici** (tozla temas edince morarır), **lastik parlatıcı**, **cam temizleyici** ve **cila makinesi** mağazadan açılır ve üst paketleri getirir.
- **Premium Şampuan** köpüğün gücünü ve kazancı artırır. **Pembe Nano Köpük** kozmetik bir seçenektir (mağazadan açılıp kapatılır).
- Su değdiği yerde köpük panelden aşağı süzülür ve etekten damlar.
- **Kuş pisliği** üst yüzeylerde (kaput, tavan, bagaj) beyazımsı-gri lekelerdir. Kurumuş kabuğu su ile çok zor çıkar;
  üzerinde birkaç saniye köpük bekleyince yumuşar, sonra su ile hemen gider. Araç geldikten sonra 90 saniye içinde
  temizlenmezse kurur: teslimde müşteri puanı 1 yıldız düşer (60. saniyede uyarı gelir).
- **Böcek lekeleri** aracın ön yüzünde (tampon, ön cam, aynalar) küçük koyu sarı/siyah noktacıklardır; köpük çözer, su söker.
- Araç istenirse **erken teslim** edilebilir (T): eksik kalan her %1 için ücretten 2$ kesilir, bahşiş verilmez.
- Sol alttaki **eksik yer haritası** aracın sol, sağ ve üst görünüşünde henüz tamamlanmamış noktaları adımın rengiyle gösterir; kalan kuş pisliği/böcek lekeleri mor noktalarla ve adetle işaretlenir; oyuncunun yeri okla işaretlidir.
- Bahşiş süresi dolmadan eksiksiz bitirirsen %35'e kadar bahşiş eklenir. İlerleme ve ayarlar `localStorage`'a kaydedilir.
- Grafik kalitesi: **Düşük** (gölge/parlama/yansıma kapalı, düşük çözünürlük), **Orta** (varsayılan), **Yüksek**.
- Arka planda prosedürel, kısık sesli bir lo-fi müzik döner (N ile kapatılır).

## Mimari

```
src/
  main.js           Oyun döngüsü, renderer, bloom, kontroller, raf etkileşimi, olay akışı
  DirtVolume.js     12 kanallı (10'u dolu) 3D kir hacmi + malzemelere shader enjeksiyonu (çekirdek mekanik)
  CarParts.js       Parça sınıflandırması (boya/cam/lastik/jant/trim) → köşe başına `aPart`
  CarManager.js     Araç yaşam döngüsü, arka plan yükleme, asenkron shader derleme, yüzey örnekleme
  CarModels.js      Araç kataloğu, GLB hazırlama/yönlendirme, rastgele metalik boya, prosedürel yedek
  Packages.js       Yıkama paketleri, sıralı adımlar, ilerleme hesabı
  Tools.js          Aletlerin davranışı ve birinci şahıs modelleri
  Towel.js          Araç yüzeyine serilen, kıvrımlara uyan kurulama havlusu
  Minimap.js        Eksik yer haritası (sol/sağ/üst görünüş, oyuncu konumu)
  ToolRack.js       Alet rafı, etiketler, mağaza terminali
  Particles.js      Hacimli su/köpük huzmesi, sıçrama, sis, damla ve ışıltı partikülleri
  Environment.js    3 seviyeli prosedürel garaj (Basit → Yenilenmiş → Neon stüdyo)
  EconomyManager.js Para, yükseltmeler, müşteri zamanlayıcı, kayıt, mağaza arayüzü
  HUD.js            DOM tabanlı arayüz
  Audio.js          Prosedürel ASMR sesler (pembe/kahverengi gürültü, kabarcık patlamaları, kompresör)
  Music.js          Prosedürel lo-fi fon müziği (Rhodes akorları, bas, fırça davul, plak cızırtısı)
```

### Kir sistemi

Kir, UV'ye boyanan bir doku yerine **araç-yerel 3D voxel hacminde** tutulur (üç `Data3DTexture`, RGBA8):

- Doku 0: çamur · leke · ıslaklık · köpük
- Doku 1: fren tozu (jant) · lastik matlığı · cam filmi · cila
- Doku 2: kuş pisliği · böcek lekesi · (boş) · (boş) — B/A ileride kil bar / katran için ayrıldı

Doku 2'deki noktasal kirler `addSpot()` ile erişilebilir yüzey örneklerinin üstüne tek tek serpilir; küçük oldukları için
ilerlemeleri yüzey örneklerinden değil, eklenirken kaydedilen voxel listesinden hesaplanır. Kuş pisliğinde değer
`BIRD_SOFT`'un üstündeyse kuru kabuktur: köpük onu bu seviyeye kadar yumuşatır, su ancak yumuşamış kısmı hızla söker.

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

Tarayıcı konsolunda `game`: `cleanAll()`, `addMoney(1000)`, `unlockAll()`, `nextCar('premium')`, `setLevel(2)`, `stats()` (kuş/böcek için `bird`, `bugs`, `spots`, `birdHard`), `spots(kuş = 4, böcek = 40)` (aktif araca leke ekler, adım yoksa pakete katar), `etchBird()` (kuş pisliği kuruma süresini doldurur), `play()`, `fire()`, `teleport(x, z, bakX, bakY, bakZ)`.

## Varlıklar ve lisans

- Araç modelleri: **Daniel Zhabotinsky** — [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/), ayrıntılı künye:
  [`public/models/cars/dz/CREDITS.md`](public/models/cars/dz/CREDITS.md). Dokular web için küçültüldü, boya rengi oyunda değiştiriliyor.
- Diğer tüm görseller (garaj, dokular, tabelalar, aletler), sesler ve müzik kodda prosedürel olarak üretilir.

# Parıltı Oto Yıkama

Tarayıcıda çalışan birinci şahıs oto yıkama simülatörü (Three.js + Vite).

**Oyna:** https://cafunify.github.io/car-wash-sim/

Kirli araç gelir → hortum, köpük, sünger ve havluyla temizlersin → para kazanırsın → mağazadan ekipman ve dükkân yükseltmesi alırsın → sıradaki müşteri.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç. Fare kilidi (Pointer Lock) desteklenmeyen ortamlarda (ör. gömülü önizleme panelleri) oyun otomatik olarak serbest fare moduna geçer: sağ tuşla sürükleyerek bakılır, araç imlecin gösterdiği yere nişan alır, Esc duraklatır.

Üretim derlemesi: `npm run build` → `dist/`.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| WASD / oklar | Hareket (Shift: koş) |
| Fare | Etrafa bak |
| Sol tık (basılı) | Aracı kullan |
| 1 / 2 / 3 / 4 veya tekerlek | Hortum / Köpük / Sünger / Havlu |
| E veya Tab | Mağaza |
| F | Kir tarayıcı (kalan kiri turuncu, ıslaklığı mavi gösterir) |
| M | Ses aç/kapat |

## Oynanış

- **Çamur** yalnızca basınçlı hortumla sökülür.
- **Lekeler** süngerle silinir; köpüklü yüzeyde sünger 3 kat hızlıdır. Fareyi hareket ettirerek ovalamak daha hızlı temizler.
- Hortum ve köpük aracı ıslatır, **havlu** ile kurulanmalıdır. Kalan köpük hortumla durulanır.
- Üç katman (çamur, leke, kuruluk) tamamlanınca araç biter ve ödeme alınır. Müşterinin bahşiş süresi dolmadan bitirirsen bahşiş (%35'e kadar) eklenir.
- İlerleme (para, yükseltmeler, yıkanan araç sayısı) `localStorage`'a kaydedilir. Mağazadaki "İlerlemeyi sıfırla" ile silinir.

## Mimari

```
src/
  main.js           Oyun döngüsü, renderer, bloom, PointerLock + WASD, olay akışı
  DirtVolume.js     3D kir hacmi + malzemelere shader enjeksiyonu (çekirdek mekanik)
  CarManager.js     Araç yaşam döngüsü, raycast boyama, yüzey örnekleme / ilerleme
  CarModels.js      Araç kataloğu, GLB hazırlama, prosedürel yedek araç
  Tools.js          Hortum / köpük / sünger / havlu davranışı ve el modelleri
  Particles.js      Su, köpük, damla ve ışıltı partikülleri
  Environment.js    3 seviyeli prosedürel garaj (Basit → Yenilenmiş → Neon stüdyo)
  EconomyManager.js Para, yükseltmeler, müşteri zamanlayıcı, kayıt, mağaza arayüzü
  HUD.js            DOM tabanlı arayüz
  Audio.js          WebAudio ile üretilen sesler (dosya yok)
```

### Kir sistemi

Kir, UV'ye boyanan bir doku yerine **araç-yerel 3D voxel hacminde** (`Data3DTexture`, RGBA8) tutulur:
R = çamur, G = leke, B = ıslaklık, A = köpük. Bunun nedeni GLB modellerinin (Kenney dahil) paylaşılan bir renk atlası
UV'si kullanmasıdır: UV'ye boyamak, aynı UV'yi paylaşan tüm yüzeyleri birden temizlerdi. Hacim yaklaşımı her modelle
çalışır.

- Aracın mevcut `MeshStandard/PhysicalMaterial`'ına `onBeforeCompile` ile kir katmanları eklenir; temiz hal
  orijinal PBR malzemesidir. Kir clearcoat'u ve parlaklığı azaltır, ıslaklık yüzeyi parlatır ve damlalar ekler.
- Raycaster isabet noktası araç-yerel uzaya çevrilir ve yumuşak küresel fırçayla hacim boyanır.
- İlerleme yüzdesi, araç yüzeyinden alan ağırlıklı alınan ve oyuncunun **erişebileceği** noktalardaki
  (tabanlar ve göz hizası üstündeki tavanlar hariç) temiz oranıdır.

### Kendi aracını eklemek

`src/CarModels.js` içindeki `CAR_CATALOG`'a bir kayıt ekle ve `glb` alanına dosya yolunu/URL'sini ver. Model yüklenemezse
`procedural` parametreleriyle primitiflerden araç üretilir. Model önü +Z yönüne bakmalıdır; ölçekleme otomatiktir.

### Debug

Tarayıcı konsolunda `game` nesnesi: `game.cleanAll()`, `game.addMoney(1000)`, `game.setLevel(2)`, `game.stats()`.

## Varlıklar ve lisans

- Araç modelleri: [Kenney Car Kit](https://kenney.nl/assets/car-kit) — CC0 (`public/models/cars/LICENSE-kenney.txt`).
- Diğer tüm görseller (garaj, dokular, tabelalar) ve sesler kodda prosedürel olarak üretilir.

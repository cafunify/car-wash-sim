/**
 * Müdavimler: ismi ve favori aracı olan, birkaç ziyarette küçük bir hikâye anlatan müşteriler.
 * Ceza yok; hikâye her teslimde (yıldızdan bağımsız) ilerler, teşekkür satırı ≥3★ ile görünür.
 * Kayıt: `state.regulars = { id: { visits, lastDay } }`.
 */
const CHANCE = 0.22; // sıradaki müşterinin müdavim olma olasılığı
const MIN_CARS = 3; // ilk araçlar sakin geçsin (rehber)

export const REGULARS = [
  {
    id: 'hasan', name: 'Hasan Amca', car: 'milano95', shop: 0, gift: 60,
    story: [
      { arrive: 'Milano’sunu 95’ten beri kimseye bırakmaz. “Bir tek sana güveniyorum evladım.”', thanks: 'Eline sağlık. Bu araba bana gençliğimi hatırlatıyor.' },
      { arrive: 'Bu sefer yanında torunuyla geldi: “Dede arabası parlasın!”', thanks: 'Torunum bayıldı! Yarın okula bununla gidelim diyor.' },
      { arrive: 'Cebinden eski bir fotoğraf çıkardı: aynı araba, 30 yıl önce, aynı parıltı.', thanks: 'İşte bu! Fotoğraftakinden bile güzel. Al bu da benden.' },
    ],
  },
  {
    id: 'zehra', name: 'Zehra Öğretmen', car: 'compact07', shop: 0, gift: 60,
    story: [
      { arrive: 'Karne gününden önce arabasını yıkatmak istiyor, çocuklar “Hocam yeni araba mı?” desin diye.', thanks: 'Çocuklar fark edecek! Teşekkürler.' },
      { arrive: 'Arka koltukta bir kutu çizim var: öğrencilerinin resimleri.', thanks: 'Bir dahaki sefere sana da bir resim getireceğim.' },
      { arrive: 'Elinde çerçeveli bir çocuk resmi: yıkama dükkânı, güneş ve baloncuklar.', thanks: 'Resim senin. Duvarına as, tamam mı? Bu da küçük bir teşekkür.' },
    ],
  },
  {
    id: 'riza', name: 'Rıza Usta', car: 'kiri86', shop: 0, gift: 70,
    story: [
      { arrive: 'Emekli bir tamirci. Arabasının motorunu yeni elden geçirmiş, dışı da içi gibi olsun istiyor.', thanks: 'Motor da dışı da pırıl pırıl. Usta işi.' },
      { arrive: 'Kaputu açıp sana motoru göstermek için ısrar ediyor.', thanks: 'Gördün mü? Yıkamayı sevenin arabası da sever.' },
      { arrive: 'Yanında küçük bir alet çantasıyla geldi: “Rafın menteşesi gıcırdıyordu.”', thanks: 'Menteşeyi yağladım, bu da yıkama ücretine ek. Sağ ol!' },
    ],
  },
  {
    id: 'nuri', name: 'Nuri Dede', car: 'olympic95', shop: 0, gift: 60,
    story: [
      { arrive: 'Her cuma pazara giderken uğrar. “Sebze kasaları arabayı toz ediyor.”', thanks: 'Pazarcılar bu parlaklığı görünce şaşıracak.' },
      { arrive: 'Bu sefer arka koltukta bir sepet domates var. “Önce yıkama, sonra pazar.”', thanks: 'Domateslerden al, bu sene çok güzel olmuş.' },
      { arrive: 'Pazar tezgâhında senden bahsetmiş. “Herkes buraya yönlendirdim.”', thanks: 'Mahalle seni konuşuyor evladım. Aferin!' },
    ],
  },
  {
    id: 'defne', name: 'Defne', car: 'sigil07', shop: 0, gift: 70,
    story: [
      { arrive: 'Üniversite öğrencisi. Mezuniyet fotoğrafları için arabasını parlatmak istiyor.', thanks: 'Fotoğraflarda harika görünecek!' },
      { arrive: 'Tüm arkadaş grubu arabanın etrafında telefonla video çekiyor.', thanks: 'Videoyu paylaştım, dükkânın adını da yazdım!' },
      { arrive: 'Mezun oldu! Yanında bir buket ve bir kutu çikolata var.', thanks: 'Mezuniyet arabam senin elinden çıktı. Çok teşekkürler!' },
    ],
  },
  {
    id: 'selim', name: 'Selim Bey', car: 'asti89', shop: 1, gift: 100,
    story: [
      { arrive: 'Eski bir yarış pilotu. “Bu araba bir zamanlar pistlerde koştu.”', thanks: 'Eski günleri hatırladım, teşekkürler.' },
      { arrive: 'Bagajda yıpranmış bir kupa var, parlatmanı istiyor.', thanks: 'Kupa da araba da yeni gibi. Kıymetini bilen biri çıktı.' },
      { arrive: 'Sana eski bir yarış rozeti getirdi.', thanks: 'Rozet sende kalsın. Bu dükkân bir pist gibi hızlı ve temiz!' },
    ],
  },
  {
    id: 'yusuf', name: 'Kamyoncu Yusuf', car: 'lct95', shop: 2, gift: 120,
    story: [
      { arrive: 'Uzun yol dönüşü, kamyonetin üstünde üç şehrin tozu var.', thanks: 'Yollardan geldim, yorgunluğum geçti sayılır.' },
      { arrive: 'Kasada bir koli var: “Memleketten reçel getirdim.”', thanks: 'Reçelden ye, annem yaptı. Parıltı gibi tatlı olur.' },
      { arrive: 'Bu sefer yola çıkmadan uğradı: “Şans getirir, temiz arabayla yola çıkılır.”', thanks: 'Yolum açık olsun. Seni unutmam, al bu da bahşiş.' },
    ],
  },
];

const byId = (id) => REGULARS.find((r) => r.id === id);

/** Gün içinde henüz gelmemiş, dükkân seviyesine uygun bir müdavim seç (ya da null) */
export function pickRegular(state, shopLevel, has, force = null) {
  if (force) return byId(force) || null;
  if (state.life.cars < MIN_CARS || Math.random() >= CHANCE) return null;
  const pool = REGULARS.filter((r) => r.shop <= shopLevel && state.regulars?.[r.id]?.lastDay !== state.day && has(r.car));
  return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
}

export const visitsOf = (state, id) => state.regulars?.[id]?.visits || 0;

/** Bu ziyaretin hikâye satırı (hikâye bitince genel bir selam) */
export function lineFor(state, reg) {
  const n = visitsOf(state, reg.id);
  return {
    visit: n + 1,
    arrive: reg.story[n]?.arrive || `${reg.name} yine uğradı, el sallayıp selam verdi.`,
    thanks: reg.story[n]?.thanks || 'Yine harika olmuş, teşekkürler!',
    last: n === reg.story.length - 1,
  };
}

/** Teslimden sonra ziyareti kaydet. Dönüş: son ziyaretse hediye miktarı */
export function recordVisit(state, reg) {
  const rec = (state.regulars[reg.id] ||= { visits: 0, lastDay: 0 });
  const line = lineFor(state, reg);
  rec.visits += 1;
  rec.lastDay = state.day;
  return { ...line, gift: line.last ? reg.gift : 0 };
}

export const storyDone = (state, reg) => visitsOf(state, reg.id) >= reg.story.length;

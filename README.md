# 🔥 Save the BBQ

Ted'in ailesi piknik yapacak — engel olmak isteyenlerin vay haline.

Rogue-lite, TFT tarzı tower defense. Tarayıcıda çalışır, kurulum gerektirmez, tamamen vanilla HTML/CSS/JS.

## 🎮 Oynanış Özeti

- **Board:** 6x4 damalı piknik örtüsü. Birimleri bench'ten sürükleyip yerleştir. Düşmanlar sağdan gelir, önce birimlerine sonra aileye saldırır. Aile de karşılık verip az da olsa hasar verir.
- **🧺 Picnic Basket:** Her hazırlık aşamasında 5 rastgele birim. Sepeti yenilemek **1 aile canına** mal olur.
- **⭐ Birleştirme:** Aynı birimden 3 kopya = otomatik bir üst yıldız (can + hasar x2.2, maks 3⭐). TFT'deki gibi.
- **✨ Boost'lar:** Family, Machine, Scum, Household, Dad Lore. Aynı boost'tan ne kadar çok birim, o kadar güçlü etki (TFT breakpoint mantığı).
- **💵 Dolar:** Savaşta zamanla + dalga sonunda kazanılır, run bitince sıfırlanır.
- **🏅 RP (Respect Point):** Boss dalgasına ulaşınca +1, bossu öldürünce +2. **Kalıcıdır** — Yetenek Ağacı'nda harcanır.
- **50 dalga, 5 bölüm, her 10. dalgada boss.** Final: Skinny Vegan.

## 🖥️ Lokal Test

JSON dosyaları `fetch` ile yüklendiği için `index.html`'e çift tıklamak (file://) **çalışmaz**. Küçük bir sunucu aç:

```bash
cd save-the-bbq
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` aç.

## 🚀 GitHub Pages Yayını

1. Yeni bir repo oluştur (örn. `save-the-bbq`) ve bu klasörün içeriğini push'la:
   ```bash
   git init
   git add .
   git commit -m "Save the BBQ ilk sürüm"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADIN/save-the-bbq.git
   git push -u origin main
   ```
2. Repo'da **Settings → Pages → Source: GitHub Actions** seç.
3. `.github/workflows/static.yml` zaten hazır — her `main` push'unda site otomatik yayınlanır.
4. Adres: `https://KULLANICI_ADIN.github.io/save-the-bbq/`

## 🛠️ İçerik Editörü (Kod Yazmadan Karakter Ekleme)

Ana menüden veya `editor.html`'den ulaşılır. Sekmelerden **Birim / Düşman / Boss / Boost** seç, formu doldur, kaydet — oyun anında kullanmaya başlar.

- Değişiklikler tarayıcının localStorage'ında saklanır (sadece o tarayıcıda geçerli).
- Herkes için kalıcı yapmak istersen: **📤 JSON Dışa Aktar** ile 4 dosyayı indir, `data/` klasöründekilerin üzerine yaz, commit'le. Yayında.
- **♻️ Varsayılanlara Dön** tüm özel içeriği siler.

### Boss fazları
Her boss can oranına göre fazlara ayrılır. "Şu can oranına kadar" = fazın bittiği HP yüzdesi (0.8 = %80'e kadar bu faz aktif). Son faz her zaman **0** olmalı. Faz başına hız çarpanı, dodge, stun bağışıklığı ve yetenekler (birim iptal etme, minyon çağırma, alan stun) tanımlanabilir.

## 🎨 Kendi Çizimlerini Ekleme

Şu an tüm karakterler emoji sembolü kullanıyor. Çizimlerin hazır olunca:

1. Görselleri projeye koy, örn. `img/units/flipper_zipper.png`
2. Editörde ilgili kaydın **Görsel yolu** alanına `img/units/flipper_zipper.png` yaz (veya doğrudan JSON'a `"img": "..."` ekle)
3. `js/ui.js` içindeki sprite render'ında emoji yerine `<img>` kullanacak şekilde küçük bir güncelleme yeterli — `def.img` alanı şimdiden veri modelinde hazır.

## 📁 Dosya Yapısı

```
index.html          Oyun
editor.html         İçerik editörü
css/style.css       Piknik teması
css/editor.css      Editör stili
js/db.js            Veritabanı katmanı (JSON + localStorage merge)
js/game.js          Oyun motoru (savaş, dalgalar, boss fazları, ekonomi)
js/ui.js            Render, sürükle-bırak, ekranlar, yetenek ağacı
js/editor.js        Editör mantığı (CRUD + export/import)
data/units.json     Savunma birimleri
data/enemies.json   Düşmanlar
data/bosses.json    Bosslar (fazlı)
data/traits.json    Boost'lar (breakpoint'li)
data/waves.json     50 dalga / 5 bölüm konfigürasyonu
data/skilltree.json RP yetenek ağacı
```

## ⚖️ Denge Ayarları

Kod açmadan `data/waves.json` üzerinden ayarlanır:
- `hpScalePerLevel` / `damageScalePerLevel`: düşman ölçekleme
- `goldPerWave`, `passiveGold`, `startingGold`: ekonomi
- `familyStartHp`, `familyThornDamage`: aile
- `episodes[].pool / countBase / spawnInterval`: dalga kompozisyonu

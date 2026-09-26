# PoE2 Map Tracker

Path of Exile 2 için map takip aracı. Her map'e hangi waystone ve tabletlerle girdiğini, süreyi, ölümleri, loot'u ve net kârı (loot eksi tablet maliyeti) kaydeder.

## İndirme

[Releases](../../releases) sayfasından son `PoE2-Map-Tracker-x.y.z-portable.exe` dosyasını indir ve çalıştır. Kurulum gerekmez.
SmartScreen uyarırsa: **More info → Run anyway**.

## Nasıl çalışır

1. **Hazırlık (hideout'ta):** Waystone'un ve tabletlerin üstüne gelip `Ctrl+Alt+C` yap. Uygulama panodan okuyup "Sonraki map hazırlığı" kartına ekler.
2. **Tablet maliyeti:** Tabletlerin altındaki alana "3 tablet toplam 20 div, her biri 10 kullanım" gir, **Uygula**'ya bas. Map başına maliyet otomatik düşer. Tabletler map'ten sonra hazırlıkta kalır, kullanım hakkı azalır, bitince düşer.
3. **Map'e gir:** `Client.txt` üzerinden otomatik algılanır. Setup o map'e bağlanır, süre ve ölümler sayılır. Hideout'a gidip aynı map'e dönersen aynı kayıt devam eder.
4. **Loot gir:** Currency butonlarına tıkla. Unique gibi değerli item'ları **Değerli item** alanına Divine değeri ve adıyla ekle (ör. `20` / `Mageblood`).
5. **Sonuç:** Geçmiş sekmesinde tablo, İstatistik sekmesinde karşılaştırmalar, Ayarlar'dan Excel için CSV.

## Kısayollar

| Tuş | Ne yapar |
| --- | --- |
| `Ctrl+Alt+C` (oyunda, item üstünde) | Waystone / tablet'i hazırlığa ekler. `Ctrl+C` de çalışır. |
| `Ctrl+Shift+O` | Oyun üstü paneli (overlay) aç / kapat |
| `Ctrl+Shift+S` | Ekran görüntüsü alır, aktif map'e (hideout'taysan sonraki map'e) ekler |
| Loot butonu: tık / Shift+tık / sağ tık | +1 / +10 / −1 |
| Değerli item formunda `Enter` / `Esc` | Ekle / vazgeç |

Kısayollar Ayarlar'dan değiştirilebilir.

## Overlay (oyun üstü panel)

Sağ üstte her zaman görünen küçük panel: aktif map, süre, ölüm, waystone, tabletler, ilk 4 loot butonu, map'in ve bu saatin net kârı.

- Tıklamak oyundan klavyeyi almaz, alt-tab gerekmez.
- **+ Değerli item** ile oyundan çıkmadan item ekleyebilirsin. Yazarken klavye panele geçer, bitince oyuna döner.
- Sürükleyerek taşınır, yeri hatırlanır. Ayarlar'dan opaklık ve "Sağ üste geri al".
- Oyun **Windowed Fullscreen** modda olmalı. Exclusive fullscreen'de görünmez.

## İstatistik

- **Farm:** Expedition, Breach... (en çok kullanılan tablet türüne göre)
- **3 vs 4 tablet:** city map'ler (4 tablet) ile diğerleri (3 tablet)
- **Tablet setup:** birebir tablet kombinasyonu
- **Saatlik:** her saat kaç map, kaç div
- **Waystone:** Rarity, Pack Size, Monster Effectiveness aralıklarına göre kazanç

Her tabloda: map sayısı, ortalama loot, ortalama maliyet, net/map, net/saat.

## Veri kaynakları

| Veri | Kaynak |
| --- | --- |
| Map giriş/çıkış, area level, süre, ölüm | `Client.txt` log dosyası |
| Waystone / tablet statları | Oyunun `Ctrl+C` item metni (pano) |
| Fiyatlar | poe.ninja PoE2 (Divine bazında, 30 dk'da bir güncellenir) |

Oyunun belleğini okumaz, oyuna tuş göndermez, oyun dosyalarına dokunmaz. GGG'nin üçüncü parti araç kurallarına uygundur.

Veriler: `%APPDATA%\poe2-map-tracker\tracker-data.json`

## Sorun giderme

- **Üstte "Log" kırmızı:** Ayarlar → Client.txt → `...\Path of Exile 2\logs\Client.txt` dosyasını seç.
- **Map algılanmıyor:** Debug sekmesinde log satırları görünüyor mu bak, görünmüyorsa satırları paylaş.
- **Waystone statları boş:** Debug sekmesindeki pano metnini paylaş.

## Geliştirme

```bash
npm install
npm test
npm start          # Mac/Windows'ta çalıştır
npm run dist:win   # Windows exe -> release/
```

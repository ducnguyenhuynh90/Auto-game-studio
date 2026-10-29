# Mắm Village: store listing pack (v1.0)

Everything the uploader needs for App Store Connect and Google Play Console. The text fits each
store's character limits, and `node tools/store-copy-check.mjs` checks them again.

> **Important: these assets show the 3D game.** The screenshots and video were captured from the
> web/3D build, which is what the **Capacitor app** (`android/`, `ios/`, `com.mamvillage.app`,
> `native.yml`) ships. If you upload the React Native app (`mobile/`), its screens look different and
> Apple/Google can reject listings whose screenshots don't match the app. Either ship the Capacitor
> app with this pack, or re-shoot from the RN app (`node tools/store-raw.mjs` makes raw RN captures).

| Asset | File | Store slot |
|---|---|---|
| iPhone screenshots 1320×2868 (EN) | `store/screenshots/ios-6.9/01…07_*.png` | App Store: iPhone 6.9" (Apple scales them down for smaller iPhones) |
| iPhone screenshots (VI) | `store/screenshots/vi/ios-6.9/` | App Store: Vietnamese localization |
| Android phone 1080×1920 (EN) | `store/screenshots/android/01…07_*.png` | Play: Phone screenshots (2–8) |
| Android phone (VI) | `store/screenshots/vi/android/` | Play: vi-VN listing |
| Feature graphic 1024×500 | `store/feature-graphic.png` (VI: `store/screenshots/vi/feature-graphic.png`) | Play: Feature graphic (required) |
| App preview 886×1920, 27.6 s, H.264 30 fps, AAC | `store/video/app-preview-886x1920.mp4` | App Store: App Preview (6.9"); poster frame `store/video/poster.jpg` |
| Promo video 1080×1920 | `store/video/promo-1080x1920.mp4` | Play: upload to YouTube (unlisted is fine) and paste the link; also for socials |
| App icon | `assets/icon-only.png` (1024×1024) / native projects | already in the apps |

The screenshot order is deliberate. The first three are what most people see in search results, so
they show the loop: village → fishing → the jar reveal. The listing frames carry no prices, review
quotes or "#1" claims, which both stores restrict.

---

## App Store Connect (English, primary: en-US)

**Name** (30): `Mắm Village: Cozy Fishing`

**Subtitle** (30): `Fish Sauce Tycoon & Puzzles`

**Promotional text** (170, editable any time without review):
```
Grandpa's last jar is humming. Catch fish, brew legendary fish sauce and turn a storm-wrecked yard into the coziest village on Phú Quốc. New: 50 Market Sort puzzles!
```

**Keywords** (100, comma-separated, no spaces; words already in the name or subtitle are not repeated):
```
idle,farm,island,cook,sort,match,relax,offline,story,vietnam,boat,ocean,catch,sim,business,chill
```

**Description** (≤4000):
```
Grandpa's last jar is humming.

A storm smashed every fish-sauce jar in the yard except one. Lan, a young fisher on the island of Phú Quốc, Vietnam, decides to bring her family's legendary mắm (fish sauce) back to life. There's just one problem: Mr. Tốc of InstaMắm Co. promises sauce in three minutes and wants to buy the whole yard by Tết.

Good mắm can't be rushed. Can Lan prove it?

CAST, HOOK & REEL
• Hold to aim, release to cast, strike when the float dips, then keep the line in the sweet spot as the fish fights.
• 24 fish to discover in your Fishdex, from sardines to the legendary fish of the deep.
• Food chains, rare catches and gadgets like sonar and pearl lures.

BREW LEGENDARY FISH SAUCE
• Fill clay jars with fresh fish and sea salt, seal them and let time do the work.
• Knock, knock, knock… open the jar and see how fine your sauce turned out. Every result is decided honestly, never faked.
• Bottle it, sell it at the market and build your brand.

GROW A COZY ISLAND VILLAGE
• Build a dock, salt field, brewhouse, sauce shop, lanterns and a tour office.
• Hire and train a crew of fishers, brewers and guides. They keep working while you're away.
• Welcome tourists, run festivals and land export contracts.
• Make friends with Mực, a loyal Phú Quốc Ridgeback who barks at rare fish.

RELAXING PUZZLES
• 50 Market Sort levels: match three goods on the stalls, from super easy to brain-teasing.
• Salt-channel puzzles, shop-order puzzles and fishing challenges.

SAIL FIVE SEAS OF VIETNAM
• From the Phú Quốc lagoon to the Coral Reef, the Mangrove Delta, Hạ Long Bay and the Abyss.
• A story told in chapters, with a cast of warm, funny characters: Bà Năm the fish-sauce master, Rùa the old sea turtle, Cô Hạnh the lighthouse keeper and more.

MADE TO BE KIND
• No ads. No payments. No loot boxes.
• Plays offline. Optional account and cloud save.
• Delete your account at any time from Settings.

Slow but sure. Welcome to Mắm Village.
```

**What's New** (version 1.0):
```
Welcome to Mắm Village! Our first release: fishing, jar brewing, your island business, five seas, Mực the dog and 50 Market Sort puzzles. We'd love to hear what you think.
```

**Category:** Games, primary *Simulation*, secondary *Casual*.
**Age rating:** 4+ (no violence, gambling, user content or web access).
**Price:** Free. No In-App Purchases.
**Privacy ("App Privacy" questionnaire):** see `docs/STORE_RELEASE.md` → Data safety. In short: an anonymous
install id and gameplay events only after the player says yes; an account email only if they sign in;
no tracking, no ads.
**Support URL:** your site or the GitHub Pages build. **Marketing URL (optional):**
https://ducnguyenhuynh90.github.io/Auto-game-studio/

## App Store Connect (Vietnamese localization: vi)

**Tên** (30): `Mắm Village: Làng Chài`

**Phụ đề** (30): `Câu Cá, Ủ Mắm & Xếp Hàng`

**Văn bản quảng cáo** (170):
```
Chum mắm của ông đang ngân nga. Câu cá, ủ nước mắm huyền thoại và biến khoảng sân sau bão thành ngôi làng ấm cúng nhất Phú Quốc. Mới: 50 màn Xếp Hàng Chợ!
```

**Từ khóa** (100):
```
câu cá,nước mắm,phú quốc,nông trại,đảo,kinh doanh,giải đố,thư giãn,offline,việt nam,biển,thuyền
```

**Mô tả**:
```
Chum mắm cuối cùng của ông đang ngân nga.

Cơn bão đã đập vỡ mọi chum mắm trong sân, trừ một chiếc. Lan, cô gái làng chài trên đảo Phú Quốc, quyết tâm làm sống lại nước mắm gia truyền. Nhưng ông Tốc của InstaMắm Co. hứa "mắm ba phút" và muốn mua cả khoảng sân trước Tết.

Mắm ngon không thể vội. Lan có chứng minh được không?

THẢ CÂU, GIẬT, KÉO
• Giữ để ngắm, thả để quăng câu, giật khi phao chìm, giữ dây trong vùng an toàn khi cá vùng vẫy.
• 24 loài cá trong Sổ Cá, từ cá cơm đến cá huyền thoại dưới biển sâu.
• Chuỗi thức ăn, cá hiếm và bảo bối như máy dò, mồi ngọc trai.

Ủ NƯỚC MẮM HUYỀN THOẠI
• Cho cá tươi và muối biển vào chum sành, đậy kín và để thời gian làm phần còn lại.
• Cốc, cốc, cốc… mở chum xem mẻ mắm được bao nhiêu độ đạm. Kết quả luôn trung thực, không gian lận.
• Đóng chai, bán ở chợ và gây dựng thương hiệu.

XÂY LÀNG CHÀI ẤM CÚNG
• Xây bến thuyền, ruộng muối, nhà ủ, cửa hàng mắm, đèn lồng và văn phòng du lịch.
• Thuê và đào tạo thợ câu, thợ ủ, hướng dẫn viên. Họ vẫn làm việc khi bạn vắng mặt.
• Đón khách du lịch, mở lễ hội, ký hợp đồng xuất khẩu.
• Kết bạn với Mực, chú chó Phú Quốc trung thành biết sủa khi có cá hiếm.

GIẢI ĐỐ THƯ GIÃN
• 50 màn Xếp Hàng Chợ: ghép ba món hàng trên sạp, từ rất dễ đến hack não.
• Giải đố kênh muối, đơn hàng cửa tiệm và thử thách câu cá.

VƯỢT NĂM VÙNG BIỂN VIỆT NAM
• Từ đầm phá Phú Quốc đến rạn san hô, rừng ngập mặn, vịnh Hạ Long và vực thẳm đại dương.
• Câu chuyện theo từng chương với dàn nhân vật ấm áp, hài hước: Bà Năm, cụ Rùa, cô Hạnh giữ hải đăng…

TỬ TẾ VỚI NGƯỜI CHƠI
• Không quảng cáo. Không thanh toán. Không hộp quà may rủi.
• Chơi offline. Tài khoản và lưu đám mây tùy chọn.
• Xóa tài khoản bất cứ lúc nào trong Cài đặt.

Chậm mà chắc. Chào mừng đến Mắm Village.
```

**Có gì mới** (1.0):
```
Chào mừng đến Mắm Village! Phiên bản đầu tiên: câu cá, ủ mắm, kinh doanh trên đảo, năm vùng biển, chú chó Mực và 50 màn Xếp Hàng Chợ. Hãy cho chúng tôi biết cảm nhận của bạn!
```

---

## Google Play Console

**App name** (30): `Mắm Village: Cozy Fishing`

**Short description** (80):
```
Catch fish, brew legendary fish sauce & grow a cozy island village in Vietnam!
```

**Full description** (≤4000): use the App Store description above. Play indexes the full text, so it
already repeats the key phrases naturally: *fishing game, fish sauce, island village, tycoon, puzzles,
cozy, offline, Vietnam*. Optional additions for Play's search, as a final paragraph:
```
Love cozy fishing games, island farm sims, idle tycoon games and relaxing match-3 sort puzzles? Mắm Village brings them together in a heartfelt story from Vietnam, free with no ads.
```

**vi-VN:** tên `Mắm Village: Làng Chài` · mô tả ngắn:
```
Câu cá, ủ nước mắm huyền thoại và xây làng chài ấm cúng trên đảo Phú Quốc!
```
Full description: use the Vietnamese App Store text.

**Category:** Game → Simulation. **Tags:** Casual, Fishing, Tycoon, Relaxing, Offline, Puzzle.
**Content rating (IARC):** Everyone / PEGI 3 expected (no violence, no gambling, no user interaction).
**Ads:** No. **In-app purchases:** No. **Data safety:** as in `docs/STORE_RELEASE.md`.

---

## Notes on the ASO choices

- **The name carries the main keyword.** "Fishing" is the highest-traffic term that honestly describes
  the game. "Cozy" matches a fast-growing search and browse audience. "Mắm Village" is the brand; Apple
  indexes it without diacritics too ("mam village").
- **The subtitle adds the second cluster**: tycoon (the business sim audience), puzzles (Market Sort),
  and fish sauce (unique and memorable, with no competition).
- **Apple keywords** never repeat words from the name or subtitle, because Apple combines all three
  fields. They use singular forms and no spaces, and include no competitor or trademarked names.
- **Vietnamese localization** is a second keyword set for Vietnam *and* for players in other countries
  whose phones are set to Vietnamese. Vietnamese searches like "câu cá" and "nước mắm" have little
  competition.
- **Promotional text** can change without review. Use it for events (Tết festival, new seas).
- After launch, compare the first-screenshot variants with Product Page Optimization (App Store) or
  Store listing experiments (Play): village-first versus fishing-first. Log the result as an
  EXP in `studio/EXPERIMENTS.md`.

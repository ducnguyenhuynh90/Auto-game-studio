# Mắm Village: Story Bible

> **Theme: *Chậm mà chắc*, "slow but sure."**
> Fish sauce cannot be rushed. Neither can a person.

This theme was chosen because the game's mechanics already *are* the theme: jars get better the longer
they age, overcasting tangles the line, and a reel pulled too hard snaps. The story only says out loud
what the player feels in their thumbs. (Pixar: theme should come from the world, not be pasted on.)

---

## 1 · The hero

**Lan, 14**, the last kid in a fading fishing village on Vietnam's central coast.

| Pixar character tool | Lan |
|---|---|
| **Want** (external, what she chases) | Save the village from being sold, *fast*, and maybe win enough fame to leave for the big city. |
| **Need** (internal, what she must learn) | Good things take time. Patience is not slowness; it is care. |
| **Flaw** | Impatient. Pulls too hard, casts too far, opens jars too early. |
| **Strength** | Brave, funny, never quits. Talks to the jars like they're pets. |
| **Specific details** (Pixar: specificity creates belief) | Wears her grandmother's **nón lá, two sizes too big**; it tips over her eyes when she's embarrassed. Counts "*Một, hai, ba, kéo!*" (one, two, three, pull!) when reeling. Names every jar. |
| **Appeal** | Optimistic underdog with a big hat and a bigger promise. |
| **Arc** | Starts: "Faster is better." Ends: "Some things you can't hurry. You can only care for them." |

Gameplay mirror: the overcast **tangle** is Lan's flaw made tactile; **aging stars** are her need, rewarded.

## 2 · The cast

| Character | Role | Want / truth | Details |
|---|---|---|---|
| **Bà Năm** (Grandma Năm) | Mentor | The village's fish-sauce master. Her **memory is fading**; she remembers through *taste*. Each relic Lan brings back unlocks a memory of the lost family recipe. | Purple áo bà ba, grey bun, bamboo ladle. Speaks in proverbs. Lives in the village (the 3D villager). |
| **Rùa** (Old Turtle) | Sidekick | Ancient sea turtle who joins Lan's boat after the Lagoon story (the Turtle Buddy relic). Never speaks; blinks. Secretly the guardian of the five seas. | Mossy shell, a barnacle "crown". Comic timing: slow blink after Lan rushes. |
| **Ông Tốc** (Mr. Tốc, "Speed") | Rival / mirror | Owner of **InstaMắm Co.**, factory fish sauce in 3 minutes. Wants to buy the village jars. Not evil: grew up poor and believes speed is the only way out. **He is Lan's flaw grown up.** | Shiny suit, sunglasses, a stopwatch he checks constantly. |
| **Chú Tư** (Uncle Tư) | Delta guide | Prawn fisherman who loves mắm tôm and jokes about its smell. Teaches humility: good things can smell bad. | Muddy boots, laughs at his own jokes. |
| **Cô Hạnh** (Ms. Hạnh) | Dragon Bay guide | Lighthouse keeper who tells the legend of **cá chép hóa rồng**, the carp that leaps the Dragon Gate and becomes a dragon. | Lantern, calm voice, knows every tide. |

## 3 · The Story Spine (Pixar)

| Beat | Story | When it plays |
|---|---|---|
| **Once upon a time…** | …in a little fishing village, Lan helped her grandmother make fish sauce the slow, old way. | Intro scene (first launch) |
| **Every day…** | …Lan fished at dawn and dreamed of faster things: speedboats, the city, quick money. | Intro scene |
| **One day…** | …a storm smashed the jar yard. Bà Năm's memory slipped, and the family's legendary recipe was lost. And Mr. Tốc arrived with an offer to buy everything. | Intro scene |
| **Because of that…** | …Lan promised to rebuild the jar yard and find the recipe again, before the village is sold. | Tutorial (first sale, first gear) |
| **Because of that…** | …she sailed sea by sea, and each sea taught her something the recipe needed. | Each sea: arrive + story complete |
| **Until finally…** | …in the Abyss, with the Oarfish caught and the last jar aged, she understood the secret ingredient was never a fish. It was **time**. | Finale |
| **Ever since then…** | …the village thrives, Lan teaches the kids to wait for their jars, and Mr. Tốc buys his sauce from Lan. | Epilogue (after finale) |

## 4 · Chapters (one per sea): lesson, mentor, memory

| Chapter | Title | Lesson | Mentor | Memory unlocked (relic) |
|---|---|---|---|---|
| 0 · Tutorial | *The Promise* | Start small. | Bà Năm | — |
| 1 · Home Lagoon | *Fresh Hands* | Care: fresh fish, gentle line. | Bà Năm | "The recipe begins with care." (Turtle Buddy joins) |
| 2 · Coral Reef | *Into the Deep* | Courage: go where it's scary. | Rùa | "Rare fish from deep water." (Ancient Compass) |
| 3 · Mangrove Delta | *Muddy Roots* | Humility: the smelliest jar can be the best. | Chú Tư | "The jar must breathe." (Dragon Jar Glaze) |
| 4 · Dragon Bay | *The Dragon Gate* | Perseverance: the carp leaps a thousand times. | Cô Hạnh | "Wait for the right moment." (Storm Kite) |
| 5 · The Abyss | *The Longest Fish* | Patience: let go of shortcuts. | Rùa + Bà Năm | "The secret is time." (Heart of the Sea) |

## 5 · Mission framing

Every mission has a **giver** and a **reason** (Pixar: every scene must want something).
The reason is shown in the Captain's Log under the mission, and as a one-line reaction when it completes.
See `src/core/story.ts` for the exact lines.

## 6 · Rules we follow (from Pixar's "22 rules", the ones that matter for a mobile game)

- **#1** We admire a character for trying more than for succeeding → missions reward attempts (fresh ★★
  catches), and failure lines are warm, never mocking.
- **#4** The Story Spine is the backbone (above).
- **#6** What is the hero good at? Throw the opposite at them → Lan is fast; the world demands patience.
- **#13** Give characters opinions → Mr. Tốc *believes* in speed, and he's half right.
- **#16** What are the stakes? → The village gets sold if Lan fails (soft stakes; no real fail state).
- **#19** Coincidences that get characters *out* of trouble are cheating → relics are earned, not gifted.

## 7 · Mobile constraints

- Scenes are **≤ 6 lines**, **≤ 90 characters per line**, always **skippable**, and replayable from the
  Captain's Log. The intro is the shortest scene, because players came to play.
- **Measure, don't assume:** `story_view` events record lines read vs skipped (EXP-004). If most players
  skip, the story moves into ambient lines (mission reasons, villager tips) instead of scenes.
- **Cultural respect:** Vietnamese names, proverbs (*chậm mà chắc*), the carp-and-dragon-gate legend and
  mắm tôm are used with care and without caricature. Anything sensitive gets a native-speaker review
  before public launch (backlog).

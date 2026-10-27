// Story layer (see docs/STORY.md): cast, story-spine scenes with triggers, and a reason for every mission.
// Pure data + trigger rules, so scenes can't desync from progress.
import type { GameState } from './state';

export type CharacterId = 'lan' | 'nam' | 'rua' | 'toc' | 'tu' | 'hanh' | 'muc';

export interface Character {
  id: CharacterId;
  name: string;
  title: string;
  color: string; // name-tag colour
}

export const CAST: Record<CharacterId, Character> = {
  lan: { id: 'lan', name: 'Lan', title: 'Young fisher', color: '#3d6f8f' },
  nam: { id: 'nam', name: 'Bà Năm', title: 'Fish-sauce master', color: '#7a4a9a' },
  rua: { id: 'rua', name: 'Rùa', title: 'Old sea turtle', color: '#4f8a48' },
  toc: { id: 'toc', name: 'Mr. Tốc', title: 'InstaMắm Co.', color: '#5a6470' },
  tu: { id: 'tu', name: 'Chú Tư', title: 'Delta prawn fisher', color: '#8a6238' },
  hanh: { id: 'hanh', name: 'Cô Hạnh', title: 'Lighthouse keeper', color: '#c0603e' },
  muc: { id: 'muc', name: 'Mực', title: 'Phú Quốc Ridgeback', color: '#3a3330' },
};

export interface Line {
  who: CharacterId;
  text: string;
}

export interface StoryScene {
  id: string;
  /** Chapter card shown before the first line. */
  chapter?: { number: string; title: string };
  lines: Line[];
  /** Where it may play: in the village hub or when a fishing trip starts. */
  where: 'village' | 'fishing';
  /** Plays once, the first time this is true. */
  when: (s: GameState) => boolean;
}

const relic = (s: GameState, r: string) => s.relics.includes(r as never);

export const SCENES: StoryScene[] = [
  {
    id: 'intro',
    where: 'village',
    chapter: { number: 'Chapter 0', title: 'The Promise' },
    when: (s) => s.stats.casts === 0,
    lines: [
      { who: 'lan', text: "Bà! The storm smashed every jar in the yard… except Grandpa's. Listen. It's humming." },
      { who: 'nam', text: "Humming? Then it's hungry. Your grandfather's jars were always greedy." },
      { who: 'toc', text: "*beep* Tốc, InstaMắm Co. Sauce in three minutes. I'll buy this junkyard by Tết." },
      { who: 'lan', text: "Junkyard?! This yard made the best mắm on Phú Quốc. I'll make it again. Faster!" },
      { who: 'nam', text: "Our family recipe went with the storm, child. …Mostly. (she pats the humming jar)" },
      { who: 'nam', text: "Feed the jar. Three fish, fresh. Then we'll see what it remembers." },
    ],
  },
  {
    id: 'first_sale',
    where: 'village',
    when: (s) => s.stats.sold >= 1,
    lines: [
      { who: 'nam', text: "(one sip) …Salty. Sweet. Alive. Wait. I know this taste." },
      { who: 'lan', text: "Bà? Did you remember something?" },
      { who: 'nam', text: "A boy in a too-big hat, rushing every jar. Your grandfather, at your age. Ha!" },
      { who: 'lan', text: "Bà, look! Under the glaze of his jar… there are letters scratched in the clay." },
      { who: 'nam', text: "Letters? I… forgot what they say. Yes. Forgot. Very sad. Keep filling that jar." },
    ],
  },
  {
    // Played by the fishing scene the first time a hungry fish rises (never picked by pendingScene).
    id: 'food_chain',
    where: 'fishing',
    when: () => false,
    lines: [
      { who: 'nam', text: "Lan! That big one smelled your catch. Cá lớn nuốt cá bé: big fish eat small fish." },
      { who: 'lan', text: "So I catch the small one… and the big one comes to ME? That's genius. Lazy genius." },
      { who: 'nam', text: "Not lazy. Patient. Small, then bigger, then biggest. Think before you cast." },
    ],
  },
  {
    id: 'dog_arrive',
    where: 'village',
    when: (s) => s.stats.sold >= 1 && s.storySeen.includes('first_sale'),
    lines: [
      { who: 'lan', text: "Bà, a skinny black puppy just stole my sandal. And he looks… proud of it?" },
      { who: 'nam', text: "A Phú Quốc dog. See that ridge on his back? The fur grows the wrong way." },
      { who: 'nam', text: "Only three breeds in the world have that ridge. Ours is one. Stubborn as the sea." },
      { who: 'lan', text: "He's black as squid ink. Mực! Give back my sandal, Mực!" },
      { who: 'muc', text: "(Mực drops the sandal next to your fish bucket. Then he stares at the bucket.)" },
      { who: 'nam', text: "He's bargaining. Feed him and he'll never forget you. Rush him and he's gone." },
    ],
  },
  {
    id: 'dog_trust',
    where: 'village',
    when: (s) => s.dog.fed >= 3,
    lines: [
      { who: 'muc', text: "(Mực brings back your sandal. Then the other one. Then Bà Năm's.)" },
      { who: 'lan', text: "He follows me everywhere now. EVERYWHERE. Even to the toilet." },
      { who: 'nam', text: "He chose you. Slowly: the only way that lasts. A dog who chooses needs a home." },
    ],
  },
  {
    id: 'dog_boat',
    where: 'village',
    when: (s) => s.dog.house,
    lines: [
      { who: 'lan', text: "Mực, want to come fishing?" },
      { who: 'muc', text: "GÂU GÂU! (He was in the boat before you finished the question.)" },
      { who: 'nam', text: "Watch his nose at sea. A Phú Quốc dog smells a rare fish before it bites." },
    ],
  },
  {
    id: 'dog_done',
    where: 'village',
    when: (s) => s.dog.catches >= 3,
    lines: [
      { who: 'lan', text: "Mực barked at a shadow and it was a rare one! Who's a genius? You are!" },
      { who: 'toc', text: "*beep* A fish-finding dog. Efficient. I'll pay you his weight in sauce. Twice." },
      { who: 'lan', text: "He's not for sale, Mr. Tốc. Some things you can't buy. You have to wait for them." },
      { who: 'toc', text: "…Wait? (he looks at his stopwatch as if it insulted him)" },
    ],
  },
  {
    // Played the first time the island map opens (never picked by pendingScene).
    id: 'island_intro',
    where: 'village',
    when: () => false,
    lines: [
      { who: 'nam', text: "One pair of hands can't save a village, Lan. Not even yours. Hire help." },
      { who: 'lan', text: "If staff fish and brew and sell… what's left for me?" },
      { who: 'nam', text: "The hard parts. Fix the problems, then teach them what you learned. That's a master." },
      { who: 'toc', text: "*beep* Staff? I have machines that never sleep. Let's see whose island grows faster." },
    ],
  },
  {
    id: 'tutorial_done',
    where: 'village',
    when: (s) => s.goalsDone.includes('gear1'),
    lines: [
      { who: 'toc', text: "*beep* New rod, kid? My factory made ten thousand bottles while you tied that knot." },
      { who: 'lan', text: "…Ten thousand?! Bà, maybe we should hurry. Like, a lot." },
      { who: 'nam', text: "A river that rushes carries only sand. (ladle tap) Finish the Phú Quốc story." },
      { who: 'lan', text: "Fine. Slow and sure. …But slow and sure QUICKLY. Một, hai, ba, kéo!" },
    ],
  },
  {
    id: 'done_lagoon',
    where: 'village',
    chapter: { number: 'Chapter 1 complete', title: 'Fresh Hands of Phú Quốc' },
    when: (s) => relic(s, 'turtle'),
    lines: [
      { who: 'rua', text: "…" },
      { who: 'lan', text: "A TURTLE climbed into my boat. He's staring at me. A lot. Hello?" },
      { who: 'rua', text: "…  (one slow blink. It takes four whole seconds.)" },
      { who: 'nam', text: "Rùa! He fished with your grandfather. He's been waiting for someone patient." },
      { who: 'lan', text: "Bà, the jar hums louder now. And one word came clear under the glaze: CARE." },
      { who: 'nam', text: "Care. Fresh fish, gentle line. That's his first word. The next waits on the Reef." },
    ],
  },
  {
    id: 'arrive_reef',
    where: 'fishing',
    chapter: { number: 'Chapter 2', title: 'Into the Deep' },
    when: (s) => s.sea === 'reef',
    lines: [
      { who: 'lan', text: "The water's so dark out here… what if something BIG bites?" },
      { who: 'rua', text: "…  (nudges the rod toward the deepest water)" },
      { who: 'lan', text: "Deeper? Fine. But if it's a sea monster, you go first, shell boy." },
    ],
  },
  {
    id: 'done_reef',
    where: 'village',
    chapter: { number: 'Chapter 2 complete', title: 'Into the Deep' },
    when: (s) => relic(s, 'compass'),
    lines: [
      { who: 'lan', text: "Bà! A compass in the coral, with Grandpa's initials. It glows near rare fish!" },
      { who: 'nam', text: "He lost that the year you were born. He went too deep, too fast. Like someone I know." },
      { who: 'lan', text: "And the glaze shows a new word: DEEP. Grandpa left us a trail, didn't he?" },
      { who: 'toc', text: "*beep* Treasure hunting? My sauce doesn't need treasure. Or, honestly, fish." },
      { who: 'nam', text: "Next, the Mangrove Delta. Find Chú Tư. And bring a clothespin for your nose." },
    ],
  },
  {
    id: 'arrive_delta',
    where: 'fishing',
    chapter: { number: 'Chapter 3', title: 'Muddy Roots' },
    when: (s) => s.sea === 'delta',
    lines: [
      { who: 'tu', text: "Năm's granddaughter! Welcome to the mud. Do you like mắm tôm?" },
      { who: 'lan', text: "The purple one that smells like… the whole ocean sneezed?" },
      { who: 'tu', text: "Ha! The best things smell the worst. Your grandpa said that. About me!" },
      { who: 'tu', text: "Catch me prawns, and I'll show you what he hid in my roof thirty years ago." },
    ],
  },
  {
    id: 'done_delta',
    where: 'village',
    chapter: { number: 'Chapter 3 complete', title: 'Muddy Roots' },
    when: (s) => relic(s, 'dragonjar'),
    lines: [
      { who: 'nam', text: "Tư's old jar lid… with your grandfather's word on it: BREATHE. The jar must breathe!" },
      { who: 'toc', text: "*beep* Strange. My factory sauce tastes… flat this year. Customers noticed." },
      { who: 'lan', text: "Maybe your sauce needs to breathe, Mr. Tốc. Jars aren't machines." },
      { who: 'toc', text: "Time is money, kid. …Isn't it? (his stopwatch ticks. For once he doesn't look.)" },
      { who: 'nam', text: "Hạ Long Bay is next. Ask Cô Hạnh about the carp who would not give up." },
    ],
  },
  {
    id: 'arrive_bay',
    where: 'fishing',
    chapter: { number: 'Chapter 4', title: 'The Dragon Gate' },
    when: (s) => s.sea === 'bay',
    lines: [
      { who: 'hanh', text: "Welcome to Hạ Long, 'where the dragon came down'. Your grandfather loved this light." },
      { who: 'hanh', text: "Long ago, dragons guarded this coast. The jewels they spat became these islands." },
      { who: 'hanh', text: "And a carp swam upriver to the Dragon Gate falls. It leapt and fell a thousand times." },
      { who: 'hanh', text: "On the thousand-and-first leap, it became a dragon." },
      { who: 'lan', text: "A thousand times? I get grumpy after three missed bites…" },
      { who: 'hanh', text: "Then this bay will teach you. The Dragon Carp bites only for the patient." },
    ],
  },
  {
    id: 'done_bay',
    where: 'village',
    chapter: { number: 'Chapter 4 complete', title: 'The Dragon Gate' },
    when: (s) => relic(s, 'kite'),
    lines: [
      { who: 'lan', text: "Bà, I waited for the right moment, and the Dragon Carp leapt into my net! WAIT!" },
      { who: 'nam', text: "Wait. The fourth word. One left. (her ladle trembles, just a little)" },
      { who: 'toc', text: "Kid. Can I taste one of your jars? …For research." },
      { who: 'toc', text: "(he tastes. His stopwatch stops.) …I swept this jar yard once. When I was a boy." },
      { who: 'toc', text: "Your grandfather said I was too fast. So I built a factory to prove him wrong." },
      { who: 'nam', text: "The last word lives where light never reaches. The Abyss. Take Rùa." },
    ],
  },
  {
    id: 'arrive_trench',
    where: 'fishing',
    chapter: { number: 'Chapter 5', title: 'The Longest Fish' },
    when: (s) => s.sea === 'trench',
    lines: [
      { who: 'lan', text: "It's so dark. No shortcuts down here, huh, Rùa?" },
      { who: 'rua', text: "…  (settles in, like he's ready to wait a hundred years)" },
      { who: 'lan', text: "Okay. We wait. Together. Chậm mà chắc." },
    ],
  },
  {
    id: 'finale',
    where: 'village',
    chapter: { number: 'Finale', title: 'Ever Since Then' },
    when: (s) => relic(s, 'pearlheart'),
    lines: [
      { who: 'nam', text: "The jar is singing, Lan. Read his last word." },
      { who: 'lan', text: "TIME. Care, deep, breathe, wait… time. Bà. You never forgot the recipe. Did you?" },
      { who: 'nam', text: "Forgot? (ladle tap) I was waiting for you to learn it with your own two hands." },
      { who: 'toc', text: "I'd like to buy your sauce, Lan. Not the village. Just the sauce. …Please?" },
      { who: 'lan', text: "Deal. But you wait for it like everyone else, Mr. Tốc!" },
      { who: 'rua', text: "…  (the happiest slow blink in the history of the sea)" },
    ],
  },
];

/** First unseen scene that may play here now. */
export function pendingScene(s: GameState, where: 'village' | 'fishing'): StoryScene | null {
  return SCENES.find((sc) => sc.where === where && !s.storySeen.includes(sc.id) && sc.when(s)) ?? null;
}

export function markSeen(s: GameState, id: string): void {
  if (!s.storySeen.includes(id)) s.storySeen.push(id);
}

/** Who asked for each mission, why, and what they say when it's done (Pixar: every scene wants something). */
export const MISSION_STORY: Record<string, { giver: CharacterId; why: string; done: string }> = {
  l_good: { giver: 'nam', why: 'Fresh fish make honest sauce. Show me gentle hands.', done: 'Gentle hands! The jars will thank you.' },
  l_sardine: { giver: 'nam', why: 'Sardines for the Hàm Ninh market tomorrow morning.', done: 'Five sardines! The neighbours will eat tonight.' },
  l_fine: { giver: 'nam', why: 'Phú Quốc mắm is famous everywhere. Make one worthy of the name.', done: 'Real Phú Quốc mắm. My memory stirs…' },
  l_mackerel: { giver: 'lan', why: 'Mackerel swim too deep for my line… unless a hungry one comes up to eat.', done: 'Deep water isn\'t so scary after all.' },
  r_snapper: { giver: 'rua', why: 'Rùa keeps staring at a red shadow by the coral…', done: 'Rùa blinked twice. I think that\'s a "well done".' },
  r_squid: { giver: 'nam', why: 'Squid ink for the recipe notes, I think. Or for supper.', done: 'Enough squid for notes AND supper!' },
  r_reserve: { giver: 'nam', why: 'Your grandfather brewed Reef Reserve. Try it.', done: 'Just like his. He would be proud.' },
  r_crate: { giver: 'lan', why: 'Grandpa\'s old crates are still down there somewhere!', done: 'Treasure! Grandpa really did hide things.' },
  d_prawn: { giver: 'tu', why: 'No prawns, no mắm tôm. Catch me a good bucketful!', done: 'That\'s a proper bucket! Now we brew.' },
  d_shrimp: { giver: 'tu', why: 'Two prawns or more in a jar: brave enough for mắm tôm?', done: 'Smell that? That\'s the smell of success. Ha!' },
  d_snakehead: { giver: 'tu', why: 'The big snakehead under the roots has stolen my bait for years.', done: 'Finally! You have no idea how long I waited.' },
  d_mudskipper: { giver: 'tu', why: 'Mudskippers walk on mud. Catch them, if you can stop laughing.', done: 'Fish that walk! The delta is full of surprises.' },
  b_cuttle: { giver: 'hanh', why: 'Cuttlefish hide in plain sight. Learn to look closely.', done: 'You saw what others miss.' },
  b_good: { giver: 'hanh', why: 'The bay rewards steady hands. Land them fresh.', done: 'Steady as the lighthouse.' },
  b_lobster: { giver: 'hanh', why: 'A spiny lobster guards the deep rocks. Be bold, but careful.', done: 'Bold and careful. That is rare.' },
  b_carp: { giver: 'hanh', why: 'The Dragon Carp. It only bites for the patient.', done: 'It leapt for you. Remember this feeling.' },
  t_angler: { giver: 'rua', why: 'Little lights in the dark… Rùa wants to see them up close.', done: 'Tiny lanterns of the deep. Beautiful.' },
  t_squid: { giver: 'lan', why: 'Giant Squid. I\'m not scared. (I\'m very scared.)', done: 'I did it! …Can we go home now? Kidding.' },
  t_legend: { giver: 'nam', why: 'A Legendary sauce. Only time and care can make it.', done: 'Legendary. You understand now, don\'t you?' },
  t_oarfish: { giver: 'rua', why: 'The longest fish alive. The last memory of the recipe.', done: 'The last memory returns…' },
};

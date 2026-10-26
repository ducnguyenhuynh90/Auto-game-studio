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
      { who: 'nam', text: 'On Phú Quốc, our village once made the finest fish sauce in all of Vietnam…' },
      { who: 'lan', text: 'Bà! The storm smashed the jar yard. Only one jar survived!' },
      { who: 'nam', text: 'And my old head forgot our family recipe. The Dragon Gate Reserve…' },
      { who: 'toc', text: 'Sell me the village, granny. My factory makes sauce in 3 minutes!' },
      { who: 'lan', text: 'Never! I\'ll rebuild the jar yard and find the recipe. I promise!' },
      { who: 'nam', text: 'Then start small, little one. Catch three fish. Chậm mà chắc: slow but sure.' },
    ],
  },
  {
    id: 'first_sale',
    where: 'village',
    when: (s) => s.stats.sold >= 1,
    lines: [
      { who: 'nam', text: 'Mm… salty, sweet, alive. I remember this taste.' },
      { who: 'lan', text: 'Was it fast enough? I opened it the second it was ready!' },
      { who: 'nam', text: 'Fast? Ha! Let a jar sit longer and it gets stronger. Like you will.' },
    ],
  },
  {
    // Played by the fishing scene the first time a hungry fish rises (never picked by pendingScene).
    id: 'food_chain',
    where: 'fishing',
    when: () => false,
    lines: [
      { who: 'nam', text: 'Look, Lan! That fish smelled your catch. Cá lớn nuốt cá bé: big fish eat small fish.' },
      { who: 'lan', text: 'It swam right up to the boat! Even deep fish come up when they\'re hungry?' },
      { who: 'nam', text: 'Cast at the hungry one next. Small, then bigger, then biggest. Think before you cast.' },
    ],
  },
  {
    id: 'dog_arrive',
    where: 'village',
    when: (s) => s.stats.sold >= 1 && s.storySeen.includes('first_sale'),
    lines: [
      { who: 'lan', text: "Bà! A skinny black puppy is sniffing around our jars!" },
      { who: 'nam', text: 'A Phú Quốc dog. See the ridge of fur on his back? It grows the wrong way.' },
      { who: 'nam', text: 'Only a few breeds in the whole world have that ridge. Ours is one.' },
      { who: 'lan', text: "He's black as squid ink. I'll call you Mực!" },
      { who: 'muc', text: 'Gâu! (He is looking at your fish bucket.)' },
      { who: 'nam', text: 'Feed him. A Phú Quốc dog never forgets a friend.' },
    ],
  },
  {
    id: 'dog_trust',
    where: 'village',
    when: (s) => s.dog.fed >= 3,
    lines: [
      { who: 'muc', text: '(Mực rolls over and wags his whole body.)' },
      { who: 'lan', text: 'He follows me everywhere now. Even to the toilet!' },
      { who: 'nam', text: 'He has chosen you. A dog who chooses deserves a home. Build him one.' },
    ],
  },
  {
    id: 'dog_boat',
    where: 'village',
    when: (s) => s.dog.house,
    lines: [
      { who: 'lan', text: 'Mực, want to come fishing with me?' },
      { who: 'muc', text: 'GÂU GÂU! (He is already in the boat.)' },
      { who: 'nam', text: 'Phú Quốc dogs swim and hunt. Watch his nose: he smells rare fish.' },
    ],
  },
  {
    id: 'dog_done',
    where: 'village',
    when: (s) => s.dog.catches >= 3,
    lines: [
      { who: 'lan', text: 'Mực barked at a shadow and it was a rare one! Good boy!' },
      { who: 'toc', text: 'A dog that finds fish? …How much do you want for him?' },
      { who: 'lan', text: 'Not for sale, Mr. Tốc. Some things money can\'t buy.' },
    ],
  },
  {
    // Played the first time the island map opens (never picked by pendingScene).
    id: 'island_intro',
    where: 'village',
    when: () => false,
    lines: [
      { who: 'nam', text: 'Lan, one pair of hands can\'t save a whole village. Hire help!' },
      { who: 'lan', text: 'Staff can fish, rake salt, brew and sell… then what do I do?' },
      { who: 'nam', text: 'You solve the hard problems, and teach your staff what you learn.' },
      { who: 'toc', text: 'Staff? Cute. I have machines. Let\'s see whose island grows faster.' },
    ],
  },
  {
    id: 'tutorial_done',
    where: 'village',
    when: (s) => s.goalsDone.includes('gear1'),
    lines: [
      { who: 'toc', text: 'New gear, kid? Cute. My factory made ten thousand bottles while you fished.' },
      { who: 'lan', text: '…Ten thousand? Maybe I should hurry up…' },
      { who: 'nam', text: 'A river that rushes carries only sand. Finish the Phú Quốc story first.' },
      { who: 'lan', text: 'Okay, okay. Một, hai, ba, kéo! Let\'s fish.' },
    ],
  },
  {
    id: 'done_lagoon',
    where: 'village',
    chapter: { number: 'Chapter 1 complete', title: 'Fresh Hands of Phú Quốc' },
    when: (s) => relic(s, 'turtle'),
    lines: [
      { who: 'rua', text: '…' },
      { who: 'lan', text: 'A TURTLE climbed into my boat! He\'s… staring at me. Hello?' },
      { who: 'rua', text: '…  (slow blink)' },
      { who: 'nam', text: 'Rùa! He guarded these seas when I was your age. He has chosen you.' },
      { who: 'nam', text: 'I remember now: the recipe begins with care. Fresh fish, gentle line.' },
      { who: 'nam', text: 'The next part lives out on the Coral Reef. You\'ll need a real boat.' },
    ],
  },
  {
    id: 'arrive_reef',
    where: 'fishing',
    chapter: { number: 'Chapter 2', title: 'Into the Deep' },
    when: (s) => s.sea === 'reef',
    lines: [
      { who: 'lan', text: 'The water is so dark out here… what if something BIG bites?' },
      { who: 'rua', text: '…  (nudges the rod toward the deep water)' },
      { who: 'lan', text: 'You want me to cast deeper? Fine. But if it\'s a sea monster, you\'re first.' },
    ],
  },
  {
    id: 'done_reef',
    where: 'village',
    chapter: { number: 'Chapter 2 complete', title: 'Into the Deep' },
    when: (s) => relic(s, 'compass'),
    lines: [
      { who: 'lan', text: 'Bà, I found an old compass in the reef. It glows near rare fish!' },
      { who: 'nam', text: 'Your grandfather\'s! …Yes. Rare fish from deep water, that was part two.' },
      { who: 'toc', text: 'Treasure hunting? My sauce doesn\'t need treasure. Or fish, honestly.' },
      { who: 'nam', text: 'Next, the Mangrove Delta. Find Chú Tư. Bring a clothespin for your nose.' },
    ],
  },
  {
    id: 'arrive_delta',
    where: 'fishing',
    chapter: { number: 'Chapter 3', title: 'Muddy Roots' },
    when: (s) => s.sea === 'delta',
    lines: [
      { who: 'tu', text: 'Năm\'s granddaughter! Welcome to the mud. You like mắm tôm?' },
      { who: 'lan', text: 'The purple one that smells like… a whole ocean sneezed?' },
      { who: 'tu', text: 'Ha! The best things often smell the worst. Catch me prawns, I\'ll show you.' },
    ],
  },
  {
    id: 'done_delta',
    where: 'village',
    chapter: { number: 'Chapter 3 complete', title: 'Muddy Roots' },
    when: (s) => relic(s, 'dragonjar'),
    lines: [
      { who: 'nam', text: 'This jar glaze… the jar must breathe! Part three, I remember it now.' },
      { who: 'toc', text: 'Strange. My factory sauce tastes… flat this year. Customers noticed.' },
      { who: 'lan', text: 'Maybe it needs time, Mr. Tốc. Jars have to breathe.' },
      { who: 'toc', text: 'Time is money, kid. …Isn\'t it?' },
      { who: 'nam', text: 'Go to Hạ Long Bay. Ask Cô Hạnh about the carp who would not give up.' },
    ],
  },
  {
    id: 'arrive_bay',
    where: 'fishing',
    chapter: { number: 'Chapter 4', title: 'The Dragon Gate' },
    when: (s) => s.sea === 'bay',
    lines: [
      { who: 'hanh', text: 'Welcome to Hạ Long, "where the dragon came down". Look at all these islands.' },
      { who: 'hanh', text: 'Long ago, dragons came to guard this coast. The jewels they spat became these islands.' },
      { who: 'hanh', text: 'And do you know the other legend? A carp swam upriver to the Dragon Gate falls.' },
      { who: 'hanh', text: 'It leapt and fell a thousand times. On the last leap, it became a dragon.' },
      { who: 'lan', text: 'A thousand times? I get grumpy after three missed bites…' },
      { who: 'hanh', text: 'Then this bay will teach you. The Dragon Carp only bites for the patient.' },
    ],
  },
  {
    id: 'done_bay',
    where: 'village',
    chapter: { number: 'Chapter 4 complete', title: 'The Dragon Gate' },
    when: (s) => relic(s, 'kite'),
    lines: [
      { who: 'lan', text: 'Bà, I waited for the right moment, and the Dragon Carp leapt into my net!' },
      { who: 'nam', text: 'Wait for the right moment… yes, part four. Only one memory left.' },
      { who: 'toc', text: 'Kid. Can I… taste one of your jars? Just for research.' },
      { who: 'nam', text: 'The last ingredient lives where light never reaches. The Abyss.' },
    ],
  },
  {
    id: 'arrive_trench',
    where: 'fishing',
    chapter: { number: 'Chapter 5', title: 'The Longest Fish' },
    when: (s) => s.sea === 'trench',
    lines: [
      { who: 'lan', text: 'It\'s so dark. No shortcuts down here, huh, Rùa?' },
      { who: 'rua', text: '…  (settles in, as if ready to wait a hundred years)' },
      { who: 'lan', text: 'Okay. We wait. Together. Chậm mà chắc.' },
    ],
  },
  {
    id: 'finale',
    where: 'village',
    chapter: { number: 'Finale', title: 'Ever Since Then' },
    when: (s) => relic(s, 'pearlheart'),
    lines: [
      { who: 'nam', text: 'This taste… Lan. I remember everything now. Our secret ingredient…' },
      { who: 'lan', text: 'The Oarfish? The Dragon Carp? The golden anchovy?' },
      { who: 'nam', text: 'Time. It was always time. You learned it with your own hands.' },
      { who: 'toc', text: 'I\'d like to buy your sauce, Lan. Not the village. Just the sauce. Please.' },
      { who: 'lan', text: 'Deal. But you wait for it like everyone else, Mr. Tốc!' },
      { who: 'rua', text: '…  (the happiest slow blink in the history of the sea)' },
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

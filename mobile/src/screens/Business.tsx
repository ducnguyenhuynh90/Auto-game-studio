// The island business screens, all on the shared rules: Team (core/team.ts), How it's made
// (core/business.ts lineEstimate), Brand (core/brand.ts), the Road to the World's Best (core/career.ts),
// the Business report and Mực (core/dog.ts). Every locked button explains itself (core/help.ts).
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { analytics } from '@core/analytics';
import { BRAND_STAGES, brandProblem, upgradeBrand } from '@core/brand';
import { AWARD_ENTRIES, CAREER, STARTING_TITLE, awardCandidate, career, enterAwards, goalDone, type CareerGoal, type StageUp } from '@core/career';
import { costLines, incomeSources, lineEstimate, savingTips, type Fix } from '@core/business';
import { DOG_HOUSE_COST, buildDogHouse, dogHouseProblem, feedDog } from '@core/dog';
import { SPECIES_BY_ID } from '@core/data';
import { explainBrand } from '@core/help';
import { RAKE_SECONDS, ROLE, ROLE_STEP, hire, hireCost, isAuto, rakeSalt, saltCap, setAuto, staffUpgradeCost, trainProblem, trainStaff, type Role, type Step } from '@core/island';
import { JOBS, JOB_PITCH, hireProblem, hireSite, jobRate, nextTeamGrowth, teamCap, teamSize, trainingGain } from '@core/team';
import { C } from '../theme';
import { game, useGame } from '../store';
import { CloseButton, CoinChip, GameButton, InfoDot, Panel } from '../ui';
import type { Nav } from '../nav';

function Header({ title, nav }: { title: string; nav: Nav }) {
  return (
    <View style={styles.head}>
      <Text style={styles.h1} numberOfLines={1}>
        {title}
      </Text>
      <CoinChip />
      <CloseButton onPress={nav.back} />
    </View>
  );
}

/** Where a report line's "fix" button leads. */
export function runFix(nav: Nav, f: Fix): void {
  switch (f.kind) {
    case 'build':
      return nav.go({ name: 'island', tile: f.tile ?? undefined });
    case 'select':
      return nav.go({ name: 'island', tile: f.tile });
    case 'market':
    case 'jars':
      return nav.go({ name: 'market' });
    case 'brand':
      return nav.go({ name: 'brand' });
    case 'puzzles':
      return nav.go({ name: 'puzzles' });
    case 'fish':
      return nav.go({ name: 'fishing' });
    case 'road':
      return nav.go({ name: 'road' });
    case 'contracts':
    case 'boost':
      return nav.go({ name: 'business' });
  }
}

// ---------- Your Team ----------
export function TeamScreen({ nav, focus }: { nav: Nav; focus?: string }) {
  const s = useGame();
  const size = teamSize(s);
  const cap = teamCap(s);
  return (
    <View style={styles.wrap}>
      <Header title="Your Team" nav={nav} />
      <Panel style={{ gap: 4, marginBottom: 8 }}>
        <View style={styles.row}>
          <Text style={[styles.h2, { flex: 1 }]}>
            Team {size}/{cap}
          </Text>
          <InfoDot testID="team_info" help={() => ({ title: 'How your team grows', lines: ['Start: room for 2.', '+2 for every stage of the Road to the World’s Best.', '+1 for every brand stage.', `Next: ${nextTeamGrowth(s)}.`], actions: [{ label: 'Open the Road', action: 'road' }] })} />
        </View>
        <Text style={styles.small}>At first you do every step yourself. Each worker takes one step off your hands, even while the game is closed (up to 4 h).</Text>
      </Panel>
      <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
        {JOBS.map((role) => {
          const team = s.island.staff.filter((x) => x.role === role);
          const hp = hireProblem(s, role);
          const pupil = [...team].sort((a, b) => a.level - b.level)[0];
          const tp = pupil ? trainProblem(s, pupil) : null;
          const tc = pupil ? staffUpgradeCost(pupil) : null;
          const lvl = Math.max(1, ...team.map((x) => x.level));
          return (
            <Panel key={role} style={[{ gap: 4 }, focus === role ? { borderColor: C.accent } : null]}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.h2}>{ROLE[role].title}</Text>
                  <Text style={[styles.small, { color: team.length ? C.good : C.purple }]}>{team.length ? `×${team.length} · Lv ${team.map((x) => x.level).join(', ')}${isAuto(s, ROLE_STEP[role]) ? '' : ' · resting'}` : hp?.startsWith('Build a ') ? `needs a ${hp.slice(8, -6)}` : 'not hired yet'}</Text>
                </View>
                <GameButton
                  testID={`team_hire_${role}`}
                  label={hireCost(s, role) === 0 ? 'Hire free' : `Hire ${hireCost(s, role)}`}
                  size={12}
                  color={C.good}
                  disabled={!!hp}
                  whyNot={hp}
                  onPress={() => {
                    const tile = hireSite(s, role);
                    if (tile === null) return;
                    const st = hire(s, tile);
                    if (!st) return;
                    analytics.track('staff_hire', { role, staff: s.island.staff.length, from: 'team' });
                    game.toast(`${st.name} joined as ${ROLE[role].title}!`, C.good, jobRate(role, 1));
                    game.commit();
                  }}
                />
                {pupil && tc !== null ? (
                  <GameButton
                    testID={`team_train_${role}`}
                    label={`Train ${tc}`}
                    size={12}
                    color={C.purple}
                    disabled={!!tp}
                    whyNot={tp}
                    onPress={() => {
                      if (!trainStaff(s, pupil.uid)) return;
                      analytics.track('staff_train', { role, level: pupil.level, cost: tc });
                      game.toast(`${pupil.name} is now Lv ${pupil.level}!`, C.purple, jobRate(role, pupil.level));
                      game.commit();
                    }}
                  />
                ) : null}
              </View>
              <Text style={styles.p}>{JOB_PITCH[role]}</Text>
              <Text style={[styles.small, { color: C.blue }]}>
                Lv {lvl}: {jobRate(role, lvl)}
              </Text>
              <Text style={styles.small}>{trainingGain(role)}</Text>
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------- How fish sauce is made ----------
const STEPS: { step: Step; role: Role; title: string }[] = [
  { step: 'fish', role: 'fisher', title: '1 · Catch fish' },
  { step: 'salt', role: 'salter', title: '2 · Make salt' },
  { step: 'brew', role: 'brewer', title: '3 · Fill, age & open jars' },
  { step: 'sell', role: 'seller', title: '4 · Sell bottles' },
];

export function ProductionScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const est = lineEstimate(s);
  const [raking, setRaking] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (raking <= 0) return;
    timer.current = setTimeout(() => {
      if (rakeSalt(game.state)) {
        analytics.track('salt_rake', { salt: game.state.island.salt });
        game.commit();
      }
      setRaking((r) => Math.max(0, r - 1));
    }, RAKE_SECONDS * 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raking]);
  return (
    <View style={styles.wrap}>
      <Header title="How it’s made" nav={nav} />
      <Text style={styles.small}>Catch → Salt → Fill jars → Ferment → Bottle → Sell</Text>
      <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {STEPS.map(({ step, role, title }) => {
          const team = s.island.staff.filter((x) => x.role === role);
          const auto = team.length > 0 && isAuto(s, step);
          return (
            <Panel key={step} style={{ gap: 6 }}>
              <View style={styles.row}>
                <Text style={[styles.h2, { flex: 1 }]}>{title}</Text>
                {team.length ? (
                  <GameButton
                    testID={`auto_${step}`}
                    label={auto ? 'AUTO' : 'YOU'}
                    size={12}
                    color={auto ? C.good : '#bdb3a3'}
                    onPress={() => {
                      setAuto(s, step, !auto);
                      analytics.track('auto_toggle', { step, auto: !auto });
                      game.toast(!auto ? `Staff ${ROLE[role].verb} again` : 'You do this step by hand', !auto ? C.good : C.purple, !auto ? 'Their wages are paid again' : 'Their staff rest: no wages while off');
                      game.commit();
                    }}
                  />
                ) : (
                  <GameButton testID={`hire_${step}`} label="+ Hire" size={12} color={C.good} onPress={() => nav.go({ name: 'team', focus: role })} />
                )}
              </View>
              <Text style={[styles.small, { color: auto ? C.good : C.purple }]}>{auto ? `Staff: ${team.length} ${ROLE[role].title}${team.length > 1 ? 's' : ''} · Lv ${Math.max(...team.map((x) => x.level))}` : 'You do this'}</Text>
              {step === 'fish' ? <GameButton testID="prod_fish" label={`Go fishing · bucket ${s.bucket.length}`} size={13} color={C.sea} onPress={() => nav.go({ name: 'fishing' })} /> : null}
              {step === 'salt' && !auto ? (
                <GameButton
                  testID="rake_salt"
                  label={raking ? `Raking… ×${raking}` : s.island.salt >= saltCap(s) ? 'Salt full' : `Rake salt (${s.island.salt}/${saltCap(s)})`}
                  size={13}
                  color="#7d9cc0"
                  disabled={s.island.salt + raking >= saltCap(s)}
                  onPress={() => setRaking((r) => Math.min(5, r + 1))}
                />
              ) : null}
              {step === 'sell' && s.shelf.length ? <GameButton testID="prod_sell" label={`Sell now · ${s.shelf.length} bottles`} size={13} color={C.accent} onPress={() => nav.go({ name: 'market' })} /> : null}
            </Panel>
          );
        })}
        <Panel style={{ gap: 4 }}>
          <Text style={styles.h2}>Staff line ≈ {Math.round(est.coinsPerHour)} coins/h</Text>
          <Text style={styles.small}>
            ~{est.bottlesPerHour.toFixed(1)} bottles/h at ~{est.degrees.toFixed(1)}°N, sells ~{est.soldPerHour.toFixed(1)}/h{est.toursPerHour ? ` · ${est.toursPerHour.toFixed(1)} tours/h` : ''}
          </Text>
          {est.steps.map((st) => (
            <Text key={st.id} style={[styles.small, est.bottleneck === st.id && { color: C.bad, fontWeight: '900' }]}>
              {st.id}: {st.perHour.toFixed(1)}/h{est.bottleneck === st.id ? '  ← slowest step' : ''}
            </Text>
          ))}
          <Text style={styles.small}>Estimate, before wages.</Text>
        </Panel>
      </ScrollView>
    </View>
  );
}

// ---------- Brand ----------
export function BrandScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const next = BRAND_STAGES[s.brand.level + 1];
  const problem = brandProblem(s);
  return (
    <View style={styles.wrap}>
      <Header title="Your Brand" nav={nav} />
      <Panel style={{ gap: 4 }}>
        <Text style={styles.h2}>{BRAND_STAGES[s.brand.level].name}</Text>
        <Text style={[styles.p, { color: C.good }]}>Sauce sells for ×{BRAND_STAGES[s.brand.level].mult.toFixed(2)}</Text>
        <View style={styles.row}>
          <Text style={[styles.p, { flex: 1 }]}>
            Reputation {s.brand.rep}
            {next ? ` / ${next.rep}` : ''}
          </Text>
          {next ? <InfoDot testID="brand_info" help={() => explainBrand(s)} /> : null}
        </View>
      </Panel>
      <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {BRAND_STAGES.map((st, i) => {
          const done = i <= s.brand.level;
          const isNext = i === s.brand.level + 1;
          return (
            <Panel key={st.name} style={[{ gap: 2 }, done ? { backgroundColor: '#eaf6e4' } : null, isNext ? { borderColor: C.purple } : null]}>
              <View style={styles.row}>
                <Text style={[styles.h2, { flex: 1 }]}>
                  {done ? '✓ ' : ''}
                  {st.name}
                </Text>
                <Text style={styles.h2}>×{st.mult.toFixed(2)}</Text>
              </View>
              <Text style={styles.small}>{st.desc}</Text>
              {i > 0 ? <Text style={[styles.small, { color: isNext && problem ? C.bad : C.purple }]}>{isNext && problem ? problem.replace(' (sell more bottles)', '') : `Rep ${st.rep} · ${st.cost} coins`}</Text> : null}
              {isNext ? (
                problem ? (
                  <GameButton testID="brand_how" label="How? ⓘ" size={14} color={C.blue} onPress={() => game.showHelp(explainBrand(s))} />
                ) : (
                  <GameButton
                    testID="brand_up"
                    label="Upgrade"
                    size={14}
                    color={C.purple}
                    onPress={() => {
                      if (!upgradeBrand(s)) return;
                      analytics.track('brand_up', { level: s.brand.level, rep: s.brand.rep, cost: st.cost });
                      game.toast(`${BRAND_STAGES[s.brand.level].name}!`, C.purple, `Every bottle now sells ×${BRAND_STAGES[s.brand.level].mult.toFixed(2)}`);
                      game.commit();
                    }}
                  />
                )
              ) : null}
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------- Road to the World's Best ----------
export function goTo(nav: Nav, g: CareerGoal): void {
  analytics.track('career_go', { goal: g.id, where: g.where });
  const where: Record<CareerGoal['where'], () => void> = {
    island: () => nav.go({ name: 'island' }),
    brand: () => nav.go({ name: 'brand' }),
    fishing: () => nav.go({ name: 'fishing' }),
    brew: () => nav.go({ name: 'production' }),
    market: () => nav.go({ name: 'market' }),
    puzzles: () => nav.go({ name: 'puzzles' }),
    map: () => nav.go({ name: 'seas' }),
    awards: () => undefined,
  };
  where[g.where]();
}

export function RoadScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const c = career(s);
  return (
    <View style={styles.wrap}>
      <Header title="Road to the World’s Best" nav={nav} />
      <Text style={styles.small}>You are: {c.stage === 0 ? STARTING_TITLE : CAREER[c.stage - 1].title}</Text>
      <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {CAREER.map((st, i) => {
          const state = i < c.stage ? 'done' : i === c.stage ? 'now' : 'later';
          return (
            <Panel key={st.title} style={[{ gap: 4 }, state === 'now' ? { borderColor: C.purple } : null, state === 'later' ? { opacity: 0.65 } : null]}>
              <Text style={styles.small}>
                STAGE {i + 1} · {st.theme.toUpperCase()}
              </Text>
              <Text style={styles.h2}>
                {state === 'done' ? '✓ ' : i === CAREER.length - 1 ? '🏆 ' : ''}
                {st.title}
              </Text>
              {state === 'now' ? (
                <>
                  <Text style={styles.small}>“{st.pitch}”</Text>
                  {st.goals.map((g) => {
                    const done = goalDone(s, g);
                    const [cur, tot] = g.progress(s);
                    const best = g.where === 'awards' ? awardCandidate(s) : null;
                    return (
                      <View key={g.id} style={styles.row}>
                        <Text style={[styles.p, { flex: 1 }, done && { color: C.good }]}>
                          {done ? '✓ ' : '○ '}
                          {g.text}
                          {!done && tot > 1 ? `  ${cur}/${tot}` : ''}
                        </Text>
                        {!done && g.where === 'awards' ? (
                          <GameButton
                            testID={`road_go_${g.id}`}
                            label={best ? 'Enter' : 'Brew ›'}
                            size={12}
                            color={C.gold}
                            onPress={() => {
                              if (!best) return nav.go({ name: 'production' });
                              const d = enterAwards(s);
                              if (d === null) return;
                              analytics.track('award_entry', { degrees: d, entries: career(s).entries ?? 0 });
                              game.toast(`Entered: a ${d.toFixed(1)}°N bottle`, C.gold, `${career(s).entries}/${AWARD_ENTRIES} for the World Fish Sauce Awards`);
                              game.commit();
                            }}
                          />
                        ) : !done ? (
                          <GameButton testID={`road_go_${g.id}`} label="Go ›" size={12} color={C.purple} onPress={() => goTo(nav, g)} />
                        ) : null}
                      </View>
                    );
                  })}
                  <Text style={[styles.small, { color: C.ink }]}>
                    Reward: {st.reward.coins.toLocaleString()} coins{st.reward.freeHire ? ' + a free hire' : ''}
                    {st.unlocks.length ? ` · Unlocks ${st.unlocks.map((u) => u.building).join(', ')}` : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.small}>{state === 'done' ? `${st.local} · earned` : st.theme}</Text>
              )}
            </Panel>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The big moment when a Road stage is finished (App shows it over any screen). */
export function StageUpCard({ up, onClose, onBuild }: { up: StageUp; onClose: () => void; onBuild: () => void }) {
  const final = up.index === CAREER.length - 1;
  return (
    <View style={styles.stageBack}>
      <Panel style={styles.stageCard}>
        <Text style={[styles.small, { color: C.gold, fontSize: 14 }]}>{final ? 'THE WORLD AGREES' : `STAGE ${up.index + 1} COMPLETE`}</Text>
        <Text style={{ fontSize: 56 }}>{final ? '🏆' : '🏅'}</Text>
        <Text style={styles.small}>NEW TITLE</Text>
        <Text style={[styles.h1, { textAlign: 'center' }]}>{up.stage.title}</Text>
        <Text style={[styles.p, { color: '#b8860b' }]}>{up.stage.local}</Text>
        <Text style={styles.h2}>
          +{up.stage.reward.coins.toLocaleString()} coins{up.stage.reward.freeHire ? ' + a free hire' : ''}
        </Text>
        {up.stage.unlocks.map((u) => (
          <Text key={u.building} style={[styles.p, { textAlign: 'center' }]}>
            🔓 {u.building}: {u.why}
          </Text>
        ))}
        <View style={[styles.row, { marginTop: 8 }]}>
          {up.stage.unlocks.length ? <GameButton testID="stage_build" label="Build it ›" color={C.purple} style={{ flex: 1 }} onPress={onBuild} /> : null}
          <GameButton testID="stage_ok" label={final ? 'Wonderful!' : 'Let’s go!'} color={C.good} style={{ flex: 1 }} onPress={onClose} />
        </View>
      </Panel>
    </View>
  );
}

// ---------- Business report ----------
export function BusinessScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const l = s.island.ledger;
  return (
    <View style={styles.wrap}>
      <Header title="Business" nav={nav} />
      <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        <Panel>
          <Text style={styles.h2}>≈ {Math.round(l?.incomeRate ?? 0)} coins/h income</Text>
        </Panel>
        <Text style={styles.label}>EARN</Text>
        {incomeSources(s).map((src) => (
          <Panel key={src.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>
                {src.status === 'active' ? '🟢' : src.status === 'idle' ? '🟡' : '⚪'} {src.name} · {src.value}
              </Text>
              <Text style={styles.small}>{src.how}</Text>
            </View>
            {src.fix ? <GameButton testID={`fix_${src.id}`} label={src.fix.label} size={12} color={C.blue} onPress={() => runFix(nav, src.fix!.action)} /> : null}
          </Panel>
        ))}
        <Text style={styles.label}>COSTS (per hour)</Text>
        {costLines(s).map((c) => (
          <Panel key={c.name} style={styles.row}>
            <Text style={[styles.p, { flex: 1 }]}>
              {c.name}
              {c.note ? ` · ${c.note}` : ''}
            </Text>
            <Text style={[styles.h2, { color: C.bad }]}>−{Math.round(c.perHour)}</Text>
          </Panel>
        ))}
        <Text style={styles.label}>SPEND LESS</Text>
        {savingTips(s).map((t, i) => (
          <Panel key={i} style={styles.row}>
            <Text style={[styles.p, { flex: 1 }]}>{t.text}</Text>
            {t.fix ? <GameButton testID={`tip_${i}`} label={t.fix.label} size={12} color={C.blue} onPress={() => runFix(nav, t.fix!.action)} /> : null}
          </Panel>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------- Mực ----------
export function DogScreen({ nav }: { nav: Nav }) {
  const s = useGame();
  const problem = dogHouseProblem(s);
  return (
    <View style={styles.wrap}>
      <Header title="Mực" nav={nav} />
      <Panel style={{ gap: 8, alignItems: 'center' }}>
        <Text style={{ fontSize: 64 }}>🐕‍⬛</Text>
        <Text style={styles.p}>A Phú Quốc Ridgeback: the fur on his back grows the wrong way. Feed him, give him a home, and he rides your boat.</Text>
        <Text style={styles.h2}>Fed {Math.min(3, s.dog.fed)}/3 · {s.dog.house ? 'has a home' : 'no home yet'}</Text>
        <GameButton
          testID="dog_feed"
          label={s.bucket.length ? 'Give him a fish' : 'No fish in your bucket'}
          color={C.accent}
          disabled={!s.bucket.length}
          whyNot={null}
          onPress={() => {
            const sp = feedDog(s);
            if (!sp) return;
            analytics.track('dog_feed', { species: sp, fed: s.dog.fed });
            game.toast('Mực wags his tail!', '#6b4a2a', `He ate a ${SPECIES_BY_ID[sp].name}`);
            game.commit();
          }}
        />
        {!s.dog.house ? (
          <GameButton
            testID="dog_house"
            label={`Build a dog house  ${DOG_HOUSE_COST}`}
            color={C.good}
            disabled={!!problem}
            whyNot={problem}
            onPress={() => {
              if (!buildDogHouse(s)) return;
              analytics.track('dog_house', {});
              game.toast('Mực has a home!', C.good, 'Now he comes fishing with you');
              game.commit();
            }}
          />
        ) : null}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paper, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  h1: { fontSize: 24, fontWeight: '900', color: C.ink, flexShrink: 1 },
  h2: { fontSize: 15, fontWeight: '900', color: C.ink },
  p: { fontSize: 13, fontWeight: '700', color: C.ink },
  small: { fontSize: 11.5, fontWeight: '700', color: 'rgba(43,33,24,0.7)' },
  label: { fontSize: 11, fontWeight: '900', color: 'rgba(43,33,24,0.6)', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageBack: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,10,5,0.82)', justifyContent: 'center', padding: 20 },
  stageCard: { alignItems: 'center', gap: 6, padding: 20 },
});

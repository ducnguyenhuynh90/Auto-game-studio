// Mắm Village, the native app. It runs the web game's own code (../src): the rules, every scene and
// menu, the 3D world, accounts, friends. Nothing is re-written, so the app behaves exactly like the web
// game, but it draws natively, with no WebView:
//  - the 3D world: three.js on expo-gl (OpenGL ES), src/glhost.ts
//  - the 2D UI layer: Skia, through a CanvasRenderingContext2D stand-in, src/canvas2d.ts
//  - phone services (share sheet, clipboard, sign-in browser, haptics, back button): src/platform.ts hooks
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Modal, PixelRatio, Platform, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Picture, Skia, useTypeface, type SkPicture } from '@shopify/react-native-skia';
import { makeMutable } from 'react-native-reanimated';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { File, Paths } from 'expo-file-system';
import { setPlatform } from '@web/platform';
import { bootGame, type Booted } from '@web/boot';
import { H, W } from '@web/render/draw';
import { World } from '@web/render3d/world';
import { analytics } from '@core/analytics';
import { saveState } from '@core/save';
import { backAction } from '@web/native/back';
import { setVibrator } from '@web/render/audio';
import { FrameRecorder, SkiaCanvasElement, setFonts } from './src/canvas2d';
import { installGlHost, quietPixelStore, standInCanvas } from './src/glhost';
import { startAudio } from './src/audio';
import { ga } from './src/ga';
import { runAutotest, wantsAutotest } from './src/autotest';

/** Recent frame times (ms), for the autotest's frame-rate report. */
const frameMs: number[] = [];

/** The app's own link scheme (= its app id): sign-in and invite links come back through it. */
const SCHEME = (Array.isArray(Constants.expoConfig?.scheme) ? Constants.expoConfig?.scheme[0] : Constants.expoConfig?.scheme) ?? 'com.mamvillage.app';
const BG = '#0e3d4f';

// ---------- the text box the game asks with (captain name, friend code) ----------
interface Ask {
  title: string;
  placeholder?: string;
  initial?: string;
  maxLength?: number;
  autocapitalize?: string;
  ok?: string;
  resolve: (v: string | null) => void;
}
let showAsk: ((a: Ask | null) => void) | null = null;

/** A web vibration pattern ([on, off, on, …] ms) as taps of matching strength. */
function haptic(ms: number | number[]): void {
  const pattern = Array.isArray(ms) ? ms : [ms];
  let at = 0;
  pattern.forEach((d, i) => {
    if (i % 2 === 0) {
      const style = d < 15 ? Haptics.ImpactFeedbackStyle.Light : d < 45 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy;
      setTimeout(() => void Haptics.impactAsync(style).catch(() => undefined), at);
    }
    at += d;
  });
}

function installPlatform(): void {
  setPlatform({
    name: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    native: Platform.OS !== 'web',
    appScheme: SCHEME,
    makeCanvas: () => new SkiaCanvasElement() as unknown as HTMLCanvasElement,
    language: () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
      } catch {
        return 'en';
      }
    },
    async openAuthBrowser(url, returnUrl) {
      const r = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      return r.type === 'success' ? r.url : null;
    },
    async share({ title, text, url, file }) {
      if (file && (await Sharing.isAvailableAsync())) {
        const f = new File(Paths.cache, file.name);
        f.write(file.base64, { encoding: 'base64' });
        await Sharing.shareAsync(f.uri, { mimeType: 'image/jpeg', dialogTitle: title, UTI: 'public.jpeg' });
        return true;
      }
      const { Share } = await import('react-native');
      const r = await Share.share({ title, message: url && !text.includes(url) ? `${text}\n${url}` : text, url });
      return r.action !== Share.dismissedAction;
    },
    async copy(text) {
      await Clipboard.setStringAsync(text);
      return true;
    },
    ask: (o) => new Promise((resolve) => showAsk?.({ ...o, resolve })),
    openUrl: (url) => void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url)),
  });
  setVibrator(haptic);
}

/** ?invite=CODE from the link that opened the app (https://…/?invite=CODE or the app's own scheme). */
function paramsOf(url: string | null): URLSearchParams {
  if (!url) return new URLSearchParams();
  const q = url.indexOf('?');
  return new URLSearchParams(q >= 0 ? url.slice(q + 1).split('#')[0] : '');
}

/** The UI picture the Skia <Canvas> shows; replaced every frame from the game loop. */
const picture = makeMutable<SkPicture>(Skia.PictureRecorder().finishRecordingAsPicture());

function GameView() {
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [glReady, setGlReady] = useState(false);
  // the UI font, bundled so every phone shows the same letters (with Vietnamese accents)
  const f400 = useTypeface(require('./assets/fonts/Nunito_400Regular.ttf'));
  const f600 = useTypeface(require('./assets/fonts/Nunito_600SemiBold.ttf'));
  const f700 = useTypeface(require('./assets/fonts/Nunito_700Bold.ttf'));
  const f800 = useTypeface(require('./assets/fonts/Nunito_800ExtraBold.ttf'));
  const f900 = useTypeface(require('./assets/fonts/Nunito_900Black.ttf'));
  const fonts = f400 && f600 && f700 && f800 && f900;
  useEffect(() => {
    if (f400 && f600 && f700 && f800 && f900) setFonts([[400, f400], [600, f600], [700, f700], [800, f800], [900, f900]]);
  }, [f400, f600, f700, f800, f900]);
  const ready = glReady && !!fonts;
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askText, setAskText] = useState('');
  const booted = useRef<Booted | null>(null);
  const layout = useRef({ scale: 1, ox: 0, oy: 0, glW: 0, glH: 0, f: 1 });
  const [glFactor, setGlFactor] = useState(1);

  showAsk = (a) => {
    setAsk(a);
    setAskText(a?.initial ?? '');
  };

  // the offscreen 3D renderer and the platform hooks, before the game starts
  useEffect(() => {
    installPlatform();
    void installGlHost()
      .catch((e) => console.warn('3D pictures unavailable', e))
      .then(() => setGlReady(true));
  }, []);

  // fit the 390×844 game inside the safe area, centred
  const availW = box.w;
  const availH = box.h - insets.top - insets.bottom;
  const scale = availW > 0 && availH > 0 ? Math.min(availW / W, availH / H) : 1;
  const gw = W * scale;
  const gh = H * scale;
  const ox = (availW - gw) / 2;
  const oy = insets.top + (availH - gh) / 2;
  layout.current.scale = scale;
  layout.current.ox = ox;
  layout.current.oy = oy;

  const onContext = async (gl: ExpoWebGLRenderingContext) => {
    quietPixelStore(gl);
    const url = (await Linking.getInitialURL().catch(() => null)) ?? null;
    const params = paramsOf(url);
    const autotest = wantsAutotest(params);
    const relayout = () => {
      const world = booted.current?.game.world;
      if (!world) return;
      const dpr = PixelRatio.get();
      // the quality tier's resolution: the GL view is laid out smaller and scaled up to the game's size
      const f = Math.min(1, world.pixelRatioFor(dpr) / dpr);
      setGlFactor(f);
    };
    const b = bootGame({
      params,
      makeWorld: (q) => new World(standInCanvas(gl), q, gl as unknown as WebGL2RenderingContext),
      relayout,
      loadGa: async () => {
        if (!ga.configured) return null;
        ga.setState(() => b.game.state);
        return ga;
      },
    });
    booted.current = b;
    relayout();
    runLoop(gl, b);
    if (autotest) void runAutotest(autotest, frameMs, Number(params.get('speed') ?? 2));
  };

  const runLoop = (gl: ExpoWebGLRenderingContext, b: Booted) => {
    const rec = new FrameRecorder();
    let last = performance.now();
    let active = true;
    let bufW = 0;
    let bufH = 0;
    const frame = (now: number) => {
      if (!active) return;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      frameMs.push(dt * 1000);
      if (frameMs.length > 6000) frameMs.splice(0, 3000);
      const world = b.game.world;
      // keep three.js's viewport on the GL view's real drawing buffer
      if (world && (gl.drawingBufferWidth !== bufW || gl.drawingBufferHeight !== bufH)) {
        bufW = gl.drawingBufferWidth;
        bufH = gl.drawingBufferHeight;
        world.resize(W, H, 1);
        world.renderer.setPixelRatio(1);
        world.renderer.setSize(bufW, bufH, false);
      }
      b.tick(dt);
      // a brag card wants this frame: the 3D picture is still in its buffer
      const shots = b.game.snapshots.length ? b.game.snapshots.splice(0) : null;
      let world3d: SkiaCanvasElement | null = null;
      if (shots && bufW > 0) {
        const px = new Uint8Array(bufW * bufH * 4);
        gl.readPixels(0, 0, bufW, bufH, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const flipped = new Uint8Array(px.length);
        const row = bufW * 4;
        for (let y = 0; y < bufH; y++) flipped.set(px.subarray(y * row, y * row + row), (bufH - 1 - y) * row);
        world3d = SkiaCanvasElement.fromPixels(flipped, bufW, bufH);
      }
      gl.endFrameEXP();
      // the UI layer, recorded in game coordinates (390×844) and scaled to the screen
      const { scale: s } = layout.current;
      const ctx = rec.begin(W * s, H * s);
      ctx.scale(s, s);
      b.game.draw(ctx as unknown as CanvasRenderingContext2D);
      const pic = rec.end();
      picture.value = pic;
      if (shots) {
        const shot = new SkiaCanvasElement();
        const k = 2; // brag cards are drawn from a 780×1688 frame
        shot.width = W * k;
        shot.height = H * k;
        const sx = shot.getContext('2d')!;
        if (world3d) sx.drawImage(world3d, 0, 0, W * k, H * k);
        sx.scale(k / s, k / s);
        sx.canvas.drawPicture(pic);
        for (const done of shots) done(shot as unknown as HTMLCanvasElement);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    // background: save at once (phones close background apps without warning); back: staff caught up
    AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (!active) {
          active = true;
          last = performance.now();
          requestAnimationFrame(frame);
          analytics.track('app_visible', { scene: b.game.scene.name });
          b.welcomeBack();
        }
      } else if (active) {
        active = false;
        saveState(b.game.state);
        void b.game.account?.flush();
        analytics.track('app_hidden', { scene: b.game.scene.name });
      }
    });
  };

  // Android back: menus close, side scenes go home, the village leaves the app (it keeps running)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const g = booted.current?.game;
      if (!g) return false;
      const a = backAction(g.scene.name, g.overlays.map((o) => o.name));
      if (a === 'close_overlay') g.pop();
      else if (a === 'go_village') g.goVillage();
      else if (a === 'exit') return false;
      return true;
    });
    return () => sub.remove();
  }, []);

  // an invite link while the app is open
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const code = paramsOf(url).get('invite');
      if (code) void import('@web/scenes/friends').then((m) => m.captureInvite(`?invite=${encodeURIComponent(code)}`));
    });
    return () => sub.remove();
  }, []);

  // ---------- touch: one finger taps, holds and drags; two fingers pinch-zoom ----------
  const pinch = useRef(0);
  const toGame = (x: number, y: number): [number, number] => {
    const l = layout.current;
    return [(x - l.ox) / l.scale, (y - l.oy) / l.scale];
  };
  const spread = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };
  const onStart = (e: GestureResponderEvent) => {
    startAudio();
    const g = booted.current?.game;
    if (!g) return;
    if (e.nativeEvent.touches.length === 2) {
      pinch.current = spread(e);
      g.pointerCancel();
      return;
    }
    if (e.nativeEvent.touches.length > 2) return;
    g.pointerDown(...toGame(e.nativeEvent.locationX, e.nativeEvent.locationY));
  };
  const onMove = (e: GestureResponderEvent) => {
    const g = booted.current?.game;
    if (!g) return;
    if (e.nativeEvent.touches.length === 2) {
      const d = spread(e);
      if (pinch.current > 0 && d > 0) g.zoomBy(d / pinch.current);
      pinch.current = d;
      return;
    }
    if (pinch.current > 0) return;
    g.pointerMove(...toGame(e.nativeEvent.locationX, e.nativeEvent.locationY));
  };
  const onEnd = (e: GestureResponderEvent) => {
    const g = booted.current?.game;
    if (!g) return;
    if (pinch.current > 0) {
      if (e.nativeEvent.touches.length === 0) pinch.current = 0;
      return;
    }
    if (e.nativeEvent.touches.length > 0) return;
    g.pointerUp(...toGame(e.nativeEvent.locationX, e.nativeEvent.locationY));
  };

  const f = glFactor;
  return (
    <View style={styles.root} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <StatusBar hidden />
      {ready && box.w > 0 ? (
        <>
          {/* the 3D world: laid out at the quality tier's resolution, scaled up to the game's size */}
          <View pointerEvents="none" style={{ position: 'absolute', left: ox + (gw - gw * f) / 2, top: oy + (gh - gh * f) / 2, width: gw * f, height: gh * f, transform: [{ scale: 1 / f }] }}>
            <GLView style={StyleSheet.absoluteFill} onContextCreate={onContext} />
          </View>
          {/* the UI layer */}
          <Canvas pointerEvents="none" style={{ position: 'absolute', left: ox, top: oy, width: gw, height: gh }}>
            <Picture picture={picture} />
          </Canvas>
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onStart}
            onResponderMove={onMove}
            onResponderRelease={onEnd}
            onResponderTerminate={onEnd}
            onTouchStart={(e) => {
              // a second finger arrives as a touch start on the responder that already has the first
              if (e.nativeEvent.touches.length === 2) onStart(e);
            }}
          />
        </>
      ) : null}
      <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => (ask?.resolve(null), setAsk(null))}>
        <View style={styles.askWrap}>
          <View style={styles.askBox}>
            <Text style={styles.askTitle}>{ask?.title}</Text>
            <TextInput
              style={styles.askInput}
              value={askText}
              onChangeText={setAskText}
              placeholder={ask?.placeholder}
              maxLength={ask?.maxLength ?? 20}
              autoCapitalize={ask?.autocapitalize === 'characters' ? 'characters' : 'words'}
              autoCorrect={false}
              autoFocus
              onSubmitEditing={() => {
                const v = askText.trim();
                ask?.resolve(v ? v : null);
                setAsk(null);
              }}
            />
            <View style={styles.askRow}>
              <Pressable
                style={[styles.askBtn, { backgroundColor: '#e9dfcf' }]}
                onPress={() => {
                  ask?.resolve(null);
                  setAsk(null);
                }}
              >
                <Text style={[styles.askBtnText, { color: '#2b2118' }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.askBtn, { backgroundColor: '#3a8fd9' }]}
                onPress={() => {
                  const v = askText.trim();
                  ask?.resolve(v ? v : null);
                  setAsk(null);
                }}
              >
                <Text style={[styles.askBtnText, { color: '#fff' }]}>{ask?.ok ?? 'OK'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameView />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  askWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,15,10,0.55)' },
  askBox: { width: 320, maxWidth: '86%', backgroundColor: '#fff8ec', borderWidth: 3, borderColor: '#2b2118', borderRadius: 18, padding: 18 },
  askTitle: { fontWeight: '900', fontSize: 18, color: '#2b2118', marginBottom: 10, textAlign: 'center' },
  askInput: { fontSize: 22, fontWeight: '800', paddingVertical: 10, paddingHorizontal: 12, borderWidth: 2, borderColor: '#2b2118', borderRadius: 12, textAlign: 'center', color: '#2b2118', backgroundColor: '#fff' },
  askRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  askBtn: { flex: 1, paddingVertical: 11, borderWidth: 2, borderColor: '#2b2118', borderRadius: 12, alignItems: 'center' },
  askBtnText: { fontSize: 17, fontWeight: '900' },
});

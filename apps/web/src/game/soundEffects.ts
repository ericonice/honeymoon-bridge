import type { Call } from "@hb/engine";

/**
 * Sound effects for the game, arena-flavored to match the hockey theme.
 *
 * Synthesized rather than recorded, so there is nothing to bundle, license, or
 * fail to load when the service worker is serving an old build offline.
 */

let sharedContext: AudioContext | null = null;

/**
 * Created once and resumed on every call rather than only the first, since a
 * context created before any tap on the page starts suspended and stays that
 * way until a user gesture resumes it — and there is no single place in the
 * app that is guaranteed to be one.
 *
 * Resuming here is what Chrome needs and not what Safari needs. Chrome treats
 * any gesture anywhere on the page as unlocking audio for good, so calling
 * `resume` from inside a React effect — after the tap that caused it, not
 * during it — still works. WebKit only honors a `resume` called synchronously
 * inside the gesture's own event handler; called one tick later, from an
 * effect, it is silently refused every time, forever, which is exactly "plays
 * in Chrome, never on an iPhone." `primeOnFirstGesture` below is what actually
 * unlocks it there.
 */
function context(): AudioContext {
  sharedContext ??= new AudioContext();
  if (sharedContext.state === "suspended") {
    void sharedContext.resume();
  }
  return sharedContext;
}

/**
 * Creates and resumes the context synchronously inside the very first tap
 * anywhere in the app, so WebKit — which only honors a resume made during a
 * gesture's own handler — has one to honor. Chrome does not need this, but
 * running it there too costs nothing.
 *
 * Registered once at module load, not from a component: the first gesture in
 * a session is often on the home screen or in Settings, well before anything
 * that plays a sound has mounted.
 */
function primeOnFirstGesture(): void {
  if (typeof document === "undefined") {
    return;
  }
  const unlock = (): void => {
    context();
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("touchend", unlock, { once: true });
}

primeOnFirstGesture();

/** A short burst of filtered noise — the raw material for a scrape or a crowd swell. */
function noiseBurst(
  ctx: AudioContext,
  {
    delay = 0,
    duration,
    filterFrequency,
    filterType = "bandpass",
    gain,
    q = 1,
  }: {
    /** Seconds before it starts, so a burst can sit inside a longer figure. */
    readonly delay?: number;
    readonly duration: number;
    readonly filterFrequency: number;
    readonly filterType?: BiquadFilterType;
    readonly gain: number;
    readonly q?: number;
  },
): void {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFrequency;
  filter.Q.value = q;

  const now = ctx.currentTime + delay;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration);
}

/** A short tone with a quick attack and an exponential decay — a tap or a horn note. */
function tone(
  ctx: AudioContext,
  {
    decay,
    delay = 0,
    frequency,
    gain,
    glideTo,
    type = "sine",
  }: {
    readonly decay: number;
    readonly delay?: number;
    readonly frequency: number;
    readonly gain: number;
    readonly glideTo?: number;
    readonly type?: OscillatorType;
  },
): void {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(glideTo, now + decay);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + decay);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + decay);
}

/**
 * An arena fog horn: three sawtooth voices through a lowpass filter, with a
 * swell in rather than an instant attack.
 *
 * Two of the voices sit a few Hz apart rather than in tune, which is where the
 * wavering "wah" of a real horn comes from — reeds that do not quite agree —
 * and a third an octave down gives it the weight a single sawtooth cannot.
 */
function fogHorn(ctx: AudioContext, { delay = 0 }: { readonly delay?: number } = {}): void {
  const now = ctx.currentTime + delay;
  const attack = 0.12;
  const hold = 0.85;
  const release = 0.45;
  const end = now + attack + hold + release;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.Q.value = 0.8;
  filter.connect(ctx.destination);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.22, now + attack);
  env.gain.setValueAtTime(0.22, now + attack + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(filter);

  for (const voice of [
    { frequency: 108, gain: 1 },
    { frequency: 112, gain: 1 },
    { frequency: 55, gain: 0.6 },
  ]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = voice.frequency;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = voice.gain;
    osc.connect(voiceGain);
    voiceGain.connect(env);
    osc.start(now);
    osc.stop(end);
  }
}

/**
 * Runs a sound effect and swallows whatever it throws.
 *
 * A cue is decoration layered onto a state change that has already happened —
 * a card is already played, a rubber already won — so nothing about the game
 * is still waiting on it, and a phone whose `AudioContext` is in whatever
 * state a backgrounded tab or an incoming call left it in is not a reason to
 * take the whole screen down over a sound nobody would have gotten to hear
 * anyway.
 */
function play(effect: (ctx: AudioContext) => void): void {
  try {
    effect(context());
  } catch (error) {
    console.warn("Sound effect failed:", error);
  }
}

/** A draw turn resolving: a short scrape, for a card leaving the stock. */
export function playDrawResolve(): void {
  play((ctx) => {
    noiseBurst(ctx, { duration: 0.07, filterFrequency: 2400, gain: 0.05, q: 0.7 });
  });
}

/** A card landing on a trick — a muffled thud, low where the draw's scrape is bright. */
export function playCardPlayed(): void {
  play((ctx) => {
    noiseBurst(ctx, { duration: 0.05, filterFrequency: 900, filterType: "lowpass", gain: 0.07, q: 0.6 });
  });
}

/** A call landing in the auction — a stick tap, doubles and redoubles a slapshot. */
export function playCall(call: Call): void {
  play((ctx) => {
    switch (call.type) {
      case "bid": {
        tone(ctx, { decay: 0.08, frequency: 620, gain: 0.06, type: "triangle" });
        return;
      }
      case "pass": {
        tone(ctx, { decay: 0.07, frequency: 340, gain: 0.04, type: "triangle" });
        return;
      }
      case "double":
      case "redouble": {
        noiseBurst(ctx, { duration: 0.09, filterFrequency: 1800, gain: 0.09, q: 0.5 });
        tone(ctx, { decay: 0.18, frequency: 220, gain: 0.12, glideTo: 70, type: "sine" });
        return;
      }
    }
  });
}

/**
 * The contract's fate: a bright rising chime for making it, two falling
 * buzzer notes for going down.
 *
 * Made and failed used to differ only in pitch, both as short, buzzy tones a
 * fifth or so apart — easy to tell apart side by side, not so easy to tell
 * apart as a single blip weeks into a rubber. A single falling glide read as
 * one sour note rather than a verdict, so going down is two of them instead
 * of one — the second lower and quieter, an echo of the first rather than a
 * repeat of it.
 */
export function playContractResult(made: boolean): void {
  play((ctx) => {
    if (made) {
      tone(ctx, { decay: 0.16, frequency: 523, gain: 0.09, type: "triangle" });
      tone(ctx, { decay: 0.16, delay: 0.08, frequency: 659, gain: 0.09, type: "triangle" });
      tone(ctx, { decay: 0.32, delay: 0.16, frequency: 784, gain: 0.11, type: "triangle" });
      return;
    }
    tone(ctx, { decay: 0.22, frequency: 220, gain: 0.12, glideTo: 90, type: "square" });
    tone(ctx, { decay: 0.22, delay: 0.26, frequency: 196, gain: 0.09, glideTo: 80, type: "square" });
  });
}

/** The rubber won: the arena fog horn, under a crowd swell that follows it in. */
export function playRubberWon(): void {
  play((ctx) => {
    fogHorn(ctx);
    noiseBurst(ctx, { duration: 1.3, filterFrequency: 1200, gain: 0.05, q: 0.4 });
  });
}

/**
 * A title unlocked: four bells up a major triad, with a shimmer over the top.
 *
 * **The hard constraint is not sounding like a made contract.** That one is a
 * rising three-note triangle chime at 523/659/784, and an unlock lands seconds
 * after it on the deal that earned it — two rising chimes in a row would read as
 * one event stuttering. So this starts where that one *ends* and climbs an
 * octave above it, in sine rather than triangle, which is rounder and reads as a
 * bell where the other reads as a beep.
 *
 * The fourth note is the point: three notes is a cadence and resolves, four with
 * the last one held is an announcement. The noise burst is high-passed to a
 * sparkle rather than the broad swell under the fog horn — a title is a smaller
 * thing than a rubber and should not borrow the crowd.
 *
 * The whole figure is offset by a quarter second so it arrives *after* whatever
 * the deal itself had to say, rather than on top of it.
 */
export function playAchievement(): void {
  play((ctx) => {
    const start = 0.25;
    // G5, B5, D6, G6 — the triad, then the octave, which is the one that lands.
    const notes = [
      { decay: 0.22, delay: start, frequency: 784, gain: 0.07 },
      { decay: 0.22, delay: start + 0.09, frequency: 988, gain: 0.07 },
      { decay: 0.24, delay: start + 0.18, frequency: 1175, gain: 0.08 },
      { decay: 0.55, delay: start + 0.29, frequency: 1568, gain: 0.09 },
    ];
    for (const note of notes) {
      tone(ctx, { ...note, type: "sine" });
      // A quiet triangle doubling an octave down gives each bell a body a pure
      // sine has none of, without making it a different instrument.
      tone(ctx, { ...note, frequency: note.frequency / 2, gain: note.gain * 0.35, type: "triangle" });
    }
    noiseBurst(ctx, {
      delay: start,
      duration: 0.5,
      filterFrequency: 5200,
      filterType: "highpass",
      gain: 0.02,
      q: 0.6,
    });
  });
}

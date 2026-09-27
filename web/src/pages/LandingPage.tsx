import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Mic,
  Users,
  Monitor,
  Apple,
  Github,
  Volume2,
} from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';
import '../styles/landing.css';

/* ── Data ── */

const features = [
  { icon: MessageSquare, title: 'TEXT', line: 'Channels, threads, GIFs.', sfx: 'ザワ', color: 'var(--blue)', tilt: '-1.5deg' },
  { icon: Mic, title: 'VOICE', line: 'Low-latency voice rooms.', sfx: 'ドン!', color: 'var(--red)', tilt: '1deg' },
  { icon: Users, title: 'SERVERS', line: 'Roles, invites, your rules.', sfx: 'ゴゴゴ', color: 'var(--yellow)', tilt: '-0.5deg' },
];

const steps = [
  { title: 'BUILD A SERVER', bubble: 'Mine now.' },
  { title: 'SEND THE INVITE', bubble: 'Get in here!' },
  { title: 'START TALKING', bubble: "LET'S GOOO!!" },
];

const crew = [
  { initials: 'KO', name: 'kou', color: '#0ea5e9', speaking: true },
  { initials: 'MI', name: 'mika', color: '#ff2d3a', speaking: false },
  { initials: 'RY', name: 'ryo', color: '#ffd400', speaking: false },
  { initials: 'JK', name: 'jk', color: '#34d399', speaking: true },
];

const commands = [
  'git clone https://github.com/jkleincodes/echo.git',
  'cd echo',
  'docker compose up -d',
];

const tickerWords = ['TALK', 'トーク', 'VOICE', 'ボイス', 'SERVERS', 'エコー', 'OPEN SOURCE'];

/* ── Helpers ── */

function getOS(): 'mac' | 'windows' | 'other' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  return 'other';
}

/** Points for a spiky manga impact burst, as an SVG polygon string. */
function burstPoints(spikes: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer * (0.85 + ((i * 37) % 15) / 100) : inner;
    const a = (Math.PI * i) / spikes;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function Burst({ className = '', fill }: { className?: string; fill: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon points={burstPoints(18, 50, 34)} fill={fill} stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}

function Section({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, isVisible } = useScrollReveal();
  return (
    <section ref={ref} data-visible={isVisible} className={`sh-reveal relative w-full ${className}`}>
      {children}
    </section>
  );
}

function ChapterHeading({ chapter, title, kana }: { chapter: string; title: string; kana: string }) {
  return (
    <div className="sh-in mb-12 flex flex-wrap items-end gap-x-4 gap-y-2">
      <span className="sh-tag">{chapter}</span>
      <h2 className="sh-display text-4xl leading-none md:text-6xl">{title}</h2>
      <span className="sh-display text-xl text-[var(--red)] md:text-2xl">{kana}</span>
    </div>
  );
}

/* ── Page ── */

export default function LandingPage() {
  const os = getOS();

  return (
    <div className="sh flex flex-col items-center">
      {/* ─── Hero ─── */}
      <section className="relative w-full overflow-hidden border-b-4 border-[var(--ink)]">
        <div className="sh-speedlines opacity-[0.12]" />
        <div className="sh-halftone pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full opacity-20" />

        <div className="sh-impact relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-16 [animation-delay:560ms] md:grid-cols-[1.15fr_1fr] md:py-24">
          {/* Copy */}
          <div>
            <div className="sh-pop mb-6 flex items-center gap-3 [animation-delay:80ms]">
              <span className="sh-tag">VOL.01</span>
              <span className="sh-display text-lg">エコー</span>
            </div>

            <h1 className="sh-display mb-8 -skew-x-6 text-[clamp(4rem,13vw,9rem)] leading-[0.88]">
              <span className="sh-slam [animation-delay:150ms]">TALK.</span>
              <span
                className="sh-slam text-[var(--blue)] [animation-delay:330ms] [paint-order:stroke_fill] [-webkit-text-stroke:4px_var(--ink)]"
                style={{ textShadow: '6px 6px 0 var(--ink)' }}
              >
                NOW!!
              </span>
            </h1>

            <p className="sh-pop mb-10 max-w-md text-lg font-semibold md:text-xl [animation-delay:560ms]">
              Voice, text and servers for your crew.
            </p>

            <div className="sh-pop flex flex-col items-start gap-5 [animation-delay:680ms]">
              <Link to="/register" className="sh-btn sh-btn-primary sh-shake sh-display px-8 py-4 text-xl">
                GET STARTED ▶
              </Link>

              <div className="flex flex-wrap gap-3">
                <a
                  href="/downloads/Echo.dmg"
                  className={`sh-btn px-5 py-2.5 text-sm ${os === 'mac' ? 'sh-btn-primary' : 'sh-btn-ghost'}`}
                >
                  <Apple size={16} />
                  macOS
                </a>
                <a
                  href="/downloads/Echo.exe"
                  className={`sh-btn px-5 py-2.5 text-sm ${os === 'windows' ? 'sh-btn-primary' : 'sh-btn-ghost'}`}
                >
                  <Monitor size={16} />
                  Windows
                </a>
              </div>
            </div>
          </div>

          {/* Voice channel panel */}
          <div className="sh-pop relative isolate [animation-delay:420ms]">
            <Burst fill="var(--yellow)" className="sh-burst pointer-events-none absolute -bottom-20 -left-20 -z-10 h-72 w-72" />
            <span className="sh-display pointer-events-none absolute -bottom-8 -left-6 z-10 -rotate-12 text-5xl text-[var(--red)] [paint-order:stroke_fill] [-webkit-text-stroke:3px_var(--ink)] md:text-6xl">
              ドドド
            </span>

            <div className="sh-panel sh-tilt overflow-hidden [--tilt:2deg]">
              <div className="flex items-center justify-between border-b-4 border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[var(--paper)]">
                <span className="flex items-center gap-2 text-sm font-bold tracking-widest">
                  <Volume2 size={16} /> LOUNGE
                </span>
                <span className="bg-[var(--red)] px-2 py-0.5 text-xs font-bold tracking-widest text-white">LIVE</span>
              </div>

              <div className="relative p-6 md:p-8">
                <div className="sh-halftone pointer-events-none absolute inset-0 opacity-[0.08]" />

                <div className="sh-bubble sh-pop sh-display relative mb-8 ml-auto w-fit px-5 py-3 text-lg [animation-delay:1000ms]">
                  LET'S GOOO!!
                </div>

                <div className="relative grid grid-cols-2 gap-6">
                  {crew.map((m) => (
                    <div key={m.name} className="flex flex-col items-center gap-2">
                      <div className="relative">
                        {m.speaking && (
                          <>
                            <span className="sh-ring" />
                            <span className="sh-ring [animation-delay:700ms]" />
                          </>
                        )}
                        <div
                          className="sh-display relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--ink)] text-2xl"
                          style={{ background: m.color }}
                        >
                          {m.initials}
                        </div>
                      </div>
                      <span className="text-sm font-bold">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Ticker ─── */}
      <div className="relative z-10 -my-3 w-[110%] -rotate-2 overflow-hidden border-y-4 border-[var(--ink)] bg-[var(--yellow)] py-3">
        <div className="sh-ticker">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
              {[...tickerWords, ...tickerWords].map((w, i) => (
                <span key={i} className="sh-display flex items-center px-5 text-2xl">
                  {w}
                  <span className="ml-10 text-[var(--red)]">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Features ─── */}
      <Section className="max-w-6xl px-6 pb-20 pt-28">
        <ChapterHeading chapter="CH.01" title="POWERS" kana="ちから" />
        <div className="grid gap-10 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="sh-in sh-tilt"
              style={{ '--i': i + 1, '--tilt': f.tilt } as React.CSSProperties}
            >
              <div className="sh-panel sh-feature h-full p-7">
                <span className="sh-sfx">{f.sfx}</span>
                <div
                  className="mb-6 flex h-16 w-16 items-center justify-center border-4 border-[var(--ink)]"
                  style={{ background: f.color }}
                >
                  <f.icon size={30} strokeWidth={2.5} />
                </div>
                <h3 className="sh-display mb-2 text-3xl">{f.title}</h3>
                <p className="font-semibold">{f.line}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── How it works ─── */}
      <Section className="max-w-6xl px-6 py-20">
        <ChapterHeading chapter="CH.02" title="3 MOVES" kana="さん" />
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="sh-in sh-panel flex min-h-60 flex-col justify-between overflow-hidden p-6"
              style={{ '--i': i + 1 } as React.CSSProperties}
            >
              <div className="sh-halftone pointer-events-none absolute inset-0 opacity-[0.07]" />
              <div className="sh-bubble sh-display relative w-fit px-4 py-2 text-base">{s.bubble}</div>
              <div className="relative flex items-end justify-between gap-4 pt-10">
                <h3 className="sh-display text-2xl leading-tight">{s.title}</h3>
                <span className="sh-display text-7xl leading-none text-[var(--blue)] [paint-order:stroke_fill] [-webkit-text-stroke:3px_var(--ink)]">
                  {i + 1}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── Open source ─── */}
      <Section className="max-w-6xl px-6 py-20">
        <ChapterHeading chapter="CH.03" title="OPEN SOURCE" kana="オープン" />
        <div className="grid items-center gap-10 md:grid-cols-[1.3fr_1fr]">
          <div className="sh-in sh-panel overflow-hidden bg-[var(--ink)]" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="flex items-center gap-2 border-b-4 border-[var(--ink)] bg-white px-4 py-2">
              <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)] bg-[var(--red)]" />
              <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)] bg-[var(--yellow)]" />
              <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)] bg-[#34d399]" />
            </div>
            <div className="overflow-x-auto bg-[var(--ink)] p-5 font-mono text-sm leading-8 text-[var(--paper)]">
              {commands.map((c, i) => (
                <span
                  key={c}
                  className="sh-type"
                  style={{ '--i': i, '--n': c.length + 2 } as React.CSSProperties}
                >
                  <span className="text-[var(--yellow)]">$</span> {c}
                </span>
              ))}
            </div>
          </div>

          <div className="sh-in flex flex-col items-start gap-6" style={{ '--i': 2 } as React.CSSProperties}>
            <p className="sh-display text-3xl leading-tight md:text-4xl">
              Your server.
              <br />
              <span className="text-[var(--red)]">Your data.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="sh-tag">SELF-HOST</span>
              <span className="sh-tag">AGPL v3</span>
            </div>
            <a
              href="https://github.com/jkleincodes/echo"
              target="_blank"
              rel="noopener noreferrer"
              className="sh-btn sh-btn-ghost px-6 py-3"
            >
              <Github size={18} />
              GitHub
            </a>
          </div>
        </div>
      </Section>

      {/* ─── Final CTA ─── */}
      <Section className="px-6 pb-24 pt-10">
        <div style={{ background: 'var(--blue)' }}
          className="sh-in sh-panel relative mx-auto max-w-6xl overflow-hidden px-6 py-20 text-center md:py-28">
          <div className="sh-speedlines opacity-25" />
          <div className="relative flex flex-col items-center gap-10">
            <h2
              className="sh-display -skew-x-6 text-[clamp(3.5rem,11vw,8rem)] leading-none text-white [paint-order:stroke_fill] [-webkit-text-stroke:5px_var(--ink)]"
              style={{ textShadow: '7px 7px 0 var(--ink)' }}
            >
              READY?!
            </h2>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/register" className="sh-btn sh-btn-ghost sh-shake sh-display px-8 py-4 text-xl">
                GET STARTED ▶
              </Link>
              <Link to="/downloads" className="sh-btn sh-display bg-[var(--yellow)] px-8 py-4 text-xl">
                DOWNLOAD
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Mic,
  Users,
  Monitor,
  Apple,
  ArrowRight,
  Plus,
  UserPlus,
  Headphones,
  Github,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useScrollReveal } from '../hooks/useScrollReveal';

/* ── Data ── */

const features = [
  {
    icon: MessageSquare,
    title: 'Text Channels',
    description:
      'Organize conversations with channels, threads, and rich text formatting.',
    accent: 'text-accent',
    accentBg: 'bg-accent/10',
    glowColor: 'rgba(14,165,233,0.35)',
  },
  {
    icon: Mic,
    title: 'Voice Chat',
    description:
      'Crystal-clear voice channels to hang out and talk with friends in real time.',
    accent: 'text-green',
    accentBg: 'bg-green/10',
    glowColor: 'rgba(52,211,153,0.35)',
  },
  {
    icon: Users,
    title: 'Communities',
    description:
      'Build and manage your own servers with roles, permissions, and invites.',
    accent: 'text-fuchsia',
    accentBg: 'bg-fuchsia/10',
    glowColor: 'rgba(244,114,182,0.35)',
  },
];

const steps = [
  { icon: Plus, label: 'Create a Server', number: 1 },
  { icon: UserPlus, label: 'Invite Friends', number: 2 },
  { icon: Headphones, label: 'Start Talking', number: 3 },
];

/* ── Helpers ── */

function getOS(): 'mac' | 'windows' | 'other' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  return 'other';
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
    <section
      ref={ref}
      className={`w-full transition-opacity ${
        isVisible ? 'animate-fade-in-up' : 'opacity-0'
      } ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Page ── */

export default function LandingPage() {
  const os = getOS();

  return (
    <div className="flex flex-col items-center overflow-x-hidden">
      {/* ─── Section 1 — Hero ─── */}
      <section className="relative flex w-full flex-col items-center justify-center px-6 py-24 md:py-36">
        {/* Animated gradient background */}
        <div
          className="animate-gradient pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(135deg, #1e1f22 0%, #1a2744 25%, #1e1f22 50%, #1a2744 75%, #1e1f22 100%)',
          }}
        />

        {/* Floating blobs */}
        <div
          className="pointer-events-none absolute left-[10%] top-[15%] h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{
            background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)',
            animation: 'float 6s ease-in-out infinite, pulse-glow 4s ease-in-out infinite',
          }}
        />
        <div
          className="pointer-events-none absolute right-[10%] top-[30%] h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{
            background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)',
            animation: 'float-delayed 7s ease-in-out infinite, pulse-glow 5s ease-in-out infinite',
          }}
        />
        <div
          className="pointer-events-none absolute bottom-[10%] left-[40%] h-64 w-64 rounded-full opacity-20 blur-3xl"
          style={{
            background: 'radial-gradient(circle, #34d399 0%, transparent 70%)',
            animation: 'float 8s ease-in-out infinite, pulse-glow 6s ease-in-out infinite',
          }}
        />

        {/* Content */}
        <h1 className="mb-6 text-center text-5xl font-extrabold tracking-tight md:text-7xl">
          <span className="bg-gradient-to-r from-accent via-fuchsia to-green bg-clip-text text-transparent">
            Your place to talk
          </span>
        </h1>
        <p className="mb-10 max-w-xl text-center text-lg text-ec-text-secondary md:text-xl">
          Echo makes it easy to chat with friends, communities, and teams.
          Create a server, invite people, and start talking&mdash;text or voice.
        </p>

        <div className="flex flex-col items-center gap-5">
          <Link
            to="/register"
            className="group flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-dark hover:shadow-accent/40"
          >
            Get Started
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>

          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/downloads/Echo.dmg"
              className={`glass flex items-center gap-2 rounded-full px-6 py-3 font-medium transition-all hover:-translate-y-0.5 ${
                os === 'mac' ? 'text-ec-text-primary' : 'text-ec-text-secondary'
              }`}
            >
              <Apple size={18} />
              Download for macOS
            </a>
            <a
              href="/downloads/Echo.exe"
              className={`glass flex items-center gap-2 rounded-full px-6 py-3 font-medium transition-all hover:-translate-y-0.5 ${
                os === 'windows' ? 'text-ec-text-primary' : 'text-ec-text-secondary'
              }`}
            >
              <Monitor size={18} />
              Download for Windows
            </a>
          </div>
        </div>
      </section>

      {/* ─── Section 2 — Features ─── */}
      <Section className="max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-ec-text-primary md:text-4xl">
          Everything you need
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="glass group cursor-default rounded-xl p-6 text-center transition-all duration-300 hover:-translate-y-2"
              style={
                {
                  '--glow': f.glowColor,
                } as React.CSSProperties
              }
              onMouseEnter={(e) => {
                (e.currentTarget.style.boxShadow = `0 8px 32px ${f.glowColor}`);
              }}
              onMouseLeave={(e) => {
                (e.currentTarget.style.boxShadow = 'none');
              }}
            >
              <div className="mb-4 flex justify-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-xl ${f.accentBg} transition-transform group-hover:scale-110`}
                >
                  <f.icon size={28} className={f.accent} />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-ec-text-primary">
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-ec-text-secondary">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── Section 3 — How It Works ─── */}
      <Section className="max-w-4xl px-6 py-20">
        <h2 className="mb-16 text-center text-3xl font-bold text-ec-text-primary md:text-4xl">
          Up and running in minutes
        </h2>

        <div className="relative flex flex-col items-center gap-12 md:flex-row md:justify-between md:gap-0">
          {/* Dashed connector line — desktop only */}
          <svg
            className="pointer-events-none absolute top-10 right-[17%] left-[17%] hidden md:block"
            height="4"
            preserveAspectRatio="none"
          >
            <line
              x1="0"
              y1="2"
              x2="100%"
              y2="2"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2"
              strokeDasharray="8 6"
              style={{ animation: 'dash-flow 1s linear infinite' }}
            />
          </svg>

          {steps.map((s) => (
            <div
              key={s.number}
              className="relative z-10 flex flex-col items-center gap-3"
            >
              {/* Circle + ring */}
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ec-bg-tertiary ring-4 ring-ec-bg-secondary">
                  <s.icon size={32} className="text-accent" />
                </div>
                {/* Numbered badge */}
                <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                  {s.number}
                </span>
              </div>
              <span className="text-sm font-medium text-ec-text-secondary">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── Section 4 — Open Source ─── */}
      <Section className="max-w-5xl px-6 py-20">
        <div className="glass relative overflow-hidden rounded-2xl p-8 md:p-12">
          {/* Glow behind terminal */}
          <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative grid gap-10 md:grid-cols-2 md:items-center">
            {/* Terminal */}
            <div className="overflow-hidden rounded-lg bg-ec-bg-floating">
              {/* Title bar */}
              <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red" />
                <span className="h-3 w-3 rounded-full bg-yellow" />
                <span className="h-3 w-3 rounded-full bg-green" />
                <span className="ml-3 text-xs text-ec-text-muted">Terminal</span>
              </div>
              {/* Commands */}
              <div className="p-5 font-mono text-sm leading-7 text-ec-text-secondary">
                <p>
                  <span className="text-green">$</span>{' '}
                  git clone &lt;repo-url&gt;
                </p>
                <p>
                  <span className="text-green">$</span>{' '}
                  cd talktogether
                </p>
                <p>
                  <span className="text-green">$</span>{' '}
                  docker compose up -d
                </p>
                <p className="mt-1 inline-flex items-center text-ec-text-muted">
                  <span className="animate-pulse">▋</span>
                </p>
              </div>
            </div>

            {/* Copy */}
            <div>
              <h2 className="mb-4 text-3xl font-bold text-ec-text-primary md:text-4xl">
                Built in the open
              </h2>
              <p className="mb-6 leading-relaxed text-ec-text-secondary">
                Echo is fully open source. Self-host it on your own hardware,
                contribute features, or learn from the codebase. No vendor
                lock-in, no hidden servers — just your code, your data.
              </p>

              {/* Stats */}
              <div className="mb-6 flex gap-6">
                <div className="flex items-center gap-2 text-sm text-ec-text-secondary">
                  <Server size={16} className="text-accent" />
                  Self-hostable
                </div>
                <div className="flex items-center gap-2 text-sm text-ec-text-secondary">
                  <ShieldCheck size={16} className="text-green" />
                  MIT Licensed
                </div>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full bg-ec-bg-tertiary px-6 py-3 font-medium text-ec-text-muted">
                <Github size={18} />
                GitHub — coming soon
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── Section 5 — Bottom CTA ─── */}
      <Section className="w-full max-w-5xl px-6 pt-10 pb-20">
        <div className="flex flex-col items-center gap-6 rounded-2xl px-8 py-16 text-center md:px-16"
          style={{
            background:
              'linear-gradient(135deg, #0284c7 0%, #0ea5e9 40%, #f472b6 100%)',
          }}
        >
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Ready to get started?
          </h2>
          <p className="max-w-md text-white/80">
            Create your first server in seconds. No credit card, no catch.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/register"
              className="rounded-full bg-white px-8 py-3.5 font-semibold text-accent shadow-lg transition-all hover:scale-105 hover:shadow-xl"
            >
              Get Started
            </Link>
            <Link
              to="/downloads"
              className="rounded-full border border-white/30 px-8 py-3.5 font-semibold text-white transition-all hover:bg-white/10"
            >
              Download App
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}

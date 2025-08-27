"use client";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Layers,
  PieChart,
  MessageSquare,
  Paintbrush,
  Paperclip,
  SunDim,
  Moon,
} from "lucide-react";

function ThemeToggleInline() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggle = () => {
    const isDark = (resolvedTheme ?? "dark") === "dark";
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      title="Toggle theme"
      className="toggle-btn cursor-pointer inline-flex items-center gap-2"
    >
      {mounted && resolvedTheme === "light" ? (
        <>
          <Moon className="h-4 w-4" />
          <span>Dark</span>
        </>
      ) : (
        <>
          <SunDim className="h-4 w-4" />
          <span>Light</span>
        </>
      )}
    </button>
  );
}

export default function Home() {
  const { signIn } = useAuthActions();

  return (
    <div className="h-full account-gradient">
      <div className="mx-auto max-w-6xl h-full flex flex-col">
        <header className="account-header sticky top-0 z-10">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="floating-header">
              <div className="flex items-center gap-2 pr-3">
                <Image src="/image.png" alt="Mind Mesh" width={24} height={24} className="rounded" />
                <span className="font-semibold">Mind Mesh</span>
              </div>
              <nav className="hidden sm:flex items-center gap-2 ml-2">
                <a href="#features" className="route-tab">Features</a>
                <a href="#how" className="route-tab">How it works</a>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggleInline />
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => signIn("google")}
              >
                Sign in
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 sm:px-6 pb-10 pt-6 custom-scrollbar">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Hero */}
            <section className="section-card p-6">
              <div className="grid md:grid-cols-2 gap-6 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 mb-3">
                    <span className="badge-primary">Many Models, One Mind</span>
                    <span className="pill">Fast setup</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                    Orchestrate OpenAI, Anthropic, Gemini, and xAI in one seamless chat
                  </h1>
                  <p className="mt-3 text-muted-foreground">
                    Mind Mesh gives you a beautiful multimodel chat experience with responsive UI, rich
                    attachments, and smart usage controls—optimized for any screen size.
                  </p>
                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <button
                      className="btn-new-chat cursor-pointer"
                      onClick={() => signIn("google")}
                      aria-label="Continue with Google"
                    >
                      <Sparkles className="h-4 w-4" />
                      Continue with Google
                    </button>
                    <Link href="#features" className="w-full sm:w-auto">
                      <Button variant="outline" size="lg" className="w-full">
                        Learn more
                      </Button>
                    </Link>
                  </div>

                  {/* Logos */}
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Works great with</p>
                    <div className="flex items-center gap-4 flex-wrap opacity-90">
                      <Image src="/OpenAI-black-monoblossom.svg" alt="OpenAI" width={26} height={26} />
                      <Image src="/Anthropic_Symbol_0.svg" alt="Anthropic" width={24} height={24} />
                      <Image src="/32px-Google-gemini-icon.svg.png" alt="Gemini" width={26} height={26} />
                      <Image src="/xai.svg" alt="xAI" width={36} height={20} />
                      <Image src="/convex.svg" alt="Convex" width={64} height={16} />
                    </div>
                  </div>
                </div>

                <div className="hidden md:block">
                  <div className="upgrade-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="upgrade-pill">Live preview</span>
                      </div>
                      <div className="stat-pill">
                        <div className="stat-pill-label">Latency</div>
                        <div className="stat-pill-value">Low</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="model-card">
                        <div className="flex items-center gap-2">
                          <Image src="/OpenAI-black-monoblossom.svg" alt="OpenAI" width={18} height={18} />
                          <div className="font-medium">OpenAI</div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">o4-mini, GPT-4o</div>
                      </div>
                      <div className="model-card model-card-selected">
                        <div className="flex items-center gap-2">
                          <Image src="/Anthropic_Symbol_0.svg" alt="Anthropic" width={18} height={18} />
                          <div className="font-medium">Anthropic</div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">Claude 3.7</div>
                      </div>
                      <div className="model-card">
                        <div className="flex items-center gap-2">
                          <Image src="/32px-Google-gemini-icon.svg.png" alt="Gemini" width={18} height={18} />
                          <div className="font-medium">Gemini</div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">2.0 Flash, Pro</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="upgrade-progress-track">
                        <div className="upgrade-progress-fill" style={{ width: "58%" }} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">Daily usage preview</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Features */}
            <section id="features" className="section-card p-6">
              <h2 className="section-card-title mb-1">Everything you need for multimodel chat</h2>
              <p className="text-muted-foreground mb-4">
                Beautiful UI, thoughtful UX, and real-time performance—designed to work everywhere.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Feature icon={<Layers className="h-4 w-4" />} title="Model orchestration" desc="Blend OpenAI, Anthropic, Gemini, and xAI into one flow." />
                <Feature icon={<Paintbrush className="h-4 w-4" />} title="Polished UI" desc="Crisp cards, rich gradients, and theme-aware visuals." />
                <Feature icon={<MessageSquare className="h-4 w-4" />} title="Real-time chat" desc="Responsive input, streaming responses, and attachments." />
                <Feature icon={<Paperclip className="h-4 w-4" />} title="File aware" desc="Drop in files; styled previews and consistent UX." />
                <Feature icon={<PieChart className="h-4 w-4" />} title="Usage controls" desc="Inline usage, plan hints, and overage safe-guards." />
                <Feature icon={<Sparkles className="h-4 w-4" />} title="Fast onboarding" desc="Google sign-in; jump straight into your first chat." />
              </div>
            </section>

            {/* How it works */}
            <section id="how" className="section-card p-6">
              <h2 className="section-card-title mb-1">How it works</h2>
              <p className="text-muted-foreground mb-4">Three steps to get started.</p>
              <ol className="grid sm:grid-cols-3 gap-3">
                <Step index={1} title="Sign in" desc="Use Google to create your account in seconds." />
                <Step index={2} title="Pick models" desc="Choose your primary and secondary models in the picker." />
                <Step index={3} title="Start chatting" desc="Send a message and watch responses stream in." />
              </ol>
              <div className="mt-4">
                <button
                  className="btn-pricing btn-pricing-primary"
                  onClick={() => signIn("google")}
                >
                  Get started free
                </button>
              </div>
            </section>
          </div>
        </main>

        <footer className="px-4 sm:px-6 pb-6 pt-2 text-center text-sm text-muted-foreground">
          <div className="max-w-5xl mx-auto">
            <span>© {new Date().getFullYear()} Mind Mesh</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="table-tile">
      <div className="table-tile-title inline-flex items-center gap-2">
        <span className="badge-file">{icon} <span>{title}</span></span>
      </div>
      <div className="table-tile-body text-sm text-muted-foreground">{desc}</div>
    </div>
  );
}

function Step({ index, title, desc }: { index: number; title: string; desc: string }) {
  return (
    <li className="model-summary-card">
      <div className="msc-header">
        <div className="msc-model">
          <div className="badge-primary">{index}</div>
          <div className="msc-model-name">{title}</div>
        </div>
      </div>
      <div className="msc-section">
        <div className="summary-value">{desc}</div>
      </div>
    </li>
  );
}


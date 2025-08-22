
import SignInButton from "@/components/SignInButton";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold">Mind Mesh</h1>
        <p className="text-lg opacity-80">Many Models, One Mind.</p>
        <div className="space-y-4">
          <SignInButton />
        </div>
      </div>
    </main>
  );
}


// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-24 text-slate-100">
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">NovaSpace · Gemeinsam weiterdenken</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">NovaSpace Connector</h1>
        <p className="mt-5 max-w-2xl leading-7 text-slate-300">
          Lass deine KI mit Dateien, Deckkarten, Kalendern und weiteren freigegebenen
          Bereichen in NovaSpace arbeiten. Du bestimmst, welche Zugriffe du erlaubst.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/anleitung" className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-slate-950 hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300">
            Kurzanleitung und Beispiele
          </Link>
        </div>
        <p className="mt-6 text-sm leading-6 text-slate-400">
          Bereits verbunden? Nutze deinen bisherigen Zugang weiter. Deine Freigaben
          verwaltest du in NovaSpace unter „KI-Verbindungen“.
        </p>
      </section>
    </main>
  );
}

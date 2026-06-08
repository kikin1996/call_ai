"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Phone, Loader2, CheckCircle, XCircle, AlertCircle,
  ChevronDown, ChevronUp, PhoneCall, Clock, Plus, Trash2, Play, Square, Wand2,
} from "lucide-react";

interface CallRecord {
  id: string;
  phone: string;
  ownerName: string;
  listing: string;
  listingUrl: string;
  notes: string;
  shouldCall: boolean;
  expanded: boolean;
}

type CallOutcome = "uspesny" | "neutralni" | "odmitnuti" | "zaveseni";

interface CallLog {
  recordId: string;
  phone: string;
  ownerName: string;
  callId: string | null;
  status: "pending" | "calling" | "ringing" | "in-progress" | "ended" | "failed" | "no-answer" | "busy" | "cancelled";
  summary: string | null;
  shortSummary: string | null;
  transcript: string | null;
  durationSeconds: number | null;
  endedReason: string | null;
  error: string | null;
  outcome: CallOutcome | null;
  listingUrl: string;
}

const OUTCOME_META: Record<CallOutcome, { label: string; color: string; bg: string; border: string; icon: string }> = {
  uspesny:   { label: "Úspěšný",          color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", icon: "✅" },
  neutralni: { label: "Neutrální",         color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   icon: "➖" },
  odmitnuti: { label: "Odmítnutí",         color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200",     icon: "❌" },
  zaveseni:  { label: "Zavěšení hovoru",   color: "text-orange-700",  bg: "bg-orange-50",   border: "border-orange-200",  icon: "📵" },
};

const STORAGE_KEY = "renote_ai_call_config";

const DEFAULT_PROMPT = `Jsi AI asistent realitní kanceláře Dobro Reality. Voláš majiteli, který prodává nemovitost sám.

Nemovitost: {{listing}}
Majitel: {{ownerName}}

{{notes}}

PRVNÍ VĚTA — řekni přesně toto, rychle a přirozeně:
"Dobrý den, volám ohledně {{listing}} — mluvím správně s {{ownerName}}? Jsem AI asistent Dobro Reality, volám se rychlou otázkou."

PRŮBĚH — MAX 60 SEKUND CELKEM:
1. První věta viz výše — ihned po přivítání
2. Rovnou k věci: "Jak Vám jde prodej? Nepotřebujete pomoc s právem nebo s fotografem?"
3. Podle odpovědi nabídni 1 konkrétní věc (právník / fotograf / rada ke smlouvě)
4. Zájem → "Makléř Kristián Karas (+420 777 726 001) se Vám ozve."
5. Konec: "Děkuji, hezký den."

STYL:
- Rychlý, přímý, věcný — každá věta má účel
- Mluv v ich formě (Vy, Vám)
- Max 12 slov na větu
- ŽÁDNÉ dlouhé úvody ani vysvětlování kdo jsme

ZAKÁZÁNO:
- Zdlouhavé představování kanceláře
- Nabízet spolupráci nebo provizi
- "samozřejmě", "rozumím", "určitě", "výborně", "rád bych Vám představil"
- Víc než 2 věty bez přestávky

UKONČENÍ:
- Odmítnutí → "Rozumím, hezký den." — KONEC
- Nereaguje 5 sekund → ukonči hovor`;

function loadConfig() {
  if (typeof window === "undefined") return { apiKey: "", assistantId: "", phoneNumberId: "" };
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

function newRecord(): CallRecord {
  return { id: crypto.randomUUID(), phone: "", ownerName: "", listing: "", listingUrl: "", notes: "", shouldCall: true, expanded: false };
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:      { label: "Čeká",          color: "text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> },
  calling:      { label: "Spouštím…",     color: "text-blue-600",         icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  ringing:      { label: "Vyzvání",       color: "text-blue-600",         icon: <PhoneCall className="h-3.5 w-3.5 animate-pulse" /> },
  "in-progress":{ label: "Probíhá",       color: "text-emerald-600",      icon: <PhoneCall className="h-3.5 w-3.5 animate-pulse" /> },
  ended:        { label: "Ukončeno",      color: "text-emerald-600",      icon: <CheckCircle className="h-3.5 w-3.5" /> },
  failed:       { label: "Selhalo",       color: "text-destructive",      icon: <XCircle className="h-3.5 w-3.5" /> },
  "no-answer":  { label: "Nezvedá",       color: "text-amber-600",        icon: <XCircle className="h-3.5 w-3.5" /> },
  busy:         { label: "Obsazeno",      color: "text-amber-600",        icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled:    { label: "Zrušeno",       color: "text-muted-foreground", icon: <Square className="h-3.5 w-3.5" /> },
};

const DONE_STATUSES = ["ended", "failed", "no-answer", "busy", "cancelled"];

export default function AiCallPage() {
  const cfg = loadConfig();
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState<string>(cfg.promptTemplate ?? DEFAULT_PROMPT);
  const [firstMessageTemplate, setFirstMessageTemplate] = useState<string>(cfg.firstMessageTemplate ?? "");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  const [records, setRecords] = useState<CallRecord[]>([newRecord()]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const abortRef = useRef(false);

  const savePrompt = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, promptTemplate, firstMessageTemplate }));
  };

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      const r = await fetch("/api/ai-call/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (data.systemPrompt) setPromptTemplate(data.systemPrompt);
      if (data.firstMessage) setFirstMessageTemplate(data.firstMessage);
    } catch { /* nechej stávající */ }
    finally { setGeneratingPrompt(false); }
  };

  const addRecord = () => {
    if (records.length >= 10) return;
    setRecords((r) => [...r, newRecord()]);
  };

  const removeRecord = (id: string) => {
    setRecords((r) => r.filter((x) => x.id !== id));
  };

  const updateRecord = (id: string, field: keyof CallRecord, value: string | boolean) => {
    setRecords((r) => r.map((x) => x.id === id ? { ...x, [field]: value } : x));
  };

  const updateLog = useCallback((recordId: string, patch: Partial<CallLog>) => {
    setLogs((prev) => prev.map((l) => l.recordId === recordId ? { ...l, ...patch } : l));
  }, []);

  const pollUntilDone = async (callId: string, recordId: string): Promise<void> => {
    return new Promise((resolve) => {
      const iv = setInterval(async () => {
        if (abortRef.current) { clearInterval(iv); resolve(); return; }
        try {
          const r = await fetch(`/api/ai-call/${callId}`);
          const data = await r.json();
          updateLog(recordId, {
            status: data.status,
            summary: data.summary ?? null,
            transcript: data.transcript ?? null,
            durationSeconds: data.durationSeconds ?? null,
            endedReason: data.endedReason ?? null,
          });
          if (DONE_STATUSES.includes(data.status)) {
            clearInterval(iv);

            // VAPI generuje analysis.summary asynchronně — počkáme a zkusíme znovu
            let summary = data.summary;
            let transcript = data.transcript;
            if (!summary || !transcript) {
              for (let attempt = 0; attempt < 4; attempt++) {
                await new Promise((r) => setTimeout(r, 4000));
                try {
                  const retry = await fetch(`/api/ai-call/${callId}`);
                  const retryData = await retry.json();
                  if (retryData.summary) summary = retryData.summary;
                  if (retryData.transcript) transcript = retryData.transcript;
                  if (summary && transcript) break;
                } catch { break; }
              }
              if (summary || transcript) {
                updateLog(recordId, { summary, transcript });
              }
            }

            // Klasifikace výsledku — vždy zavolat, i když chybí přepis
            try {
              const ar = await fetch("/api/ai-call/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary, transcript, endedReason: data.endedReason, status: data.status }),
              });
              const analysis = await ar.json();
              updateLog(recordId, { outcome: analysis.outcome ?? null, shortSummary: analysis.shortSummary ?? null });
            } catch { /* klasifikace selhala, nevadí */ }

            // Odstranit záznam ze seznamu po dokončení
            setTimeout(() => setRecords((prev) => prev.filter((rec) => rec.id !== recordId)), 800);
            resolve();
          }
        } catch { clearInterval(iv); resolve(); }
      }, 4000);
    });
  };

  const handleStart = async () => {
    const valid = records.filter((r) => r.phone.trim() && r.shouldCall);
    if (!valid.length) return;

    abortRef.current = false;
    setRunning(true);
    setLogs(valid.map((r) => ({
      recordId: r.id, phone: r.phone, ownerName: r.ownerName, listingUrl: r.listingUrl,
      callId: null, status: "pending", summary: null, shortSummary: null,
      transcript: null, durationSeconds: null, endedReason: null, error: null, outcome: null,
    })));

    for (let i = 0; i < valid.length; i++) {
      if (abortRef.current) break;
      const rec = valid[i];
      setCurrentIdx(i);
      updateLog(rec.id, { status: "calling" });

      try {
        const r = await fetch("/api/ai-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: rec.phone, ownerName: rec.ownerName, listing: rec.listing, notes: rec.notes, promptTemplate, firstMessageTemplate }),
        });
        const data = await r.json();
        if (!r.ok) { updateLog(rec.id, { status: "failed", error: data.error ?? "Chyba" }); continue; }
        updateLog(rec.id, { callId: data.callId, status: "ringing" });
        await pollUntilDone(data.callId, rec.id);
      } catch {
        updateLog(rec.id, { status: "failed", error: "Síťová chyba" });
      }
    }

    setRunning(false);
    setCurrentIdx(null);
  };

  const handleStop = () => { abortRef.current = true; };

  const hasValidRecords = records.some((r) => r.phone.trim() && r.shouldCall);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-navy flex items-center gap-2">
          <Phone className="h-6 w-6" /> AI Call Asistent
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Přidejte záznamy s čísly majitelů a spusťte hromadné volání.
        </p>
      </div>

      {/* Info panel */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">Makléř</span>
          <span className="font-medium text-foreground">Kristián Karas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">Telefon</span>
          <span className="font-medium text-foreground">+420 777 726 001</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">Kancelář</span>
          <span className="font-medium text-foreground">Dobro Reality</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">VAPI asistent</span>
          <span className="font-mono text-xs text-muted-foreground truncate">04bbdf9e-cde5…</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">Phone ID</span>
          <span className="font-mono text-xs text-muted-foreground truncate">9d4863e9-2082…</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">VAPI klíč</span>
          <span className="font-mono text-xs text-muted-foreground">••••••••••••••••</span>
        </div>
      </div>

      {/* Prompt asistenta */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setPromptOpen((v) => !v)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Prompt asistenta</CardTitle>
            {promptOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          {!promptOpen && <CardDescription className="text-xs">Šablona systémového promptu — upravte ručně nebo vygenerujte pomocí AI</CardDescription>}
        </CardHeader>
        {promptOpen && (
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
              Dostupné proměnné:{" "}
              {["{{listing}}", "{{notes}}", "{{ownerName}}", "{{brokerName}}", "{{brokerPhone}}", "{{agencyName}}"].map((v) => (
                <code key={v} className="bg-background border border-border px-1 py-0.5 rounded mr-1">{v}</code>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Systémový prompt</Label>
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleGeneratePrompt}
                  disabled={generatingPrompt}
                >
                  {generatingPrompt
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Generuji…</>
                    : <><Wand2 className="h-3 w-3" /> Generovat AI</>}
                </Button>
              </div>
              <Textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={18}
                className="text-xs font-mono resize-y"
              />
            </div>
            <div>
              <Label className="text-xs">První věta asistenta (firstMessage)</Label>
              <Input
                value={firstMessageTemplate}
                onChange={(e) => setFirstMessageTemplate(e.target.value)}
                placeholder="Nechte prázdné = AI vygeneruje pro každý hovor zvlášť"
                className="mt-1 text-sm"
              />
            </div>
            <Button type="button" variant="navy" size="sm" onClick={savePrompt}>Uložit prompt</Button>
          </CardContent>
        )}
      </Card>

      {/* Seznam záznamů */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Záznamy k volání</p>
            <p className="text-xs text-muted-foreground">{records.length} / 10 záznamů</p>
          </div>
          <Button
            type="button" variant="outline" size="sm"
            onClick={addRecord}
            disabled={records.length >= 10 || running}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Přidat
          </Button>
        </div>

        {records.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
            Žádné záznamy. Klikněte na „Přidat".
          </p>
        )}

        {records.map((rec, idx) => {
          const log = logs.find((l) => l.recordId === rec.id);
          const statusMeta = log ? (STATUS_META[log.status] ?? STATUS_META.pending) : null;
          return (
            <div key={rec.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              {/* Hlavička — kliknutelná */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                onClick={() => updateRecord(rec.id, "expanded", !rec.expanded)}
              >
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    id={`shouldCall-${rec.id}`}
                    checked={rec.shouldCall}
                    onCheckedChange={(v: boolean | "indeterminate") => updateRecord(rec.id, "shouldCall", v === true)}
                    disabled={running}
                  />
                  <label htmlFor={`shouldCall-${rec.id}`} className="text-[11px] font-medium text-muted-foreground cursor-pointer select-none">
                    Volat
                  </label>
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-bold text-navy">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {rec.ownerName || <span className="font-normal text-muted-foreground">Nevyplněno</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {rec.phone || "Bez čísla"}
                    {rec.listing && <span className="ml-2 text-muted-foreground/60">· {rec.listing.slice(0, 40)}{rec.listing.length > 40 ? "…" : ""}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusMeta && (
                    <span className={`flex items-center gap-1 text-[11px] font-medium ${statusMeta.color}`}>
                      {statusMeta.icon} {statusMeta.label}
                    </span>
                  )}
                  {!running && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeRecord(rec.id); }}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {rec.expanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Tělo — rozbalené */}
              {rec.expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-border bg-muted/10 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Telefonní číslo *</Label>
                      <Input
                        value={rec.phone}
                        onChange={(e) => updateRecord(rec.id, "phone", e.target.value)}
                        placeholder="+420 777 888 999"
                        className="mt-1 h-8 text-sm"
                        disabled={running}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Jméno majitele</Label>
                      <Input
                        value={rec.ownerName}
                        onChange={(e) => updateRecord(rec.id, "ownerName", e.target.value)}
                        placeholder="Jan Novák"
                        className="mt-1 h-8 text-sm"
                        disabled={running}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">URL inzerátu</Label>
                    <Input
                      value={rec.listingUrl}
                      onChange={(e) => updateRecord(rec.id, "listingUrl", e.target.value)}
                      placeholder="https://www.sreality.cz/…"
                      className="mt-1 h-8 text-sm"
                      disabled={running}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Popis nemovitosti (pro AI asistenta)</Label>
                    <Textarea
                      value={rec.listing}
                      onChange={(e) => updateRecord(rec.id, "listing", e.target.value)}
                      rows={3}
                      placeholder="Prodej bytu 3+1, 80m², Praha 6, 6 500 000 Kč…"
                      className="mt-1 text-sm resize-none"
                      disabled={running}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Poznámky a pokyny pro AI asistenta</Label>
                    <Textarea
                      value={rec.notes}
                      onChange={(e) => updateRecord(rec.id, "notes", e.target.value)}
                      rows={3}
                      placeholder="Např.: Majitel preferuje schůzky odpoledne. Zmiň slevu na provizi. Nezmiňuj konkurenci…"
                      className="mt-1 text-sm resize-none"
                      disabled={running}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Start / Stop */}
      <div className="flex gap-3">
        {!running ? (
          <Button
            type="button"
            variant="navy"
            className="flex-1 gap-2"
            disabled={!hasValidRecords}
            onClick={handleStart}
          >
            <Play className="h-4 w-4" />
            Spustit volání ({records.filter((r) => r.phone.trim() && r.shouldCall).length} čísel)
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            className="flex-1 gap-2"
            onClick={handleStop}
          >
            <Square className="h-4 w-4" />
            Zastavit
          </Button>
        )}
      </div>

      {/* Log odpovědí */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Průběh volání
              {running && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {logs.map((log, idx) => {
              const meta = STATUS_META[log.status] ?? { label: log.status, color: "text-muted-foreground", icon: <AlertCircle className="h-3.5 w-3.5" /> };
              const isActive = running && currentIdx === logs.findIndex((l) => l.recordId === log.recordId && !DONE_STATUSES.includes(l.status) && l.status !== "pending");
              return (
                <div key={log.recordId} className={`rounded-lg border p-3 space-y-2 transition-colors ${isActive ? "border-navy/30 bg-navy/5" : "border-border"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {log.ownerName || log.phone}
                        {log.ownerName && <span className="text-muted-foreground font-normal ml-1 text-xs">{log.phone}</span>}
                      </p>
                      {log.listingUrl && (
                        <a
                          href={log.listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-navy hover:underline truncate block max-w-xs"
                        >
                          {log.listingUrl}
                        </a>
                      )}
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {log.outcome && (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${OUTCOME_META[log.outcome].color} ${OUTCOME_META[log.outcome].bg} ${OUTCOME_META[log.outcome].border}`}>
                        {OUTCOME_META[log.outcome].icon} {OUTCOME_META[log.outcome].label}
                      </span>
                    )}
                    {log.durationSeconds != null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor(log.durationSeconds / 60)}:{String(log.durationSeconds % 60).padStart(2, "0")} min
                      </span>
                    )}
                  </div>

                  {log.error && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{log.error}</p>
                  )}

                  {log.shortSummary && (
                    <div className={`rounded-lg border px-3 py-2.5 ${log.outcome ? `${OUTCOME_META[log.outcome].bg} ${OUTCOME_META[log.outcome].border}` : "bg-muted/30 border-border"}`}>
                      <p className="text-xs font-semibold text-foreground mb-1">Shrnutí hovoru</p>
                      <p className="text-sm text-foreground leading-relaxed">{log.shortSummary}</p>
                    </div>
                  )}

                  {!log.shortSummary && DONE_STATUSES.includes(log.status) && !log.error && (
                    <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Generuji shrnutí…
                    </p>
                  )}

                  {log.transcript && (
                    <details className="group">
                      <summary className="text-xs font-medium text-navy cursor-pointer select-none hover:underline">
                        Přepis hovoru
                      </summary>
                      <div className="mt-1.5 rounded border border-border bg-muted/30 px-2.5 py-2 text-xs text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {log.transcript}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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
  ChevronDown, ChevronUp, PhoneCall, Clock, Plus, Trash2, Play, Square,
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

type CallOutcome = "uspesny" | "neutralni" | "odmitnuti";

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

const OUTCOME_META: Record<CallOutcome, { label: string; color: string; bg: string; border: string }> = {
  uspesny:   { label: "Úspěšný",  color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200" },
  neutralni: { label: "Neutrální", color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200" },
  odmitnuti: { label: "Odmítnutí", color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200" },
};

const STORAGE_KEY = "renote_ai_call_config";

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
  const [configOpen, setConfigOpen] = useState(!cfg.apiKey);
  const [apiKey, setApiKey] = useState(cfg.apiKey ?? "");
  const [assistantId, setAssistantId] = useState(cfg.assistantId ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState(cfg.phoneNumberId ?? "");
  const [brokerName, setBrokerName] = useState(cfg.brokerName ?? "");
  const [brokerPhone, setBrokerPhone] = useState(cfg.brokerPhone ?? "");
  const [agencyName, setAgencyName] = useState(cfg.agencyName ?? "");

  const [records, setRecords] = useState<CallRecord[]>([newRecord()]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const abortRef = useRef(false);

  const saveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, assistantId, phoneNumberId, brokerName, brokerPhone, agencyName }));
    setConfigOpen(false);
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
          const r = await fetch(`/api/ai-call/${callId}?apiKey=${encodeURIComponent(apiKey)}`);
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
                  const retry = await fetch(`/api/ai-call/${callId}?apiKey=${encodeURIComponent(apiKey)}`);
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
    if (!apiKey || !assistantId || !phoneNumberId) { setConfigOpen(true); return; }

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
          body: JSON.stringify({ apiKey, assistantId, phoneNumberId, phone: rec.phone, ownerName: rec.ownerName, listing: rec.listing, notes: rec.notes, brokerName, brokerPhone, agencyName }),
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

  const configValid = !!(apiKey && assistantId && phoneNumberId);
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

      {/* VAPI konfigurace */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setConfigOpen((v) => !v)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              VAPI konfigurace
              {configValid && (
                <span className="text-[11px] font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Uloženo</span>
              )}
            </CardTitle>
            {configOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          {!configOpen && <CardDescription className="text-xs">Klikněte pro zobrazení / úpravu</CardDescription>}
        </CardHeader>
        {configOpen && (
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="apiKey">VAPI API klíč</Label>
              <Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="vapi_..." className="mt-1" />
            </div>
            <div>
              <Label htmlFor="assistantId">Assistant ID</Label>
              <Input id="assistantId" value={assistantId} onChange={(e) => setAssistantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input id="phoneNumberId" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="mt-1" />
            </div>

            <div className="pt-1 border-t border-border">
              <p className="text-xs font-medium text-foreground mt-3 mb-1">Údaje makléře (proměnné pro asistenta)</p>
              <p className="text-[11px] text-muted-foreground mb-2">
                Předají se do hovoru jako <code className="bg-muted px-1 rounded">brokerName</code>,{" "}
                <code className="bg-muted px-1 rounded">brokerPhone</code> a{" "}
                <code className="bg-muted px-1 rounded">agencyName</code>.
              </p>
            </div>
            <div>
              <Label htmlFor="brokerName">Jméno makléře</Label>
              <Input id="brokerName" value={brokerName} onChange={(e) => setBrokerName(e.target.value)} placeholder="Jan Novák" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="brokerPhone">Telefon makléře</Label>
              <Input id="brokerPhone" value={brokerPhone} onChange={(e) => setBrokerPhone(e.target.value)} placeholder="+420 777 888 999" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="agencyName">Název realitní kanceláře</Label>
              <Input id="agencyName" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Reality Praha" className="mt-1" />
            </div>

            <Button type="button" variant="navy" size="sm" onClick={saveConfig}>Uložit konfiguraci</Button>
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
                    onCheckedChange={(v) => updateRecord(rec.id, "shouldCall", !!v)}
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
            disabled={!hasValidRecords || !configValid}
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

                  {log.outcome && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${OUTCOME_META[log.outcome].color} ${OUTCOME_META[log.outcome].bg} ${OUTCOME_META[log.outcome].border}`}>
                      {log.outcome === "uspesny" && <CheckCircle className="h-3 w-3" />}
                      {log.outcome === "neutralni" && <AlertCircle className="h-3 w-3" />}
                      {log.outcome === "odmitnuti" && <XCircle className="h-3 w-3" />}
                      {OUTCOME_META[log.outcome].label}
                    </span>
                  )}

                  {log.error && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{log.error}</p>
                  )}

                  {log.durationSeconds != null && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Math.floor(log.durationSeconds / 60)}:{String(log.durationSeconds % 60).padStart(2, "0")} min
                      {log.endedReason && <span className="ml-1">· {log.endedReason}</span>}
                    </p>
                  )}

                  {log.shortSummary && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Shrnutí</p>
                      <div className="rounded border border-border bg-muted/30 px-2.5 py-2 text-xs text-foreground leading-relaxed">
                        {log.shortSummary}
                      </div>
                    </div>
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

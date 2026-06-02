"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone, Loader2, CheckCircle, XCircle, AlertCircle,
  ChevronDown, ChevronUp, PhoneCall, Clock,
} from "lucide-react";

interface CallResult {
  status: string;
  endedReason: string | null;
  summary: string | null;
  transcript: string | null;
  durationSeconds: number | null;
}

const STORAGE_KEY = "renote_ai_call_config";

function loadConfig() {
  if (typeof window === "undefined") return { apiKey: "", assistantId: "", phoneNumberId: "" };
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function AiCallPage() {
  const [configOpen, setConfigOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");

  const [phone, setPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [listing, setListing] = useState("");

  const [calling, setCalling] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [result, setResult] = useState<CallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const cfg = loadConfig();
    if (cfg.apiKey) setApiKey(cfg.apiKey);
    if (cfg.assistantId) setAssistantId(cfg.assistantId);
    if (cfg.phoneNumberId) setPhoneNumberId(cfg.phoneNumberId);
    if (!cfg.apiKey) setConfigOpen(true);
  }, []);

  const saveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, assistantId, phoneNumberId }));
    setConfigOpen(false);
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setPolling(false);
  };

  const startPolling = (id: string) => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/ai-call/${id}?apiKey=${encodeURIComponent(apiKey)}`);
        const data: CallResult = await r.json();
        setResult(data);
        if (["ended", "failed", "no-answer", "busy", "cancelled"].includes(data.status)) {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    }, 4000);
  };

  const handleCall = async () => {
    if (!apiKey || !assistantId || !phoneNumberId || !phone) {
      setError("Vyplňte VAPI konfiguraci a telefonní číslo.");
      return;
    }
    setCalling(true);
    setError(null);
    setResult(null);
    setCallId(null);
    stopPolling();

    try {
      const r = await fetch("/api/ai-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, assistantId, phoneNumberId, phone, ownerName, listing }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Chyba při spouštění hovoru.");
        return;
      }
      setCallId(data.callId);
      startPolling(data.callId);
    } catch {
      setError("Síťová chyba.");
    } finally {
      setCalling(false);
    }
  };

  const statusLabel: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    queued: { label: "Ve frontě", icon: <Clock className="h-4 w-4" />, color: "text-amber-600" },
    ringing: { label: "Vyzvání", icon: <PhoneCall className="h-4 w-4 animate-pulse" />, color: "text-blue-600" },
    "in-progress": { label: "Probíhá hovor", icon: <PhoneCall className="h-4 w-4 animate-pulse" />, color: "text-emerald-600" },
    ended: { label: "Ukončeno", icon: <CheckCircle className="h-4 w-4" />, color: "text-emerald-600" },
    failed: { label: "Selhalo", icon: <XCircle className="h-4 w-4" />, color: "text-destructive" },
    "no-answer": { label: "Nedvíhá", icon: <XCircle className="h-4 w-4" />, color: "text-amber-600" },
    busy: { label: "Obsazeno", icon: <XCircle className="h-4 w-4" />, color: "text-amber-600" },
    cancelled: { label: "Zrušeno", icon: <XCircle className="h-4 w-4" />, color: "text-muted-foreground" },
  };

  const currentStatus = result ? (statusLabel[result.status] ?? { label: result.status, icon: <AlertCircle className="h-4 w-4" />, color: "text-muted-foreground" }) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-navy flex items-center gap-2">
          <Phone className="h-6 w-6" />
          AI Call Asistent
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          AI asistent zavolá majiteli nemovitosti a zjistí zájem o prodej přes realitní kancelář.
        </p>
      </div>

      {/* VAPI konfigurace */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setConfigOpen((v) => !v)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              VAPI konfigurace
              {apiKey && assistantId && phoneNumberId && (
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
            <Button type="button" variant="navy" size="sm" onClick={saveConfig}>
              Uložit konfiguraci
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Formulář volání */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nové volání</CardTitle>
          <CardDescription>Vyplňte informace o majiteli a nemovitosti.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Telefonní číslo majitele *</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+420 777 888 999" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ownerName">Jméno majitele</Label>
              <Input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jan Novák" className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="listing">Inzerát / popis nemovitosti</Label>
            <Textarea
              id="listing"
              value={listing}
              onChange={(e) => setListing(e.target.value)}
              rows={6}
              placeholder="Vložte celý text inzerátu nebo popis nemovitosti... Např: Prodej bytu 3+1, 80m², Praha 6, cena 6 500 000 Kč..."
              className="mt-1"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="navy"
            disabled={calling || polling}
            onClick={handleCall}
            className="w-full"
          >
            {calling ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Spouštím hovor…</>
            ) : polling ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Probíhá hovor…</>
            ) : (
              <><Phone className="h-4 w-4 mr-2" /> Zavolat</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Výsledek hovoru */}
      {(callId || result) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Výsledek hovoru
              {currentStatus && (
                <span className={`flex items-center gap-1 text-sm font-normal ${currentStatus.color}`}>
                  {currentStatus.icon}
                  {currentStatus.label}
                </span>
              )}
              {polling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
            </CardTitle>
            {callId && <CardDescription className="text-xs font-mono">ID: {callId}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {result?.durationSeconds != null && (
              <p className="text-sm text-muted-foreground">
                <Clock className="inline h-3.5 w-3.5 mr-1" />
                Délka hovoru: {Math.floor(result.durationSeconds / 60)}:{String(result.durationSeconds % 60).padStart(2, "0")} min
              </p>
            )}
            {result?.endedReason && (
              <p className="text-sm text-muted-foreground">Důvod ukončení: <span className="font-medium text-foreground">{result.endedReason}</span></p>
            )}
            {result?.summary && (
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Shrnutí hovoru</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap">
                  {result.summary}
                </div>
              </div>
            )}
            {result?.transcript && (
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Přepis hovoru</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {result.transcript}
                </div>
              </div>
            )}
            {result && !result.summary && !result.transcript && ["ended", "failed", "no-answer", "busy"].includes(result.status) && (
              <p className="text-sm text-muted-foreground">Shrnutí zatím není k dispozici.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

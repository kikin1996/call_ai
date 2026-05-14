"use client";

import { useEffect, useState, Suspense } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  User,
  ShieldAlert,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";

const TIME_REGEX = /^\d{2}:\d{2}$/;

interface DefaultExtra {
  id: string;
  type: "sms" | "vapi";
  minutesBefore: number;
  label: string;
}

const schema = z.object({
  brokerName: z.string().optional(),
  brokerPhone: z.string().optional(),
  agencyName: z.string().optional(),
  triggerKeyword: z.string().min(1, "Zadejte klíčové slovo"),
  smsTemplate: z.string().min(1, "Zadejte šablonu SMS"),
  notificationTimeFrom: z.string().regex(TIME_REGEX, "Formát HH:MM").default("08:00"),
  notificationTimeTo: z.string().regex(TIME_REGEX, "Formát HH:MM").default("18:00"),
  defaultSms2hEnabled: z.boolean().default(true),
  defaultSms1hEnabled: z.boolean().default(true),
  defaultVapiEnabled: z.boolean().default(true),
  notificationChannel: z.enum(["whatsapp", "email", "both"]),
  whatsappPhone: z.string().optional(),
  whatsappApikey: z.string().optional(),
  notificationEmail: z.string().email("Zadejte platný email").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

const defaultTemplate =
  "Dobrý den, prosím o potvrzení dnešní prohlídky na adrese {address}  v {time}. Odpovězte ANO pro potvrzení nebo NE pro zrušení.";

function SettingsPageInner() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const calendarStatus = searchParams?.get("calendar") ?? null;
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [testWhatsappResult, setTestWhatsappResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [defaultExtras, setDefaultExtras] = useState<DefaultExtra[]>([]);
  const [addingExtra, setAddingExtra] = useState(false);
  const [newExtraType, setNewExtraType] = useState<"sms" | "vapi">("sms");
  const [newExtraMinutes, setNewExtraMinutes] = useState(90);
  const [newExtraLabel, setNewExtraLabel] = useState("");
  const supabase = createClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      brokerName: "",
      brokerPhone: "",
      agencyName: "",
      triggerKeyword: "#prohlidka",
      smsTemplate: defaultTemplate,
      notificationTimeFrom: "08:00",
      notificationTimeTo: "18:00",
      defaultSms2hEnabled: true,
      defaultSms1hEnabled: true,
      defaultVapiEnabled: true,
      notificationChannel: "whatsapp",
      whatsappPhone: "",
      whatsappApikey: "",
      notificationEmail: "",
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || !isSupabaseConfigured()) {
      setLoaded(true);
      return;
    }
    const load = async () => {
      try {
        const [settingsRes, calendarRes] = await Promise.all([
          supabase
            .from("user_settings")
            .select("broker_name, broker_phone, agency_name, trigger_keyword, sms_template, notification_time_from, notification_time_to, default_sms2h_enabled, default_sms1h_enabled, default_vapi_enabled, default_extra_notifications, notification_channel, whatsapp_phone, whatsapp_apikey, notification_email")
            .eq("user_id", user.id)
            .maybeSingle(),
          fetch("/api/settings/calendar-connected").then((r) => r.ok ? r.json() : { connected: false }).catch(() => ({ connected: false })),
        ]);
        const data = settingsRes.data;
        if (data) {
          setDefaultExtras((data.default_extra_notifications as DefaultExtra[]) ?? []);
          form.reset({
            brokerName: data.broker_name ?? "",
            brokerPhone: data.broker_phone ?? "",
            agencyName: data.agency_name ?? "",
            triggerKeyword: data.trigger_keyword ?? "#prohlidka",
            smsTemplate: data.sms_template ?? defaultTemplate,
            notificationTimeFrom: data.notification_time_from ?? "08:00",
            notificationTimeTo: data.notification_time_to ?? "18:00",
            defaultSms2hEnabled: data.default_sms2h_enabled ?? true,
            defaultSms1hEnabled: data.default_sms1h_enabled ?? true,
            defaultVapiEnabled: data.default_vapi_enabled ?? true,
            notificationChannel: (data.notification_channel as "whatsapp" | "email" | "both") ?? "whatsapp",
            whatsappPhone: data.whatsapp_phone ?? "",
            whatsappApikey: data.whatsapp_apikey ?? "",
            notificationEmail: data.notification_email ?? "",
          });
        }
        setCalendarConnected(calendarRes.connected ?? false);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (calendarStatus === "ok") setCalendarConnected(true);
  }, [calendarStatus]);

  const onSubmit = async (values: FormValues) => {
    if (!user?.id) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: user.id,
          broker_name: values.brokerName || null,
          broker_phone: values.brokerPhone || null,
          agency_name: values.agencyName || null,
          trigger_keyword: values.triggerKeyword,
          sms_template: values.smsTemplate,
          notification_time_from: values.notificationTimeFrom,
          notification_time_to: values.notificationTimeTo,
          default_sms2h_enabled: values.defaultSms2hEnabled,
          default_sms1h_enabled: values.defaultSms1hEnabled,
          default_vapi_enabled: values.defaultVapiEnabled,
          default_extra_notifications: defaultExtras,
          notification_channel: values.notificationChannel,
          whatsapp_phone: values.whatsappPhone || null,
          whatsapp_apikey: values.whatsappApikey || null,
          notification_email: values.notificationEmail || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) {
        setSaveError(`Chyba uložení: ${error.message}`);
      } else {
        form.reset(values);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const calendarMessage = calendarStatus === "ok"
    ? { icon: CheckCircle, text: "Google Kalendář je propojen.", className: "text-emerald-600 bg-emerald-50 border-emerald-200" }
    : calendarStatus === "error"
    ? { icon: XCircle, text: "Propojení se nepovedlo. Zkuste to znovu.", className: "text-destructive bg-destructive/10 border-destructive/20" }
    : calendarStatus === "no_refresh"
    ? { icon: AlertCircle, text: 'Google nevrátil refresh token. Odhlaste se z Google a zkuste znovu s povolením "Offline access".', className: "text-amber-600 bg-amber-50 border-amber-200" }
    : calendarStatus === "config"
    ? { icon: AlertCircle, text: "Na serveru chybí GOOGLE_CLIENT_ID nebo GOOGLE_CLIENT_SECRET.", className: "text-amber-600 bg-amber-50 border-amber-200" }
    : null;

  return (
    <div className="p-6 max-w-2xl">
      {/* Modal – upozornění před propojením kalendáře */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-background rounded-2xl shadow-xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => setShowCalendarModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Upozornění Google</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Google vám zobrazí varování <strong className="text-foreground">„Tato aplikace není ověřena"</strong>.
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              Aplikace <strong className="text-foreground">Renote</strong> je v Beta fázi a aktuálně prochází procesem ověření ze strany Google. Vaše data jsou v bezpečí – přistupujeme pouze ke čtení vašich událostí v kalendáři.
            </p>
            <p className="text-sm text-muted-foreground mb-5">
              Klikněte na <strong className="text-foreground">„Pokročilé"</strong> a poté na{" "}
              <strong className="text-foreground">„Přejít na renote (nezabezpečené)"</strong> pro dokončení propojení.
            </p>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCalendarModal(false)}>
                Zrušit
              </Button>
              <Button type="button" variant="navy" asChild>
                <Link href="/api/auth/google-calendar">
                  Rozumím, propojit kalendář
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      <h1 className="text-2xl font-display font-semibold text-navy mb-2">
        Nastavení
      </h1>
      <p className="text-muted-foreground mb-6">
        Kalendář, šablona SMS a notifikace (WhatsApp nebo email).
      </p>

      {calendarMessage && (
        <div className={`mb-6 flex items-center gap-2 rounded-lg border p-3 ${calendarMessage.className}`}>
          <calendarMessage.icon className="h-5 w-5 shrink-0" />
          <p className="text-sm">{calendarMessage.text}</p>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Profil makléře */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profil makléře
            </CardTitle>
            <CardDescription>
              Používá se v SMS i hlasových hovorech VAPI jako proměnné{" "}
              <code className="text-xs bg-muted px-1 rounded">{"{{brokerName}}"}</code>,{" "}
              <code className="text-xs bg-muted px-1 rounded">{"{{brokerPhone}}"}</code> a{" "}
              <code className="text-xs bg-muted px-1 rounded">{"{{agencyName}}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="brokerName">Jméno makléře</Label>
              <Input
                id="brokerName"
                {...form.register("brokerName")}
                placeholder="Jan Novák"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="brokerPhone">Telefon makléře</Label>
              <Input
                id="brokerPhone"
                {...form.register("brokerPhone")}
                placeholder="+420 123 456 789"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="agencyName">Název realitní kanceláře</Label>
              <Input
                id="agencyName"
                {...form.register("agencyName")}
                placeholder="Reality Praha"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Kalendář */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Kalendář
            </CardTitle>
            <CardDescription>
              Události obsahující toto slovo budou považovány za prohlídky.
              Formát v popisu: Tel: +420… Adresa: …
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Propojení Google Kalendáře</Label>
              <p className="text-sm text-muted-foreground mt-1 mb-2">
                Prohlídky se načítají z událostí v Google Kalendáři.
              </p>
              {calendarConnected && (
                <p className="text-sm text-emerald-600 mb-2 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> Kalendář je propojen
                </p>
              )}
              <Button type="button" variant="outline" onClick={() => setShowCalendarModal(true)}>
                {calendarConnected ? "Znovu propojit Google Kalendář" : "Propojit Google Kalendář"}
              </Button>
            </div>
            <div>
              <Label htmlFor="triggerKeyword">
                Klíčové slovo (např. #prohlidka)
              </Label>
              <Input
                id="triggerKeyword"
                {...form.register("triggerKeyword")}
                placeholder="#prohlidka"
                className="mt-1"
              />
              {form.formState.errors.triggerKeyword && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.triggerKeyword.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Šablona SMS */}
        <Card>
          <CardHeader>
            <CardTitle>Šablona SMS</CardTitle>
            <CardDescription>
              Placeholdery: {"{address}"}, {"{time}"}, {"{clientName}"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="smsTemplate">Text zprávy</Label>
              <Textarea
                id="smsTemplate"
                {...form.register("smsTemplate")}
                rows={4}
                className="mt-1"
              />
              {form.formState.errors.smsTemplate && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.smsTemplate.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Výchozí notifikace */}
        <Card>
          <CardHeader>
            <CardTitle>Výchozí notifikace pro nové prohlídky</CardTitle>
            <CardDescription>
              Při přidání nové prohlídky z kalendáře se použijí tato nastavení. Každou prohlídku lze pak upravit individuálně přímo v dashboardu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(
                [
                  { field: "defaultSms2hEnabled", label: "SMS 2h před prohlídkou", desc: "Připomenutí 2 hodiny předem" },
                  { field: "defaultSms1hEnabled", label: "SMS 1h před prohlídkou", desc: "Připomenutí hodinu předem" },
                  { field: "defaultVapiEnabled",  label: "Hlasový hovor 30min před", desc: "Automatický VAPI hovor půl hodiny předem" },
                ] as const
              ).map(({ field, label, desc }) => (
                <label key={field} className="flex items-center justify-between gap-4 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <div
                    role="switch"
                    aria-checked={form.watch(field)}
                    onClick={() => form.setValue(field, !form.watch(field), { shouldDirty: true })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      form.watch(field) ? "bg-navy" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${form.watch(field) ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                </label>
              ))}
            </div>

            {/* Vlastní výchozí notifikace */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">Vlastní notifikace</p>
                <button
                  type="button"
                  onClick={() => setAddingExtra(true)}
                  className="flex items-center gap-1 text-xs text-navy hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Přidat
                </button>
              </div>

              {defaultExtras.length === 0 && !addingExtra && (
                <p className="text-xs text-muted-foreground py-2">Žádné vlastní notifikace. Klikněte na „Přidat" pro přidání.</p>
              )}

              <div className="space-y-2">
                {defaultExtras.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${n.type === "sms" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
                        {n.type === "sms" ? "SMS" : "Hovor"}
                      </span>
                      <span className="text-sm text-foreground">{n.label || `${n.minutesBefore} min před`}</span>
                      <span className="text-xs text-muted-foreground">({n.minutesBefore} min)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDefaultExtras((prev) => prev.filter((x) => x.id !== n.id))}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {addingExtra && (
                <div className="mt-2 rounded-lg border border-navy/20 bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-medium text-foreground">Nová notifikace</p>
                  <div className="flex gap-2">
                    {(["sms", "vapi"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewExtraType(t)}
                        className={`px-3 py-1 rounded-full text-xs border transition-all ${newExtraType === t ? "bg-navy text-white border-navy" : "bg-background border-border text-muted-foreground"}`}
                      >
                        {t === "sms" ? "SMS" : "Hovor (VAPI)"}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground block mb-1">Název (volitelný)</label>
                      <Input
                        value={newExtraLabel}
                        onChange={(e) => setNewExtraLabel(e.target.value)}
                        placeholder={newExtraType === "sms" ? "SMS 90min před" : "Hovor 45min před"}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Minut před</label>
                      <Input
                        type="number"
                        min={5}
                        max={1440}
                        value={newExtraMinutes}
                        onChange={(e) => setNewExtraMinutes(Number(e.target.value))}
                        className="h-8 text-sm w-24"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setAddingExtra(false); setNewExtraLabel(""); setNewExtraMinutes(90); }}>
                      Zrušit
                    </Button>
                    <Button
                      type="button"
                      variant="navy"
                      size="sm"
                      onClick={() => {
                        setDefaultExtras((prev) => [...prev, {
                          id: crypto.randomUUID(),
                          type: newExtraType,
                          minutesBefore: newExtraMinutes,
                          label: newExtraLabel || `${newExtraType === "sms" ? "SMS" : "Hovor"} ${newExtraMinutes}min před`,
                        }]);
                        setAddingExtra(false);
                        setNewExtraLabel("");
                        setNewExtraMinutes(90);
                      }}
                    >
                      Přidat
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Časové okno */}
        <Card>
          <CardHeader>
            <CardTitle>Časové okno pro notifikace</CardTitle>
            <CardDescription>
              SMS a hovory se odesílají jen v tomto čase. Pokud by notifikace vyšla mimo okno, posune se na předchozí den ve{" "}
              <strong>{form.watch("notificationTimeTo") || "18:00"}</strong> − offset.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <Label htmlFor="notificationTimeFrom">Nejdříve (ráno)</Label>
                <Input
                  id="notificationTimeFrom"
                  type="time"
                  {...form.register("notificationTimeFrom")}
                  className="mt-1 w-32"
                />
                {form.formState.errors.notificationTimeFrom && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.notificationTimeFrom.message}</p>
                )}
              </div>
              <div className="pt-5 text-muted-foreground">–</div>
              <div>
                <Label htmlFor="notificationTimeTo">Nejpozději (večer)</Label>
                <Input
                  id="notificationTimeTo"
                  type="time"
                  {...form.register("notificationTimeTo")}
                  className="mt-1 w-32"
                />
                {form.formState.errors.notificationTimeTo && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.notificationTimeTo.message}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Příklad: prohlídka v 8:00, SMS 2h by šla v 6:00 (mrtvá zóna) → posune se na předchozí den v{" "}
              {(() => {
                const to = form.watch("notificationTimeTo") || "18:00";
                const [h, m] = to.split(":").map(Number);
                const shifted2h = new Date(0, 0, 0, h, m - 120);
                const shifted1h = new Date(0, 0, 0, h, m - 60);
                const shifted30 = new Date(0, 0, 0, h, m - 30);
                const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                return `${fmt(shifted2h)} (SMS 2h), ${fmt(shifted1h)} (SMS 1h), ${fmt(shifted30)} (hovor)`;
              })()}
            </p>
          </CardContent>
        </Card>

        {/* Notifikace */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Notifikace makléře
            </CardTitle>
            <CardDescription>
              Vyberte, jak chcete dostávat upozornění o odeslaných SMS a odpovědích klientů.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Výběr kanálu */}
            <div>
              <Label className="mb-2 block">Způsob notifikací</Label>
              <div className="flex gap-2">
                {(["whatsapp", "email", "both"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => form.setValue("notificationChannel", ch)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      form.watch("notificationChannel") === ch
                        ? "bg-navy text-white border-navy"
                        : "bg-muted text-muted-foreground border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    {ch === "whatsapp" ? "WhatsApp" : ch === "email" ? "Email" : "WhatsApp + Email"}
                  </button>
                ))}
              </div>
            </div>

            {/* WhatsApp pole */}
            {["whatsapp", "both"].includes(form.watch("notificationChannel")) && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Aktivace: přidejte <strong>+34 644 95 73 56</strong> do kontaktů a pošlete zprávu{" "}
                  <em>„I allow callmebot to send me messages"</em>. API klíč dostanete odpovědí.
                </p>
                <div>
                  <Label htmlFor="whatsappPhone">Vaše tel. číslo (s předvolbou)</Label>
                  <Input
                    id="whatsappPhone"
                    {...form.register("whatsappPhone")}
                    placeholder="+420777888999"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="whatsappApikey">CallMeBot API klíč</Label>
                  <div className="relative mt-1">
                    <Input
                      id="whatsappApikey"
                      type={showApiKey ? "text" : "password"}
                      {...form.register("whatsappApikey")}
                      placeholder="1234567"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingWhatsapp}
                    onClick={async () => {
                      setTestingWhatsapp(true);
                      setTestWhatsappResult(null);
                      try {
                        const r = await fetch("/api/test/whatsapp", { method: "POST" });
                        const d = await r.json().catch(() => ({}));
                        setTestWhatsappResult(r.ok ? { ok: true, msg: "Zpráva odeslána!" } : { ok: false, msg: d.error ?? "Chyba" });
                      } catch {
                        setTestWhatsappResult({ ok: false, msg: "Síťová chyba" });
                      } finally {
                        setTestingWhatsapp(false);
                      }
                    }}
                  >
                    {testingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Test WhatsApp
                  </Button>
                  {testWhatsappResult && (
                    <span className={`text-sm ${testWhatsappResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                      {testWhatsappResult.ok ? <CheckCircle className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}
                      {testWhatsappResult.msg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Email pole */}
            {["email", "both"].includes(form.watch("notificationChannel")) && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Notifikace se odešlou na váš email přes Resend. Vyžaduje ENV proměnnou{" "}
                  <code className="bg-muted px-1 rounded">RESEND_API_KEY</code>.
                </p>
                <div>
                  <Label htmlFor="notificationEmail">Email pro notifikace</Label>
                  <Input
                    id="notificationEmail"
                    type="email"
                    {...form.register("notificationEmail")}
                    placeholder="maklér@example.com"
                    className="mt-1"
                  />
                  {form.formState.errors.notificationEmail && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.notificationEmail.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingEmail || !form.watch("notificationEmail")}
                    onClick={async () => {
                      const email = form.getValues("notificationEmail");
                      if (!email) return;
                      setTestingEmail(true);
                      setTestEmailResult(null);
                      try {
                        const r = await fetch("/api/test/email", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ to: email }),
                        });
                        const d = await r.json().catch(() => ({}));
                        setTestEmailResult(r.ok ? { ok: true, msg: "Email odeslán!" } : { ok: false, msg: d.error ?? "Chyba" });
                      } catch {
                        setTestEmailResult({ ok: false, msg: "Síťová chyba" });
                      } finally {
                        setTestingEmail(false);
                      }
                    }}
                  >
                    {testingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Test Email
                  </Button>
                  {testEmailResult && (
                    <span className={`text-sm ${testEmailResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                      {testEmailResult.ok ? <CheckCircle className="h-4 w-4 inline mr-1" /> : <XCircle className="h-4 w-4 inline mr-1" />}
                      {testEmailResult.msg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {saveError && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {saveError}
          </p>
        )}
        {saveOk && (
          <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> Nastavení uloženo
          </p>
        )}
        <Button type="submit" variant="navy" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Ukládám…
            </>
          ) : (
            "Uložit nastavení"
          )}
        </Button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

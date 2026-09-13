"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Settings = {
  timeZone?: string;
  language?: { locale?: string; displayName?: string };
  dateFormat?: string;
  timeFormat?: string;
  automaticRepliesSetting?: {
    status?: "disabled" | "alwaysEnabled" | "scheduled";
    externalAudience?: "none" | "contactsOnly" | "all";
    internalReplyMessage?: string;
    externalReplyMessage?: string;
    scheduledStartDateTime?: { dateTime: string; timeZone: string };
    scheduledEndDateTime?: { dateTime: string; timeZone: string };
  };
  workingHours?: { daysOfWeek?: string[]; startTime?: string; endTime?: string; timeZone?: { name?: string } };
};

export function MailboxSettingsAdmin({ connectionId }: { connectionId: string }) {
  const { notify } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ settings: Settings }>(`/mail/${connectionId}/settings`).then((data) => setSettings(data.settings)).catch((error) => notify({ title: "Settings unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }));
  }, [connectionId, notify]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const autoStatus = String(data.get("autoStatus"));
    const payload = {
      timeZone: data.get("timeZone"),
      language: { locale: data.get("locale"), displayName: data.get("locale") },
      dateFormat: data.get("dateFormat"),
      timeFormat: data.get("timeFormat"),
      automaticRepliesSetting: {
        status: autoStatus,
        externalAudience: data.get("externalAudience"),
        internalReplyMessage: data.get("internalReplyMessage"),
        externalReplyMessage: data.get("externalReplyMessage"),
        ...(autoStatus === "scheduled" ? {
          scheduledStartDateTime: { dateTime: data.get("scheduledStart"), timeZone: data.get("timeZone") },
          scheduledEndDateTime: { dateTime: data.get("scheduledEnd"), timeZone: data.get("timeZone") },
        } : {}),
      },
      workingHours: {
        daysOfWeek: data.getAll("workingDay"),
        startTime: data.get("workingStart"),
        endTime: data.get("workingEnd"),
        timeZone: { name: data.get("timeZone") },
      },
    };
    setBusy(true);
    try {
      const response = await api<{ settings: Settings }>(`/mail/${connectionId}/settings`, { method: "PATCH", body: JSON.stringify(payload) });
      setSettings(response.settings ?? payload as Settings);
      notify({ title: "Mailbox settings saved", tone: "success" });
    } catch (error) {
      notify({ title: "Settings were not saved", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally { setBusy(false); }
  }

  if (!settings) return <section className="panel panel-body"><Skeleton lines={8} /></section>;
  const auto = settings.automaticRepliesSetting ?? {};
  return <>
    <div className="page-header"><div><h1>Mailbox settings</h1><p className="muted">Preferences supported by Microsoft Graph for this mailbox</p></div><StatusBadge status="Microsoft managed" /></div>
    <form className="settings-layout" onSubmit={save}>
      <section className="panel"><header className="panel-header"><h2>Locale and time</h2></header><div className="panel-body stack"><label>Time zone<input name="timeZone" required defaultValue={settings.timeZone} placeholder="Pacific Standard Time" /></label><div className="grid"><label>Language / locale<input name="locale" required defaultValue={settings.language?.locale ?? "en-US"} /></label><label>Date format<input name="dateFormat" defaultValue={settings.dateFormat} placeholder="M/d/yyyy" /></label><label>Time format<input name="timeFormat" defaultValue={settings.timeFormat} placeholder="h:mm tt" /></label></div></div></section>
      <section className="panel"><header className="panel-header"><h2>Automatic replies</h2></header><div className="panel-body stack"><label>Status<select name="autoStatus" defaultValue={auto.status ?? "disabled"}><option value="disabled">Disabled</option><option value="alwaysEnabled">Always enabled</option><option value="scheduled">Scheduled</option></select></label><div className="grid"><label>Scheduled start<input type="datetime-local" name="scheduledStart" defaultValue={auto.scheduledStartDateTime?.dateTime?.slice(0, 16)} /></label><label>Scheduled end<input type="datetime-local" name="scheduledEnd" defaultValue={auto.scheduledEndDateTime?.dateTime?.slice(0, 16)} /></label></div><label>Internal reply<textarea name="internalReplyMessage" rows={4} defaultValue={stripHtml(auto.internalReplyMessage)} /></label><label>External audience<select name="externalAudience" defaultValue={auto.externalAudience ?? "none"}><option value="none">No external replies</option><option value="contactsOnly">Contacts only</option><option value="all">All external senders</option></select></label><label>External reply<textarea name="externalReplyMessage" rows={4} defaultValue={stripHtml(auto.externalReplyMessage)} /></label></div></section>
      <section className="panel"><header className="panel-header"><h2>Working hours</h2></header><div className="panel-body stack"><div className="row">{["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => <label className="check-row" key={day}><input type="checkbox" name="workingDay" value={day} defaultChecked={settings.workingHours?.daysOfWeek?.includes(day)} />{day.slice(0, 3).toUpperCase()}</label>)}</div><div className="grid"><label>Start<input type="time" name="workingStart" defaultValue={settings.workingHours?.startTime?.slice(0, 5) ?? "09:00"} /></label><label>End<input type="time" name="workingEnd" defaultValue={settings.workingHours?.endTime?.slice(0, 5) ?? "17:00"} /></label></div></div></section>
      <section className="panel"><div className="panel-body"><h2>Exchange-only settings</h2><p className="muted">Transport rules, mailbox delegation, retention, litigation hold and organization policy are not exposed here. They require separately authorized Exchange Online administration and RBAC.</p></div></section>
      <div className="row" style={{ justifyContent: "flex-end" }}><button disabled={busy}>{busy ? "Saving…" : "Save supported settings"}</button></div>
    </form>
  </>;
}

function stripHtml(value?: string) {
  return value?.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "") ?? "";
}

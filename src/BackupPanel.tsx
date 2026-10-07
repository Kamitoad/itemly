import { useState } from "react";
import { summarizeBackup, type NativeBackup } from "../shared/native-backup";
import { exportPhoneBackup, importPhoneBackup, selectPhoneBackup } from "./native/backup";

export default function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<NativeBackup | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const summary = pending ? summarizeBackup(pending) : null;

  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setNotice(null);
    try { await operation(); }
    catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "Die Sicherung konnte nicht verarbeitet werden." }); }
    finally { setBusy(false); }
  }

  return <details className="section-card backup-panel">
    <summary>Daten &amp; Sicherung</summary>
    <p>Alle gespeicherten Bons, Artikel, Bonbilder, Original-JSON und Änderungen sichern – einschließlich Entwürfen und Papierkorb. Noch nicht gespeicherte Eingaben sind nicht enthalten.</p>
    <p className="backup-privacy">Die Datei ist <strong>nicht verschlüsselt</strong> und enthält persönliche Daten. Speichere sie außerhalb der App, zum Beispiel in „Downloads“. Nur wenn du selbst einen Cloud-Speicher auswählst, wird sie dort abgelegt.</p>
    <div className="backup-buttons">
      <button className="button primary" disabled={busy || !!pending} onClick={() => void run(async () => {
        if (await exportPhoneBackup()) setNotice({ error: false, text: "Sicherung gespeichert und geprüft. Sie bleibt bei einer Deinstallation erhalten." });
      })}>Backup exportieren</button>
      <button className="button secondary" disabled={busy || !!pending} onClick={() => void run(async () => { setPending(await selectPhoneBackup()); })}>Backup importieren</button>
    </div>
    <p>Handy-Sicherungsformat Version 1 · maximal 100 MB. Bestehende Webserver-Backups sind ein anderes Format.</p>
    {busy && <p role="status">Sicherung wird verarbeitet … Bitte die App geöffnet lassen.</p>}
    {summary && <div className="backup-preview">
      <h3>Sicherung wiederherstellen?</h3>
      <p>{summary.receipts} Bons · {summary.items} Artikel · {summary.images} Bilder · {summary.trash} Bons im Papierkorb</p>
      <p>Erstellt: {new Date(summary.exportedAt).toLocaleString("de-DE")}</p>
      <p>Nur in eine leere Datenbank. Vorhandene Belege werden niemals überschrieben oder zusammengeführt.</p>
      <div className="backup-buttons">
        <button className="button primary" disabled={busy} onClick={() => void run(async () => {
          const result = await importPhoneBackup(pending!);
          setPending(null); onRestored();
          setNotice({ error: false, text: result.preferenceWarning ? "Belege und Bilder wiederhergestellt. Einstellungen konnten nicht vollständig übernommen werden." : "Belege, Bilder und Einstellungen wiederhergestellt. Ein importierter Farbmodus wird beim nächsten App-Start angewendet." });
        })}>Jetzt wiederherstellen</button>
        <button className="button secondary" disabled={busy} onClick={() => { setPending(null); setNotice(null); }}>Abbrechen</button>
      </div>
    </div>}
    {notice && <div className={`notice ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}><p>{notice.text}</p></div>}
  </details>;
}

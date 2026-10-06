import { useEffect, useState } from "react";
import * as store from "./store";
type Entry = {
  id: string;
  label: string;
  createdAt: string;
  undoneAt: string | null;
  notes: number;
  folders: number;
  warnings: string[];
};
export function Imports({
  onError,
  onNotice,
}: {
  onError: (s: string) => void;
  onNotice: (s: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const r = await store.accountFetch("/api/imports");
      if (!r.ok) throw new Error("Importgeschiedenis kon niet worden geladen.");
      setEntries((await r.json()).imports);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function undo(entry: Entry) {
    setBusy(true);
    try {
      await store.sync();
      if (store.snapshot.pending.length || store.snapshot.conflicts.length)
        throw new Error(
          "Synchroniseer eerst je lokale wijzigingen en los verschillen op.",
        );
      const r = await store.accountFetch(`/api/imports/${entry.id}/undo`);
      if (!r.ok) throw new Error("Import kon niet worden gecontroleerd.");
      const p = await r.json();
      if (
        !confirm(
          `${entry.label} terugdraaien?\n${p.removableNotes} geïmporteerde notities worden verwijderd. ${p.preservedNotes} gewijzigde notities blijven bewaard.\nJe andere notities, taken en Apple Notities blijven behouden.`,
        )
      )
        return;
      const result = await store.accountFetch(`/api/imports/${entry.id}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeChanged: false }),
      });
      if (!result.ok) throw new Error((await result.json()).error);
      const status = await result.json();
      await store.sync();
      await load();
      onNotice(
        `Import teruggedraaid${status.preservedNotes ? `; ${status.preservedNotes} gewijzigde notities bewaard` : ""}.`,
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="import-history">
      <h3>Imports</h3>
      <p>
        Terugdraaien verwijdert alleen deze import. Notities die je daarna zelf
        hebt gewijzigd blijven bewaard.
      </p>
      {!entries.length ? (
        <small>Nog geen imports.</small>
      ) : (
        entries.map((e) => (
          <div className="import-entry" key={e.id}>
            <strong>{e.label}</strong>
            <small>
              {e.notes} notities · {e.folders} mappen ·{" "}
              {new Date(e.createdAt).toLocaleDateString("nl-NL")}
            </small>
            {e.warnings.length > 0 && (
              <details>
                <summary>Aandachtspunten ({e.warnings.length})</summary>
                <ul>
                  {e.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            {e.undoneAt ? (
              <small>
                Teruggedraaid op{" "}
                {new Date(e.undoneAt).toLocaleDateString("nl-NL")}
              </small>
            ) : (
              <button
                disabled={busy}
                className="settings-action"
                onClick={() => void undo(e)}
              >
                Import terugdraaien
              </button>
            )}
          </div>
        ))
      )}
    </section>
  );
}

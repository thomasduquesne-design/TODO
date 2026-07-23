"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Stream = {
  id: number;
  title: string;
  owner: string;
  dueDate: string;
  progress: number;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  title: string;
  owner: string;
  dueDate: string;
  progress: number;
  prompt: string;
};

const emptyDraft: Draft = {
  title: "",
  owner: "",
  dueDate: "",
  progress: 0,
  prompt: "",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function isOverdue(stream: Stream) {
  return stream.progress < 100 && stream.dueDate < localDateKey();
}

function dayDifference(date: string) {
  const start = new Date(`${date}T12:00:00`);
  const today = new Date(`${localDateKey()}T12:00:00`);
  return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000));
}

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00`));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function buildPrompt(stream: Stream) {
  const specificPrompt =
    stream.prompt ||
    "Aide-moi à identifier les prochaines actions concrètes et à structurer un plan d’exécution.";

  return [
    `Je travaille sur le workstream « ${stream.title} ».`,
    `Owner : ${stream.owner}.`,
    `Échéance : ${formatDate(stream.dueDate)}.`,
    `Avancement actuel : ${stream.progress} %.`,
    "",
    specificPrompt,
    "",
    "Commence par me poser uniquement les questions indispensables, puis propose les trois prochaines actions prioritaires.",
  ].join("\n");
}

export default function Home() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Stream | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    void loadStreams();
  }, []);

  async function loadStreams() {
    try {
      setLoading(true);
      const response = await fetch("/api/streams", { cache: "no-store" });
      const data = (await response.json()) as { streams?: Stream[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Chargement impossible.");
      setStreams(data.streams ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  const overdue = useMemo(
    () =>
      streams
        .filter(isOverdue)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [streams],
  );

  const visibleStreams = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return [...streams]
      .filter((stream) => {
        if (filter === "active" && stream.progress === 100) return false;
        if (filter === "done" && stream.progress < 100) return false;
        if (!normalizedQuery) return true;
        return `${stream.title} ${stream.owner}`
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        const overdueDelta = Number(isOverdue(b)) - Number(isOverdue(a));
        if (overdueDelta) return overdueDelta;
        const completeDelta = Number(a.progress === 100) - Number(b.progress === 100);
        if (completeDelta) return completeDelta;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [filter, query, streams]);

  const activeCount = streams.filter((stream) => stream.progress < 100).length;
  const completedCount = streams.length - activeCount;
  const averageProgress = streams.length
    ? Math.round(streams.reduce((sum, stream) => sum + stream.progress, 0) / streams.length)
    : 0;

  function openCreate() {
    setEditing(null);
    setDraft({
      ...emptyDraft,
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    });
    setError("");
    setModalOpen(true);
  }

  function openEdit(stream: Stream) {
    setEditing(stream);
    setDraft({
      title: stream.title,
      owner: stream.owner,
      dueDate: stream.dueDate,
      progress: stream.progress,
      prompt: stream.prompt,
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/streams", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...draft } : draft),
      });
      const data = (await response.json()) as { stream?: Stream; error?: string };
      if (!response.ok || !data.stream) {
        throw new Error(data.error || "Enregistrement impossible.");
      }

      setStreams((current) =>
        editing
          ? current.map((stream) => (stream.id === editing.id ? data.stream! : stream))
          : [...current, data.stream!],
      );
      closeModal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStream() {
    if (!editing || !window.confirm(`Supprimer « ${editing.title} » ?`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/streams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Suppression impossible.");
      setStreams((current) => current.filter((stream) => stream.id !== editing.id));
      closeModal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function openChatGPT(stream: Stream) {
    const prompt = buildPrompt(stream);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(stream.id);
      window.setTimeout(() => setCopiedId(null), 2200);
    } catch {
      // The deep link still carries the prompt if clipboard access is blocked.
    }
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Streamline, accueil">
          <span className="brand-mark">S</span>
          <span>Streamline</span>
        </a>
        <div className="header-actions">
          <span className="sync-state"><i /> Données synchronisées</span>
          <button className="primary-button" onClick={openCreate}>
            <span aria-hidden="true">＋</span> Nouveau stream
          </button>
        </div>
      </header>

      <div className="workspace">
        <section className="intro">
          <div>
            <p className="eyebrow">WORKSTREAM COMMAND CENTER</p>
            <h1>Ce qui avance.<br />Ce qui bloque.</h1>
            <p className="intro-copy">
              Une vue unique pour maintenir les priorités, les responsables et les échéances alignés.
            </p>
          </div>
          <div className="score-card">
            <span>Avancement global</span>
            <strong>{averageProgress}<small>%</small></strong>
            <div className="score-track"><i style={{ width: `${averageProgress}%` }} /></div>
            <p>{completedCount} stream{completedCount > 1 ? "s" : ""} terminé{completedCount > 1 ? "s" : ""} sur {streams.length}</p>
          </div>
        </section>

        <section className="metrics" aria-label="Indicateurs">
          <article>
            <span className="metric-label"><i className="metric-dot danger" /> En retard</span>
            <strong>{overdue.length.toString().padStart(2, "0")}</strong>
            <small>à traiter en priorité</small>
          </article>
          <article>
            <span className="metric-label"><i className="metric-dot active" /> En cours</span>
            <strong>{activeCount.toString().padStart(2, "0")}</strong>
            <small>streams actifs</small>
          </article>
          <article>
            <span className="metric-label"><i className="metric-dot done" /> Terminés</span>
            <strong>{completedCount.toString().padStart(2, "0")}</strong>
            <small>livrables finalisés</small>
          </article>
        </section>

        {overdue.length > 0 && (
          <section className="overdue-section">
            <div className="section-heading">
              <div>
                <span className="alert-kicker">ATTENTION REQUISE</span>
                <h2>Streams en retard</h2>
              </div>
              <span className="rail-hint">Défiler horizontalement →</span>
            </div>
            <div className="overdue-rail">
              {overdue.map((stream) => (
                <article className="overdue-card" key={stream.id}>
                  <div className="overdue-card-top">
                    <span>J+{dayDifference(stream.dueDate)}</span>
                    <button onClick={() => openEdit(stream)} aria-label={`Modifier ${stream.title}`}>•••</button>
                  </div>
                  <h3>{stream.title}</h3>
                  <div className="owner-line">
                    <span className="avatar">{initials(stream.owner)}</span>
                    <span>{stream.owner}</span>
                    <time>{formatDate(stream.dueDate)}</time>
                  </div>
                  <div className="mini-progress">
                    <i style={{ width: `${stream.progress}%` }} />
                  </div>
                  <div className="overdue-card-bottom">
                    <strong>{stream.progress}%</strong>
                    <button onClick={() => void openChatGPT(stream)}>
                      {copiedId === stream.id ? "Prompt copié" : "Avancer avec ChatGPT"} <span>↗</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="streams-section">
          <div className="list-toolbar">
            <div>
              <p className="eyebrow">PORTFOLIO</p>
              <h2>Tous les streams <span>{streams.length}</span></h2>
            </div>
            <div className="toolbar-controls">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher un stream ou un owner"
                  aria-label="Rechercher"
                />
              </label>
              <div className="filter-tabs" aria-label="Filtrer les streams">
                {([
                  ["all", "Tous"],
                  ["active", "Actifs"],
                  ["done", "Terminés"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    className={filter === value ? "active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && !modalOpen && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => void loadStreams()}>Réessayer</button>
            </div>
          )}

          <div className="stream-table">
            <div className="table-head">
              <span>Stream</span>
              <span>Owner</span>
              <span>Échéance</span>
              <span>Avancement</span>
              <span />
            </div>
            {loading ? (
              <div className="empty-state"><span className="loader" />Chargement du portfolio…</div>
            ) : visibleStreams.length === 0 ? (
              <div className="empty-state">
                <strong>{streams.length ? "Aucun résultat" : "Votre portfolio est vide"}</strong>
                <p>{streams.length ? "Essayez un autre filtre." : "Créez votre premier stream pour lancer le suivi."}</p>
                {!streams.length && <button className="primary-button" onClick={openCreate}>Créer un stream</button>}
              </div>
            ) : (
              visibleStreams.map((stream) => {
                const late = isOverdue(stream);
                return (
                  <article className={`stream-row ${late ? "is-late" : ""}`} key={stream.id}>
                    <button className="stream-title" onClick={() => openEdit(stream)}>
                      <i className={stream.progress === 100 ? "completed" : ""}>
                        {stream.progress === 100 ? "✓" : ""}
                      </i>
                      <span>
                        <strong>{stream.title}</strong>
                        <small>{stream.progress === 100 ? "Terminé" : late ? `En retard de ${dayDifference(stream.dueDate)} j` : "En cours"}</small>
                      </span>
                    </button>
                    <div className="owner-cell">
                      <span className="avatar">{initials(stream.owner)}</span>
                      <span>{stream.owner}</span>
                    </div>
                    <time className={late ? "late-date" : ""}>{formatDate(stream.dueDate)}</time>
                    <div className="progress-cell">
                      <div className="progress-line"><i style={{ width: `${stream.progress}%` }} /></div>
                      <strong>{stream.progress}%</strong>
                    </div>
                    <div className="row-actions">
                      <button className="chatgpt-button" onClick={() => void openChatGPT(stream)}>
                        <span className="chatgpt-spark">✦</span>
                        {copiedId === stream.id ? "Copié" : "ChatGPT"}
                        <span>↗</span>
                      </button>
                      <button className="more-button" onClick={() => openEdit(stream)} aria-label={`Modifier ${stream.title}`}>•••</button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => !saving && closeModal()}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{editing ? "MISE À JOUR" : "NOUVEAU WORKSTREAM"}</p>
                <h2 id="modal-title">{editing ? "Modifier le stream" : "Créer un stream"}</h2>
              </div>
              <button onClick={closeModal} aria-label="Fermer">×</button>
            </div>
            <form onSubmit={submit}>
              <label>
                <span>Nom du stream</span>
                <input
                  autoFocus
                  required
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Ex. Finaliser le business plan"
                />
              </label>
              <div className="form-grid">
                <label>
                  <span>Owner</span>
                  <input
                    required
                    value={draft.owner}
                    onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
                    placeholder="Nom et prénom"
                  />
                </label>
                <label>
                  <span>Date limite</span>
                  <input
                    required
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                  />
                </label>
              </div>
              <label>
                <span>Avancement <strong>{draft.progress}%</strong></span>
                <input
                  className="range"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={draft.progress}
                  style={{ "--range-value": `${draft.progress}%` } as React.CSSProperties}
                  onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Prompt de travail pour ChatGPT</span>
                <textarea
                  rows={4}
                  value={draft.prompt}
                  onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                  placeholder="Ex. Analyse les blocages, challenge mes hypothèses et transforme-les en plan d’action…"
                />
                <small>Le contexte du stream, l’owner, l’échéance et l’avancement seront ajoutés automatiquement.</small>
              </label>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-footer">
                {editing ? (
                  <button className="delete-button" type="button" onClick={() => void deleteStream()} disabled={saving}>Supprimer</button>
                ) : <span />}
                <div>
                  <button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>Annuler</button>
                  <button className="primary-button" type="submit" disabled={saving}>{saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le stream"}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

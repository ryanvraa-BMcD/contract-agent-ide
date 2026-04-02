"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, RotateCcw, Save, Loader2 } from "lucide-react";
import type { ProjectStyleSettings } from "@/src/types/style-settings";
import { DEFAULT_STYLE_SETTINGS } from "@/src/types/style-settings";

type DocumentEntry = {
  id: string;
  title: string;
  originalMimeType: string;
};

type FormatSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  documents: DocumentEntry[];
  initialSettings: ProjectStyleSettings;
  onSaved: () => void;
};

const FONT_OPTIONS = [
  "Calibri",
  "Arial",
  "Times New Roman",
  "Garamond",
  "Georgia",
  "Cambria",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New",
];

const FONT_SIZE_OPTIONS = [
  "8pt", "9pt", "10pt", "10.5pt", "11pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt",
];

export function FormatSettingsDialog({
  open,
  onClose,
  projectId,
  documents,
  initialSettings,
  onSaved,
}: FormatSettingsDialogProps) {
  const [settings, setSettings] = useState<ProjectStyleSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSettings(initialSettings);
  }, [open, initialSettings]);

  const docxDocuments = documents.filter(
    (d) =>
      d.originalMimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  const handleExtract = useCallback(
    async (documentId: string) => {
      setExtracting(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/style-settings/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Extraction failed.");
        }
        const data = (await res.json()) as { styleSettings: ProjectStyleSettings };
        setSettings(data.styleSettings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed.");
      } finally {
        setExtracting(false);
      }
    },
    [projectId],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/style-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleSettings: settings }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [projectId, settings, onSaved, onClose]);

  const handleReset = () => {
    setSettings({ ...DEFAULT_STYLE_SETTINGS });
  };

  const updateHeading = (
    key: keyof ProjectStyleSettings["headings"],
    field: "fontSize" | "bold",
    value: string | boolean,
  ) => {
    setSettings((prev) => ({
      ...prev,
      headings: {
        ...prev.headings,
        [key]: { ...prev.headings[key], [field]: value },
      },
    }));
  };

  const updateMargin = (side: "top" | "right" | "bottom" | "left", value: number) => {
    setSettings((prev) => ({
      ...prev,
      pageMargins: { ...prev.pageMargins, [side]: value },
    }));
  };

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Format Settings"
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">Format Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
          {/* Import from Document */}
          {docxDocuments.length > 0 && (
            <Section title="Import from Document">
              <div className="flex items-center gap-2">
                <select
                  id="extract-doc"
                  disabled={extracting}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleExtract(e.target.value);
                    e.target.value = "";
                  }}
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="" disabled>
                    Select a document to import styles from...
                  </option>
                  {docxDocuments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
                {extracting && <Loader2 size={14} className="animate-spin text-primary" />}
              </div>
            </Section>
          )}

          {/* Font */}
          <Section title="Font">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Family">
                <select
                  value={settings.fontFamily}
                  onChange={(e) => setSettings((s) => ({ ...s, fontFamily: e.target.value }))}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Size">
                <select
                  value={settings.fontSize}
                  onChange={(e) => setSettings((s) => ({ ...s, fontSize: e.target.value }))}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {FONT_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Line Height">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="3"
                  value={settings.lineHeight}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, lineHeight: parseFloat(e.target.value) || 1.5 }))
                  }
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                />
              </Field>
            </div>
          </Section>

          {/* Paragraph */}
          <Section title="Paragraph">
            <Field label="Spacing After (pt)">
              <input
                type="number"
                min="0"
                max="72"
                value={settings.paragraphSpacingAfter}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    paragraphSpacingAfter: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              />
            </Field>
          </Section>

          {/* Headings */}
          <Section title="Headings">
            <div className="space-y-2">
              {(["h1", "h2", "h3", "h4", "h5"] as const).map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-8 text-xs font-medium uppercase text-muted-foreground">
                    {key}
                  </span>
                  <select
                    value={settings.headings[key].fontSize}
                    onChange={(e) => updateHeading(key, "fontSize", e.target.value)}
                    className="h-7 w-24 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  >
                    {FONT_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={settings.headings[key].bold}
                      onChange={(e) => updateHeading(key, "bold", e.target.checked)}
                      className="rounded border-input"
                    />
                    Bold
                  </label>
                </div>
              ))}
            </div>
          </Section>

          {/* Page Margins */}
          <Section title="Page Margins (px)">
            <div className="grid grid-cols-4 gap-3">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <Field key={side} label={side.charAt(0).toUpperCase() + side.slice(1)}>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={settings.pageMargins[side]}
                    onChange={(e) => updateMargin(side, parseInt(e.target.value, 10) || 0)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  />
                </Field>
              ))}
            </div>
          </Section>

          {error && (
            <p className="text-xs font-medium text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw size={13} />
            Reset to Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

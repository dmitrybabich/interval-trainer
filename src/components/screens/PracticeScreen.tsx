import { ArrowLeft, Circle, FileMusic, ListMusic, Music, Pause, Pencil, Play, Plus, Square, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { FretboardRoll } from "@/components/FretboardRoll";
import { MicGate } from "@/components/MicGate";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { WarmupRoll } from "@/components/WarmupRoll";
import { useMidiSongs } from "@/hooks/useMidiSongs";
import { usePracticeTakes, usePracticeTracks } from "@/hooks/usePractice";
import { usePracticePlayer } from "@/hooks/usePracticePlayer";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme } from "@/hooks/useTheme";
import { EXERCISES } from "@/lib/exercises";
import { assignFingering } from "@/lib/fretboard";
import type { PracticeTake } from "@/lib/practice";
import { type MidiTrackChoice, type ResolvedItem, resolveItem } from "@/lib/practiceItems";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

interface LibItem {
  id: string;
  name: string;
  scored: boolean;
  removable: boolean;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------- library ----------------

function ItemRow({
  item,
  onOpen,
  onRemove,
  onRename,
}: {
  item: LibItem;
  onOpen: () => void;
  onRemove?: () => void;
  onRename?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {item.scored ? <Target className="size-4 shrink-0 text-primary" /> : <Music className="size-4 shrink-0 text-primary" />}
        <span className="truncate text-sm font-medium">{item.name}</span>
      </button>
      {onRename && (
        <Button variant="ghost" size="icon" onClick={onRename} className="size-8 text-muted-foreground" title={t("practice.rename")}>
          <Pencil className="size-4" />
        </Button>
      )}
      {onRemove && (
        <Button variant="ghost" size="icon" onClick={onRemove} className="size-8 text-muted-foreground">
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function isMidiFile(file: File): boolean {
  return /\.midi?$/i.test(file.name) || file.type === "audio/midi";
}

// One upload for everything, routed by file type: a MIDI is imported whole (scored,
// tracks picked later in the player), any audio or video is added as-is (record-only).
// Accepts a click or a drag-and-drop. The tabs only split the list.
function AddItem({ onAddAudio, onAddMidi }: { onAddAudio: (file: File) => void; onAddMidi: (file: File) => void }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  const pick = (file: File | null) => {
    if (!file) return;
    if (isMidiFile(file)) onAddMidi(file);
    else onAddAudio(file);
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm font-medium text-muted-foreground",
        dragging ? "border-primary bg-accent" : "border-border hover:bg-accent",
      )}
    >
      <Plus className="size-4" />
      {t("practice.add")}
      <input
        type="file"
        accept=".mid,.midi,audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function PracticeLibrary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tracks = usePracticeTracks();
  const midi = useMidiSongs();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "free" ? "free" : "guided";

  const items: LibItem[] = useMemo(() => {
    const exercises = EXERCISES.map((ex) => ({ id: `e:${ex.id}`, name: t(ex.nameKey), scored: true, removable: false }));
    const midiItems = midi.songs.map((s) => ({ id: s.id, name: s.name, scored: true, removable: true }));
    const trackItems = tracks.tracks.map((tr) => ({ id: tr.id, name: tr.name, scored: false, removable: true }));
    return [...exercises, ...midiItems, ...trackItems];
  }, [t, midi.songs, tracks.tracks]);

  const shown = items.filter((it) => (tab === "guided" ? it.scored : !it.scored));

  return (
    <div className="mx-auto flex size-full max-w-none flex-col gap-4">
      <AddItem
        onAddAudio={(file) => void tracks.add(file).then((id) => id && navigate(`/practice/${id}`))}
        onAddMidi={(file) => void midi.add(file.name.replace(/\.midi?$/i, ""), file).then((id) => id && navigate(`/practice/${id}`))}
      />

      <div className="flex flex-col gap-2">
        {shown.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            onOpen={() => navigate(`/practice/${it.id}`)}
            onRemove={
              it.removable
                ? () => void (it.scored ? midi.remove(it.id) : tracks.remove(it.id))
                : undefined
            }
            onRename={
              it.removable
                ? () => {
                    const name = window.prompt(t("practice.rename"), it.name)?.trim();
                    if (name) void (it.scored ? midi.rename(it.id, name) : tracks.rename(it.id, name));
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

// ---------------- player ----------------

function TakeRow({ take, url, onDelete }: { take: PracticeTake; url: string; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{fmtDate(take.createdAt)}</span>
      <audio src={url} controls className="h-8 min-w-0 flex-1" />
      <Button variant="ghost" size="icon" onClick={onDelete} className="size-7 text-muted-foreground">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// Persisted MIDI track selection: a checkbox per track for what sounds, and a single
// Score toggle for the track judged/shown as the melody (click again to score none).
function TracksPanel({ choice, onChange }: { choice: MidiTrackChoice; onChange: (playTracks: number[], melodyTrack: number | null) => void }) {
  const { t } = useTranslation();
  const play = new Set(choice.playTracks);
  const togglePlay = (index: number) => {
    const next = new Set(play);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onChange([...next].toSorted((a, b) => a - b), choice.melodyTrack);
  };
  const toggleMelody = (index: number) => onChange([...choice.playTracks], choice.melodyTrack === index ? null : index);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-card p-2">
      <div className="px-1 pb-1 text-xs font-semibold text-muted-foreground">{t("practice.tracksPanel")}</div>
      {choice.tracks.map((tr) => (
        <div key={tr.index} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-accent">
          <input
            type="checkbox"
            checked={play.has(tr.index)}
            onChange={() => togglePlay(tr.index)}
            className="accent-primary"
            title={t("practice.playTrack")}
          />
          <button
            type="button"
            onClick={() => toggleMelody(tr.index)}
            title={t("practice.scoreTrack")}
            className={cn("shrink-0", choice.melodyTrack === tr.index ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground")}
          >
            <Target className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate">
            {tr.label} · {tr.noteCount}
          </span>
        </div>
      ))}
    </aside>
  );
}

export function PracticeItemPlayer() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const { itemId = "" } = useParams();
  const [item, setItem] = useState<ResolvedItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void resolveItem(itemId).then((resolved) => {
      if (!cancelled) setItem(resolved);
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, reloadKey]);

  const midiSongs = useMidiSongs();
  const takes = usePracticeTakes(itemId);
  const [panel, setPanel] = useState<"none" | "takes" | "tracks">("none");
  const [view, setView] = useState<"bars" | "fretboard">("bars");

  const setSelection = (playTracks: number[], melodyTrack: number | null) =>
    void midiSongs.setSelection(itemId, playTracks, melodyTrack).then(() => setReloadKey((prev) => prev + 1));
  const fingering = useMemo(() => (item?.refNotes ? assignFingering(item.refNotes) : []), [item]);
  const player = usePracticePlayer(
    item,
    Number(prefs.tol),
    prefs.anyOctave === "on",
    (blob, durationS) => void takes.add(blob, durationS, `Take ${takes.takes.length + 1}`),
  );

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  useEffect(() => {
    if (item?.backing.kind !== "media") {
      setMediaUrl(null);
      return;
    }
    if (item.backing.url) {
      setMediaUrl(item.backing.url);
      return;
    }
    if (!item.backing.blob) return;
    const url = URL.createObjectURL(item.backing.blob);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item]);

  const takeUrls = useMemo(() => new Map(takes.takes.map((tk) => [tk.id, URL.createObjectURL(tk.audio)])), [takes.takes]);
  useEffect(() => () => takeUrls.forEach((objUrl) => URL.revokeObjectURL(objUrl)), [takeUrls]);

  const isVideo = item?.backing.kind === "media" && item.backing.mediaType === "video";
  const scored = item?.reference != null;
  const hasFretboard = (item?.refNotes?.length ?? 0) > 0;
  const showFretboard = hasFretboard && view === "fretboard";
  const { inTunePct, biasCents, frames } = player.ui.score;
  const bias = Math.round(biasCents);

  return (
    <div className="mx-auto flex size-full max-w-none flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/practice")} className="text-muted-foreground">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{item?.name ?? "…"}</div>
        {hasFretboard && (
          <Segmented
            value={view}
            options={[
              { value: "bars", label: t("practice.viewBars") },
              { value: "fretboard", label: t("practice.viewFretboard") },
            ]}
            onValueChange={setView}
          />
        )}
        {scored && (
          <div className="flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
            <Target className="size-4" />
            {frames === 0
              ? t("songs.scorePending")
              : t("songs.inTune", { pct: Math.round(inTunePct * 100), bias: bias > 0 ? `+${bias}¢` : `${bias}¢` })}
          </div>
        )}
        {item?.midi && (
          <Button
            variant={panel === "tracks" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setPanel((p) => (p === "tracks" ? "none" : "tracks"))}
            className="text-muted-foreground"
            title={t("practice.tracksPanel")}
          >
            <FileMusic className="size-5" />
          </Button>
        )}
        <Button
          variant={panel === "takes" ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setPanel((p) => (p === "takes" ? "none" : "takes"))}
          className="relative text-muted-foreground"
          title={t("practice.takesPanel")}
        >
          <ListMusic className="size-5" />
          {takes.takes.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {takes.takes.length}
            </span>
          )}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="min-h-0 min-w-0 flex-1">
          <MicGate ready={player.ui.ready} onStart={() => void player.start(() => undefined)}>
            {/* Media element: visible for video, hidden (audio only) otherwise. */}
            {item?.backing.kind === "media" &&
              (isVideo ? (
                <div className="mb-2 grid max-h-[45vh] place-items-center overflow-hidden rounded-2xl bg-black/90">
                  <video ref={player.mediaRef as React.RefObject<HTMLVideoElement>} src={mediaUrl ?? undefined} className="max-h-[45vh] max-w-full" playsInline />
                </div>
              ) : (
                <audio ref={player.mediaRef as React.RefObject<HTMLAudioElement>} src={mediaUrl ?? undefined} />
              ))}
            <div className={cn(isVideo ? "h-40" : "h-full")}>
              {showFretboard ? (
                <FretboardRoll notes={fingering} theme={theme} currentTimeRef={player.currentTimeRef} onFrame={player.onFrame} />
              ) : (
                <WarmupRoll
                  notes={item?.refNotes ?? []}
                  loMidi={item?.loMidi ?? 48}
                  hiMidi={item?.hiMidi ?? 72}
                  tolCents={Number(prefs.tol)}
                  theme={theme}
                  trailRef={player.trailRef}
                  currentTimeRef={player.currentTimeRef}
                  onFrame={player.onFrame}
                  anyOctave={prefs.anyOctave === "on"}
                />
              )}
            </div>
          </MicGate>
        </div>

        {panel === "tracks" && item?.midi && (
          <TracksPanel choice={item.midi} onChange={setSelection} />
        )}

        {panel === "takes" && (
          <aside className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-card p-2">
            <div className="px-1 pb-1 text-xs font-semibold text-muted-foreground">{t("practice.takesPanel")}</div>
            {takes.takes.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">{t("practice.noTakes")}</p>
            ) : (
              takes.takes.map((tk) => (
                <TakeRow key={tk.id} take={tk} url={takeUrls.get(tk.id) ?? ""} onDelete={() => void takes.remove(tk.id)} />
              ))
            )}
          </aside>
        )}
      </div>

      <div className="flex items-center gap-3 px-1">
        <Button variant="ghost" size="icon" onClick={player.ui.playing ? player.pause : player.play} className="text-primary" title={t("practice.playPause")}>
          {player.ui.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={player.toggleRecord}
          className={cn(player.ui.recording ? "text-destructive" : "text-muted-foreground")}
          title={t("practice.record")}
        >
          {player.ui.recording ? <Square className="size-5 fill-current" /> : <Circle className="size-5 fill-current" />}
        </Button>
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmt(player.ui.currentTime)}</span>
        <input
          type="range"
          min={0}
          max={player.ui.duration || 0}
          step={0.1}
          value={player.ui.currentTime}
          onChange={(e) => player.seek(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-10 text-xs tabular-nums text-muted-foreground">{fmt(player.ui.duration)}</span>
        <select
          value={player.rate}
          onChange={(e) => player.setRate(Number(e.target.value))}
          title={t("practice.speed")}
          className="rounded-md border border-border bg-background px-1.5 py-1 text-xs tabular-nums text-muted-foreground"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

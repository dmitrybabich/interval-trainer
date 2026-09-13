import { ArrowLeft, Circle, FileMusic, ListMusic, Music, Pause, Pencil, Play, Plus, Square, Target, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { MicGate } from "@/components/MicGate";
import { Button } from "@/components/ui/button";
import { WarmupRoll } from "@/components/WarmupRoll";
import { useMidiSongs } from "@/hooks/useMidiSongs";
import { usePracticeTakes, usePracticeTracks } from "@/hooks/usePractice";
import { usePracticePlayer } from "@/hooks/usePracticePlayer";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme } from "@/hooks/useTheme";
import { EXERCISES } from "@/lib/exercises";
import { type MidiTrackInfo,parseMidiTracks } from "@/lib/midiSong";
import type { PracticeTake } from "@/lib/practice";
import { type ResolvedItem, resolveItem } from "@/lib/practiceItems";
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

interface PendingMidi {
  file: File;
  tracks: readonly MidiTrackInfo[];
  trackIndex: number | null;
  name: string;
}

function isMidiFile(file: File): boolean {
  return /\.midi?$/i.test(file.name) || file.type === "audio/midi";
}

// One upload for everything: a MIDI drops into the track picker (guided/scored), any
// audio or video is added straight away (free/record-only). The tabs only split the
// list — there's a single add flow, routed by file type.
function AddItem({
  onAddAudio,
  onAddMidi,
}: {
  onAddAudio: (file: File) => void;
  onAddMidi: (name: string, file: File, trackIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingMidi | null>(null);

  const pick = async (file: File | null) => {
    if (!file) return;
    if (!isMidiFile(file)) {
      onAddAudio(file);
      return;
    }
    try {
      const parsed = parseMidiTracks(await file.arrayBuffer());
      setPending({ file, tracks: parsed.tracks, trackIndex: parsed.tracks[0]?.index ?? null, name: file.name.replace(/\.midi?$/i, "") });
    } catch {
      setPending(null);
    }
  };

  const submit = () => {
    if (pending?.trackIndex == null) return;
    onAddMidi(pending.name, pending.file, pending.trackIndex);
    setPending(null);
  };

  if (pending) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileMusic className="size-4" />
          {t("practice.chooseTrack")}
          <button type="button" onClick={() => setPending(null)} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {pending.tracks.map((tr) => (
            <label key={tr.index} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="miditrack"
                checked={pending.trackIndex === tr.index}
                onChange={() => setPending((cur) => (cur ? { ...cur, trackIndex: tr.index } : cur))}
                className="accent-primary"
              />
              <span className="truncate">
                {tr.label} · {tr.noteCount} notes
              </span>
            </label>
          ))}
        </div>
        <input
          type="text"
          value={pending.name}
          onChange={(e) => setPending((cur) => (cur ? { ...cur, name: e.target.value } : cur))}
          placeholder={t("practice.namePlaceholder")}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <Button onClick={submit} className="self-start">
          {t("practice.addButton")}
        </Button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-medium text-muted-foreground hover:bg-accent">
      <Plus className="size-4" />
      {t("practice.add")}
      <input
        type="file"
        accept=".mid,.midi,audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0] ?? null);
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
        onAddMidi={(name, file, track) => void midi.add(name, file, track).then((id) => id && navigate(`/practice/${id}`))}
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

export function PracticeItemPlayer() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const { itemId = "" } = useParams();
  const [item, setItem] = useState<ResolvedItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveItem(itemId).then((resolved) => {
      if (!cancelled) setItem(resolved);
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const takes = usePracticeTakes(itemId);
  const [takesOpen, setTakesOpen] = useState(false);
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
  const { inTunePct, biasCents, frames } = player.ui.score;
  const bias = Math.round(biasCents);

  return (
    <div className="mx-auto flex size-full max-w-none flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/practice")} className="text-muted-foreground">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{item?.name ?? "…"}</div>
        {scored && (
          <div className="flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
            <Target className="size-4" />
            {frames === 0
              ? t("songs.scorePending")
              : t("songs.inTune", { pct: Math.round(inTunePct * 100), bias: bias > 0 ? `+${bias}¢` : `${bias}¢` })}
          </div>
        )}
        <Button
          variant={takesOpen ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setTakesOpen((o) => !o)}
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
            </div>
          </MicGate>
        </div>

        {takesOpen && (
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

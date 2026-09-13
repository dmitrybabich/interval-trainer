import { ArrowLeft, Circle, FileMusic, Music, Pause, Play, Plus, Square, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

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
import { type MidiTrackInfo,parseMidiTracks } from "@/lib/midiSong";
import type { PracticeTake } from "@/lib/practice";
import { type ResolvedItem, resolveItem } from "@/lib/practiceItems";
import { cn } from "@/lib/utils";
import { WARMUP_TRACKS } from "@/lib/warmupTracks";

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

function ItemRow({ item, onOpen, onRemove }: { item: LibItem; onOpen: () => void; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {item.scored ? <Target className="size-4 shrink-0 text-primary" /> : <Music className="size-4 shrink-0 text-primary" />}
        <span className="truncate text-sm font-medium">{item.name}</span>
      </button>
      {onRemove && (
        <Button variant="ghost" size="icon" onClick={onRemove} className="size-8 text-muted-foreground">
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function AddAudioButton({ onAdd }: { onAdd: (file: File) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-medium text-muted-foreground hover:bg-accent">
      <Plus className="size-4" />
      {t("practice.addTrack")}
      <input
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAdd(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function AddMidiForm({ onAdd }: { onAdd: (name: string, file: File, trackIndex: number) => void }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [tracks, setTracks] = useState<readonly MidiTrackInfo[]>([]);
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const [name, setName] = useState("");

  const pick = async (picked: File | null) => {
    setFile(picked);
    setTracks([]);
    setTrackIndex(null);
    if (!picked) return;
    try {
      const parsed = parseMidiTracks(await picked.arrayBuffer());
      setTracks(parsed.tracks);
      setTrackIndex(parsed.tracks[0]?.index ?? null);
      setName((cur) => cur || picked.name.replace(/\.midi?$/i, ""));
    } catch {
      setTracks([]);
    }
  };

  const submit = () => {
    if (!file || trackIndex === null) return;
    onAdd(name, file, trackIndex);
    setFile(null);
    setTracks([]);
    setTrackIndex(null);
    setName("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileMusic className="size-4" />
        {t("practice.addMidiTitle")}
      </div>
      <label className="flex cursor-pointer flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("practice.midiFileLabel")}</span>
        <input
          type="file"
          accept=".mid,.midi,audio/midi"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
        />
      </label>
      {tracks.length > 0 && (
        <>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {tracks.map((tr) => (
              <label key={tr.index} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="miditrack"
                  checked={trackIndex === tr.index}
                  onChange={() => setTrackIndex(tr.index)}
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("practice.namePlaceholder")}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <Button onClick={submit} className="self-start">
            {t("practice.addMidiButton")}
          </Button>
        </>
      )}
    </div>
  );
}

export function PracticeLibrary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tracks = usePracticeTracks();
  const midi = useMidiSongs();
  const [tab, setTab] = useState<"guided" | "free">("guided");

  const items: LibItem[] = useMemo(() => {
    const warmups = WARMUP_TRACKS.map((tr) => ({ id: `w:${tr.id}`, name: t(tr.nameKey), scored: true, removable: false }));
    const exercises = EXERCISES.map((ex) => ({ id: `e:${ex.id}`, name: t(ex.nameKey), scored: true, removable: false }));
    const midiItems = midi.songs.map((s) => ({ id: s.id, name: s.name, scored: true, removable: true }));
    const trackItems = tracks.tracks.map((tr) => ({ id: tr.id, name: tr.name, scored: false, removable: true }));
    return [...warmups, ...exercises, ...midiItems, ...trackItems];
  }, [t, midi.songs, tracks.tracks]);

  const shown = items.filter((it) => (tab === "guided" ? it.scored : !it.scored));

  return (
    <div className="mx-auto flex size-full max-w-none flex-col gap-4">
      <Segmented
        value={tab}
        options={[
          { value: "guided", label: t("practice.tabGuided") },
          { value: "free", label: t("practice.tabFree") },
        ]}
        onValueChange={(v) => setTab(v)}
        className="self-center"
      />

      {tab === "guided" ? (
        <AddMidiForm
          onAdd={(name, file, track) => void midi.add(name, file, track).then((id) => id && navigate(`/practice/${id}`))}
        />
      ) : (
        <AddAudioButton onAdd={(file) => void tracks.add(file).then((id) => id && navigate(`/practice/${id}`))} />
      )}

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
      </div>

      <div className="min-h-0 flex-1">
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
      </div>

      {takes.takes.length > 0 && (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {takes.takes.map((tk) => (
            <TakeRow key={tk.id} take={tk} url={takeUrls.get(tk.id) ?? ""} onDelete={() => void takes.remove(tk.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

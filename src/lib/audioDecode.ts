// Decode an audio file to a mono Float32Array at a target sample rate, via an
// OfflineAudioContext (deterministic, faster than real time). Shared by the vocal
// transcriber and the reference-contour extractor.
export async function decodeToMono(file: File, sampleRate: number): Promise<Float32Array> {
  const bytes = await file.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tmp = new AC();
  const decoded = await tmp.decodeAudioData(bytes);
  void tmp.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * sampleRate)), sampleRate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

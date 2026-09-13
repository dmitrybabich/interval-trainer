/* eslint-disable no-restricted-syntax -- shim mirrors an upstream default export. */
// soundfont-player ships without types on npm — declare just the surface we use.
declare module "soundfont-player" {
  export interface Instrument {
    play(midi: number, when?: number, opts?: { duration?: number; gain?: number }): void;
    stop(when?: number): void;
  }

  interface SoundfontStatic {
    instrument(
      ctx: AudioContext,
      name: string,
      opts?: { soundfont?: "MusyngKite" | "FluidR3_GM" },
    ): Promise<Instrument>;
  }

  const Soundfont: SoundfontStatic;
  export default Soundfont;
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BoothSettings, EditorSettings, KioskSettings } from "../types";
export const defaultEditor: EditorSettings = {
  frame: "#f4dce3",
  filter: "original",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  caption: "little moments, big memories",
  date: true,
  dateValue: "",
  sticker: "✦",
  template: "strip",
  text: "",
  textX: 50,
  textY: 85,
};
interface BoothState {
  settings: BoothSettings;
  editor: EditorSettings;
  kiosk: KioskSettings;
  photos: string[];
  clips: (Blob | null)[];
  mode: "solo" | "kiosk" | "together";
  setSettings: (s: Partial<BoothSettings>) => void;
  setEditor: (s: Partial<EditorSettings>) => void;
  setKiosk: (s: Partial<KioskSettings>) => void;
  setPhotos: (p: string[]) => void;
  setClips: (clips: (Blob | null)[]) => void;
  setMode: (m: BoothState["mode"]) => void;
  reset: () => void;
}
export const useBooth = create<BoothState>()(
  persist(
    (set) => ({
      settings: { count: 4, countdown: 3, template: "strip" },
      editor: defaultEditor,
      kiosk: {
        event: "The good times club",
        date: new Date().toISOString().slice(0, 10),
        logo: "",
        reset: 45,
        pinHash: "",
      },
      photos: [],
      clips: [],
      mode: "solo",
      setSettings: (s) => set((v) => ({ settings: { ...v.settings, ...s } })),
      setEditor: (s) => set((v) => ({ editor: { ...v.editor, ...s } })),
      setKiosk: (s) => set((v) => ({ kiosk: { ...v.kiosk, ...s } })),
      setPhotos: (photos) => set({ photos }),
      setClips: (clips) => set({ clips }),
      setMode: (mode) => set({ mode }),
      reset: () => set({ photos: [], clips: [], editor: defaultEditor }),
    }),
    {
      name: "snapbooth-preferences-v1",
      partialize: (s) => ({ settings: s.settings, kiosk: s.kiosk }),
    },
  ),
);

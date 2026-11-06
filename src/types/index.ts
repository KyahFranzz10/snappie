export type ShotCount = 2 | 3 | 4 | 6;
export type Template = "strip" | "postcard" | "story" | "polaroid";
export type Filter = "original" | "mono" | "vintage" | "warm" | "cool" | "film";
export interface PhotoTransform {
  rotation: number;
  flipped: boolean;
}
export interface EditorSettings {
  frame: string;
  filter: Filter;
  brightness: number;
  contrast: number;
  saturation: number;
  caption: string;
  date: boolean;
  dateValue: string;
  sticker: string;
  template: Template;
  text: string;
  textX: number;
  textY: number;
  polaroidMoment?: number;
  polaroidStyle?: "classic" | "postmark" | "minimal";
  photoTransforms?: (PhotoTransform | null)[];
}
export interface BoothSettings {
  count: ShotCount;
  countdown: 3 | 5 | 10;
  template: Template;
}
export interface KioskSettings {
  event: string;
  date: string;
  logo: string;
  reset: number;
  pinHash: string;
}

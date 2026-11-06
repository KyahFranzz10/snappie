import Dexie, { type Table } from "dexie";
import type { EditorSettings } from "../../types";
interface Draft {
  id: string;
  photos: string[];
  editor: EditorSettings;
  saved: number;
}
class BoothDatabase extends Dexie {
  drafts!: Table<Draft>;
  constructor() {
    super("snapbooth-local");
    this.version(1).stores({ drafts: "id,saved" });
  }
}
export const db = new BoothDatabase();
export const saveDraft = (photos: string[], editor: EditorSettings) =>
  db.drafts.put({ id: "latest", photos, editor, saved: Date.now() });
export const loadDraft = () => db.drafts.get("latest");
export const deleteDraft = () => db.drafts.clear();

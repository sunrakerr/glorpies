/** Saved preferences, where storage may be blocked or full: reads fall back to nothing, writes to forgetting. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the choice still holds for this visit
  }
}

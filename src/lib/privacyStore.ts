const PRIVACY_KEY = "nda_doc_ids";

export function getPrivacyDocIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PRIVACY_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function addPrivacyDocId(id: string) {
  const ids = getPrivacyDocIds();
  ids.add(id);
  localStorage.setItem(PRIVACY_KEY, JSON.stringify([...ids]));
}

export function removePrivacyDocId(id: string) {
  const ids = getPrivacyDocIds();
  ids.delete(id);
  localStorage.setItem(PRIVACY_KEY, JSON.stringify([...ids]));
}

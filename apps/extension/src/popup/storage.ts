export async function getValue<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get([key]);
  return result[key] as T | undefined;
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

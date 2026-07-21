import { CacheProvider } from "./cacheProvider.interface";

interface Entry {
  value: string;
  expiresAt: number;
}

// Простой in-memory кэш с TTL. Для многосерверного развёртывания
// достаточно заменить на Redis-реализацию того же CacheProvider.
export class MemoryCache implements CacheProvider {
  private store = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export const cache: CacheProvider = new MemoryCache();

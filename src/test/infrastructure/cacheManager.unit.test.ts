/**
 * CacheManager ユニットテスト
 *
 * キャッシュヒット/ミス、無効化、全クリアの動作を検証する。
 * 検証対象: 要件 8.3
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CacheManager } from "../../infrastructure/cacheManager";
import { PrefixGroup } from "../../domain/types";

/** テスト用のPrefixGroupを生成するヘルパー */
function createGroup(prefix: string, files: string[]): PrefixGroup {
  return {
    prefix,
    files,
    children: [],
    ungroupedFiles: [],
  };
}

describe("CacheManager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  describe("get / set", () => {
    it("キャッシュミス: 未登録のキーに対して undefined を返す", () => {
      expect(cache.get("/path/to/dir")).toBeUndefined();
    });

    it("キャッシュヒット: 登録済みのキーに対して保存した値を返す", () => {
      const group = createGroup("aaa-", ["aaa-bbb", "aaa-ccc"]);
      cache.set("/path/to/dir", group);

      expect(cache.get("/path/to/dir")).toBe(group);
    });

    it("異なるキーは独立して管理される", () => {
      const group1 = createGroup("aaa-", ["aaa-bbb"]);
      const group2 = createGroup("xxx-", ["xxx-yyy"]);

      cache.set("/dir1", group1);
      cache.set("/dir2", group2);

      expect(cache.get("/dir1")).toBe(group1);
      expect(cache.get("/dir2")).toBe(group2);
    });

    it("同じキーに再度 set すると値が上書きされる", () => {
      const group1 = createGroup("aaa-", ["aaa-bbb"]);
      const group2 = createGroup("aaa-", ["aaa-bbb", "aaa-ccc"]);

      cache.set("/dir", group1);
      cache.set("/dir", group2);

      expect(cache.get("/dir")).toBe(group2);
    });
  });

  describe("invalidate", () => {
    it("指定ディレクトリのキャッシュを無効化する", () => {
      const group = createGroup("aaa-", ["aaa-bbb"]);
      cache.set("/dir", group);

      cache.invalidate("/dir");

      expect(cache.get("/dir")).toBeUndefined();
    });

    it("他のディレクトリのキャッシュには影響しない", () => {
      const group1 = createGroup("aaa-", ["aaa-bbb"]);
      const group2 = createGroup("xxx-", ["xxx-yyy"]);

      cache.set("/dir1", group1);
      cache.set("/dir2", group2);

      cache.invalidate("/dir1");

      expect(cache.get("/dir1")).toBeUndefined();
      expect(cache.get("/dir2")).toBe(group2);
    });

    it("存在しないキーを invalidate してもエラーにならない", () => {
      expect(() => cache.invalidate("/nonexistent")).not.toThrow();
    });
  });

  describe("clear", () => {
    it("全キャッシュをクリアする", () => {
      cache.set("/dir1", createGroup("a-", ["a-b"]));
      cache.set("/dir2", createGroup("x-", ["x-y"]));
      cache.set("/dir3", createGroup("m-", ["m-n"]));

      cache.clear();

      expect(cache.get("/dir1")).toBeUndefined();
      expect(cache.get("/dir2")).toBeUndefined();
      expect(cache.get("/dir3")).toBeUndefined();
    });

    it("空のキャッシュに対して clear してもエラーにならない", () => {
      expect(() => cache.clear()).not.toThrow();
    });
  });
});

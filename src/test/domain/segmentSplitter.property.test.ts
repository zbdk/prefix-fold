/**
 * SegmentSplitter プロパティベーステスト
 *
 * Feature: collapse-tree, Property 4: セグメント分割ラウンドトリップ
 * 任意のファイル名と区切り文字リストに対して、分割したセグメントを再結合すると
 * 元のファイル名が復元されることを検証する。
 *
 * 検証対象: 要件 5.6, 5.9, 5.10
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { splitWithSeparators, join } from "../../domain/segmentSplitter";

/**
 * ファイル名に使われる文字のアービトラリ
 * 英数字、ハイフン、アンダースコア、ドットを含む
 */
const fileNameCharArb = fc.stringOf(
  fc.oneof(
    fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
    fc.constant("-"),
    fc.constant("_"),
    fc.constant(".")
  ),
  { minLength: 1, maxLength: 50 }
);

/**
 * 区切り文字のアービトラリ
 * 一般的なファイル名区切り文字
 */
const delimiterArb = fc.oneof(
  fc.constant("-"),
  fc.constant("_"),
  fc.constant("."),
  fc.constant("--"),
  fc.constant("__")
);

/**
 * 区切り文字リストのアービトラリ（0〜3個）
 */
const delimiterListArb = fc.uniqueArray(delimiterArb, { minLength: 0, maxLength: 3 });

describe("Feature: collapse-tree, Property 4: セグメント分割ラウンドトリップ", () => {
  it("区切り文字のみ: 分割して再結合すると元のファイル名が復元される", () => {
    fc.assert(
      fc.property(
        fileNameCharArb,
        delimiterListArb,
        (fileName, delimiters) => {
          const result = splitWithSeparators(fileName, delimiters, false);
          const restored = join(result);
          expect(restored).toBe(fileName);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("キャメルケースのみ: 分割して再結合すると元のファイル名が復元される", () => {
    fc.assert(
      fc.property(
        fileNameCharArb,
        (fileName) => {
          const result = splitWithSeparators(fileName, [], true);
          const restored = join(result);
          expect(restored).toBe(fileName);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("区切り文字+キャメルケース: 分割して再結合すると元のファイル名が復元される", () => {
    fc.assert(
      fc.property(
        fileNameCharArb,
        delimiterListArb,
        (fileName, delimiters) => {
          const result = splitWithSeparators(fileName, delimiters, true);
          const restored = join(result);
          expect(restored).toBe(fileName);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("区切り文字なし・キャメルケースなし: ファイル名がそのまま1セグメントとして返される", () => {
    fc.assert(
      fc.property(
        fileNameCharArb,
        (fileName) => {
          const result = splitWithSeparators(fileName, [], false);
          expect(result.segments).toEqual([fileName]);
          expect(result.separators).toEqual([]);
          const restored = join(result);
          expect(restored).toBe(fileName);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("空文字列: 分割して再結合すると空文字列が復元される", () => {
    const result = splitWithSeparators("", ["-"], false);
    expect(join(result)).toBe("");

    const result2 = splitWithSeparators("", [], true);
    expect(join(result2)).toBe("");

    const result3 = splitWithSeparators("", ["-"], true);
    expect(join(result3)).toBe("");
  });

  it("セグメント数は常に1以上である", () => {
    fc.assert(
      fc.property(
        fileNameCharArb,
        delimiterListArb,
        fc.boolean(),
        (fileName, delimiters, camelCase) => {
          const result = splitWithSeparators(fileName, delimiters, camelCase);
          expect(result.segments.length).toBeGreaterThanOrEqual(1);
          // separators の数は segments の数 - 1
          expect(result.separators.length).toBe(result.segments.length - 1);
        }
      ),
      { numRuns: 200 }
    );
  });
});

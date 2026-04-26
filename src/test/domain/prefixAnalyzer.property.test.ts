/**
 * PrefixAnalyzer プロパティベーステスト
 *
 * Feature: collapse-tree
 * PrefixAnalyzerの正当性プロパティを検証する。
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { analyze } from "../../domain/prefixAnalyzer";
import { AnalyzerConfig, PrefixGroup } from "../../domain/types";

// ===== アービトラリ定義 =====

/**
 * ファイル名に使われる文字のアービトラリ
 * 英数字、ハイフン、アンダースコア、ドットを含む
 */
const fileNameArb = fc.stringOf(
  fc.oneof(
    fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
    fc.constant("-"),
    fc.constant("_"),
    fc.constant(".")
  ),
  { minLength: 1, maxLength: 30 }
);

/**
 * ファイル名リストのアービトラリ（1〜20個）
 */
const fileNameListArb = fc.array(fileNameArb, {
  minLength: 1,
  maxLength: 20,
});

/**
 * 区切り文字のアービトラリ
 */
const delimiterArb = fc.oneof(
  fc.constant("-"),
  fc.constant("_"),
  fc.constant(".")
);

/**
 * 区切り文字リストのアービトラリ（1〜3個）
 */
const delimiterListArb = fc.uniqueArray(delimiterArb, {
  minLength: 1,
  maxLength: 3,
});

/**
 * minGroupSizeのアービトラリ（2〜5）
 */
const minGroupSizeArb = fc.integer({ min: 2, max: 5 });

/**
 * 基本的なAnalyzerConfigのアービトラリ
 */
const basicConfigArb = fc.record({
  delimiters: delimiterListArb,
  minGroupSize: minGroupSizeArb,
  camelCaseSplit: fc.boolean(),
  excludePatterns: fc.constant([] as string[]),
});

// ===== ヘルパー関数 =====

/**
 * PrefixGroupツリーから全ファイル名を再帰的に収集する
 * （グループ化されたファイル + ungroupedFiles）
 */
function collectAllFilesFromGroup(group: PrefixGroup): string[] {
  const files: string[] = [...group.files, ...group.ungroupedFiles];
  for (const child of group.children) {
    files.push(...collectAllFilesFromGroup(child));
  }
  return files;
}

/**
 * PrefixGroupツリーの全グループ（ルート除く）を再帰的に収集する
 */
function collectAllGroups(group: PrefixGroup): PrefixGroup[] {
  const groups: PrefixGroup[] = [];
  for (const child of group.children) {
    groups.push(child);
    groups.push(...collectAllGroups(child));
  }
  return groups;
}

/**
 * PrefixGroupの総ファイル数を再帰的に数える
 * （直接ファイル + ungroupedFiles + サブグループのファイル）
 */
function countTotalFiles(group: PrefixGroup): number {
  let count = group.files.length + group.ungroupedFiles.length;
  for (const child of group.children) {
    count += countTotalFiles(child);
  }
  return count;
}

// ===== プロパティテスト =====

describe("Feature: collapse-tree, Property 1: ファイル保存性（入力ファイルの完全な分類）", () => {
  it("すべてのプレフィックスグループに属するファイルとグループ化されなかったファイルの和集合が入力と一致する", () => {
    fc.assert(
      fc.property(
        fileNameListArb,
        basicConfigArb,
        (fileNames, config) => {
          // 重複を除去した入力（同名ファイルがある場合も正しく扱う）
          const result = analyze(fileNames, config);
          const collectedFiles = collectAllFilesFromGroup(result);

          // ソートして比較（順序は問わない）
          const sortedInput = [...fileNames].sort();
          const sortedCollected = [...collectedFiles].sort();

          expect(sortedCollected).toEqual(sortedInput);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("空のファイルリストの場合、結果も空である", () => {
    fc.assert(
      fc.property(
        basicConfigArb,
        (config) => {
          const result = analyze([], config);
          const collectedFiles = collectAllFilesFromGroup(result);
          expect(collectedFiles).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Feature: collapse-tree, Property 2: グループサイズ閾値", () => {
  it("すべてのプレフィックスグループのファイル数がminGroupSize以上である", () => {
    fc.assert(
      fc.property(
        fileNameListArb,
        basicConfigArb,
        (fileNames, config) => {
          const result = analyze(fileNames, config);
          const allGroups = collectAllGroups(result);

          for (const group of allGroups) {
            const totalFiles = countTotalFiles(group);
            expect(totalFiles).toBeGreaterThanOrEqual(config.minGroupSize);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("Feature: collapse-tree, Property 3: 階層的プレフィックスの整合性", () => {
  /**
   * 子グループのプレフィックスが親グループのプレフィックスで始まることを再帰的に検証する
   *
   * @param group - 検証対象のグループ
   * @param isRoot - ルートグループかどうか（ルートは特殊ケース）
   */
  function verifyHierarchicalPrefixes(
    group: PrefixGroup,
    isRoot: boolean = false
  ): void {
    for (const child of group.children) {
      // 子グループのプレフィックスは親グループのプレフィックスで始まる
      expect(child.prefix.startsWith(group.prefix)).toBe(true);

      // ルートグループ（prefix=""）の子は、空セグメントの場合にprefixが""になりうる
      // ルート以外では、子のプレフィックスは親より厳密に長い
      if (!isRoot) {
        expect(child.prefix.length).toBeGreaterThan(group.prefix.length);
      }

      // 再帰的に検証（子グループはルートではない）
      verifyHierarchicalPrefixes(child, false);
    }
  }

  it("子グループのプレフィックスが親グループのプレフィックスで始まる", () => {
    fc.assert(
      fc.property(
        fileNameListArb,
        basicConfigArb,
        (fileNames, config) => {
          const result = analyze(fileNames, config);
          verifyHierarchicalPrefixes(result, true);
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("Feature: collapse-tree, Property 7: 空区切り文字時のグループ化無効化", () => {
  it("区切り文字が空配列かつキャメルケース無効の場合、プレフィックスグループが生成されない", () => {
    fc.assert(
      fc.property(
        fileNameListArb,
        minGroupSizeArb,
        (fileNames, minGroupSize) => {
          const config: AnalyzerConfig = {
            delimiters: [],
            minGroupSize,
            camelCaseSplit: false,
            excludePatterns: [],
          };

          const result = analyze(fileNames, config);

          // グループが生成されない
          expect(result.children).toEqual([]);
          // 直接ファイルもない（ルートのfilesは空）
          expect(result.files).toEqual([]);
          // すべてのファイルがungroupedFilesに含まれる
          const sortedInput = [...fileNames].sort();
          const sortedUngrouped = [...result.ungroupedFiles].sort();
          expect(sortedUngrouped).toEqual(sortedInput);
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("Feature: collapse-tree, Property 8: 除外パターンによるフィルタリング", () => {
  it("除外パターンに一致するファイルが解析結果に含まれない", () => {
    // テスト用: 特定のプレフィックスを持つファイル名を生成し、そのプレフィックスで除外する
    const prefixArb = fc.constantFrom("test-", "tmp-", "temp-");

    fc.assert(
      fc.property(
        fileNameListArb,
        prefixArb,
        basicConfigArb,
        (baseFileNames, excludePrefix, baseConfig) => {
          // 除外対象のファイル名を追加
          const excludedFiles = baseFileNames
            .slice(0, Math.min(3, baseFileNames.length))
            .map((name) => excludePrefix + name);
          const allFileNames = [...baseFileNames, ...excludedFiles];

          const config: AnalyzerConfig = {
            ...baseConfig,
            excludePatterns: [excludePrefix + "*"],
          };

          const result = analyze(allFileNames, config);
          const collectedFiles = collectAllFilesFromGroup(result);

          // 除外されたファイルが結果に含まれない
          for (const excludedFile of excludedFiles) {
            expect(collectedFiles).not.toContain(excludedFile);
          }

          // 除外されていないファイルは結果に含まれる
          const nonExcludedFiles = baseFileNames.filter(
            (name) => !name.startsWith(excludePrefix)
          );
          const sortedNonExcluded = [...nonExcludedFiles].sort();
          const sortedCollected = [...collectedFiles].sort();
          expect(sortedCollected).toEqual(sortedNonExcluded);
        }
      ),
      { numRuns: 200 }
    );
  });
});

/**
 * PrefixAnalyzer: ファイル名リストからプレフィックスグループツリーを構築する
 *
 * SegmentSplitterとPrefixTrieを組み合わせて、ファイル名の共通プレフィックスを
 * 解析し、階層的なPrefixGroupツリーを生成する。
 * VSCode APIに依存しない純粋関数として実装。
 */

import { AnalyzerConfig, PrefixGroup } from "./types";
import { splitWithSeparators } from "./segmentSplitter";
import { PrefixTrie } from "./prefixTrie";
import { matchesAnyPattern } from "./globMatcher";

/**
 * ファイル名リストからプレフィックスグループツリーを構築する
 *
 * @param fileNames - 解析対象のファイル名リスト
 * @param config - 解析設定
 * @returns ルートのPrefixGroup
 */
export function analyze(
  fileNames: string[],
  config: AnalyzerConfig
): PrefixGroup {
  // 除外パターンによるフィルタリング
  const filteredFileNames =
    config.excludePatterns.length > 0
      ? fileNames.filter(
          (name) => !matchesAnyPattern(name, config.excludePatterns)
        )
      : fileNames;

  // 空区切り文字かつキャメルケース無効の場合、グループ化を無効化
  if (config.delimiters.length === 0 && !config.camelCaseSplit) {
    return {
      prefix: "",
      files: [],
      children: [],
      ungroupedFiles: [...filteredFileNames],
    };
  }

  // Trieを構築
  const trie = new PrefixTrie();

  for (const fileName of filteredFileNames) {
    const result = splitWithSeparators(
      fileName,
      config.delimiters,
      config.camelCaseSplit
    );
    trie.insert({
      segments: result.segments,
      separators: result.separators,
      fileName,
    });
  }

  // Trieからプレフィックスグループツリーを構築
  return trie.buildGroups(config.minGroupSize);
}

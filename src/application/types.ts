/**
 * アプリケーション層の型定義
 */

/**
 * PrefixFold拡張機能の設定
 */
export interface PrefixFoldConfig {
  /** プレフィックス区切り文字（デフォルト: ["-"]） */
  delimiters: string[];
  /** 最小グループサイズ（デフォルト: 2） */
  minGroupSize: number;
  /** 除外パターン（glob形式、デフォルト: []） */
  excludePatterns: string[];
  /** キャメルケース区切り（デフォルト: false） */
  camelCaseSplit: boolean;
}

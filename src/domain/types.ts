/**
 * プレフィックス解析のドメイン型定義
 */

/**
 * プレフィックスグループ: 共通プレフィックスを持つファイルの集合
 * プレフィックス解析の結果を表現するドメインモデル
 */
export interface PrefixGroup {
  /** 共通プレフィックス（例: "aaa-"） */
  prefix: string;
  /** このグループに直接属するファイル名 */
  files: string[];
  /** サブプレフィックスグループ（階層構造） */
  children: PrefixGroup[];
  /** グループ化されなかったファイル名 */
  ungroupedFiles: string[];
}

/**
 * Trieの内部ノード: プレフィックス解析のための中間データ構造
 */
export interface TrieNode {
  /** このノードのセグメント文字列 */
  segment: string;
  /** 子ノード（セグメント → TrieNode） */
  children: Map<string, TrieNode>;
  /** このノードで終端するファイル名 */
  fileNames: string[];
}

/**
 * プレフィックス解析の設定
 */
export interface AnalyzerConfig {
  /** プレフィックス区切り文字（デフォルト: ["-"]） */
  delimiters: string[];
  /** 最小グループサイズ（デフォルト: 2） */
  minGroupSize: number;
  /** キャメルケース区切り有効/無効（デフォルト: false） */
  camelCaseSplit: boolean;
  /** 除外パターン（glob形式） */
  excludePatterns: string[];
}

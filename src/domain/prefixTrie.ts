/**
 * PrefixTrie: ファイル名セグメントをTrieに格納し、共通プレフィックスを検出する
 *
 * セグメント列をTrieに挿入し、minGroupSizeによる閾値フィルタリングを行いながら
 * PrefixGroupツリーを構築する。VSCode APIに依存しない純粋なデータ構造。
 *
 * プレフィックス文字列は、セグメントとその間の区切り文字を含む形で構築される。
 * 例: ファイル "aaa-bbbb-cccc" の深さ1のグループプレフィックスは "aaa"
 *     深さ2のグループプレフィックスは "aaa-bbbb"
 */

import { PrefixGroup, TrieNode } from "./types";

/**
 * Trieに挿入するエントリ
 */
export interface TrieEntry {
  /** 分割されたセグメント配列 */
  segments: string[];
  /** 各セグメント間の区切り文字列（長さは segments.length - 1） */
  separators: string[];
  /** 元のファイル名 */
  fileName: string;
}

/**
 * Trieの内部ノード（区切り文字情報付き）
 */
interface InternalTrieNode {
  /** このノードのセグメント文字列 */
  segment: string;
  /**
   * このノードから子ノードへの代表的な区切り文字
   * separators[depth] に対応する（depthはこのノードの深さ）
   */
  separatorToChildren: string;
  /** この区切り文字が設定済みかどうか */
  hasSeparator: boolean;
  /** 子ノード（セグメント → InternalTrieNode） */
  children: Map<string, InternalTrieNode>;
  /** このノードで終端するファイル名 */
  fileNames: string[];
}

/**
 * 新しいInternalTrieNodeを生成する
 */
function createNode(segment: string): InternalTrieNode {
  return {
    segment,
    separatorToChildren: "",
    hasSeparator: false,
    children: new Map(),
    fileNames: [],
  };
}

/**
 * PrefixTrieクラス: セグメント列をTrieに格納し、PrefixGroupツリーを構築する
 */
export class PrefixTrie {
  private root: InternalTrieNode;

  constructor() {
    this.root = createNode("");
  }

  /**
   * エントリをTrieに挿入する
   *
   * @param entry - 挿入するエントリ（セグメント、区切り文字、ファイル名）
   */
  insert(entry: TrieEntry): void {
    let current = this.root;

    for (let i = 0; i < entry.segments.length; i++) {
      const segment = entry.segments[i];

      // このノード（深さi-1のノード、またはルート）から子（深さiのノード）への区切り文字
      // separators[i-1] は segments[i-1] と segments[i] の間の区切り文字
      // ルート→最初の子には区切り文字なし
      // 深さ0のノード→深さ1のノードには separators[0]
      // つまり、current（深さi-1のノード）から子への区切り文字は separators[i-1]
      // ただし i=0 の場合（ルート→最初の子）は区切り文字なし

      if (!current.children.has(segment)) {
        current.children.set(segment, createNode(segment));
      }

      // 現在のノードから子への区切り文字を記録
      // i > 0 の場合: separators[i-1] が現在のノード（深さi-1）から子（深さi）への区切り文字
      // i = 0 の場合: ルートから最初の子への区切り文字はない
      // ただし、ここでの「現在のノード」はまだ移動前なので:
      // - i=0: current=root, 子はsegments[0]のノード → 区切り文字なし
      // - i=1: current=segments[0]のノード, 子はsegments[1]のノード → separators[0]
      // - i=k: current=segments[k-1]のノード, 子はsegments[k]のノード → separators[k-1]
      if (i > 0 && !current.hasSeparator && i - 1 < entry.separators.length) {
        current.separatorToChildren = entry.separators[i - 1];
        current.hasSeparator = true;
      }

      current = current.children.get(segment)!;
    }

    // 終端ノードにファイル名を記録
    current.fileNames.push(entry.fileName);
  }

  /**
   * Trieからプレフィックスグループツリーを構築する
   *
   * @param minGroupSize - グループとして認識する最小ファイル数
   * @returns ルートのPrefixGroup
   */
  buildGroups(minGroupSize: number): PrefixGroup {
    return this.buildGroupFromNode(this.root, "", minGroupSize);
  }

  /**
   * 指定ノード以下のサブツリーに含まれる全ファイル数を数える
   */
  private countFiles(node: InternalTrieNode): number {
    let count = node.fileNames.length;
    for (const child of node.children.values()) {
      count += this.countFiles(child);
    }
    return count;
  }

  /**
   * 指定ノード以下のサブツリーに含まれる全ファイル名を収集する
   */
  private collectAllFiles(node: InternalTrieNode): string[] {
    const files: string[] = [...node.fileNames];
    for (const child of node.children.values()) {
      files.push(...this.collectAllFiles(child));
    }
    return files;
  }

  /**
   * TrieNodeからPrefixGroupを再帰的に構築する
   *
   * @param node - 現在のInternalTrieNode
   * @param currentPrefix - 現在のプレフィックス文字列
   * @param minGroupSize - 最小グループサイズ
   * @returns 構築されたPrefixGroup
   */
  private buildGroupFromNode(
    node: InternalTrieNode,
    currentPrefix: string,
    minGroupSize: number
  ): PrefixGroup {
    const children: PrefixGroup[] = [];
    const ungroupedFiles: string[] = [];

    // このノードから子への区切り文字
    const separator = node.separatorToChildren;

    for (const [, childNode] of node.children) {
      const totalFilesInChild = this.countFiles(childNode);

      // 子ノードのプレフィックスを構築
      // ルートからの最初の子の場合は区切り文字なし（セグメントのみ）
      // それ以外は 親プレフィックス + 区切り文字 + セグメント
      const childPrefix =
        currentPrefix === "" && !node.hasSeparator
          ? childNode.segment
          : currentPrefix + separator + childNode.segment;

      if (totalFilesInChild >= minGroupSize) {
        const childGroup = this.buildGroupFromNode(
          childNode,
          childPrefix,
          minGroupSize
        );
        children.push(childGroup);
      } else {
        ungroupedFiles.push(...this.collectAllFiles(childNode));
      }
    }

    return {
      prefix: currentPrefix,
      files: [...node.fileNames],
      children,
      ungroupedFiles,
    };
  }

  /**
   * 外部公開用: TrieNodeインターフェースに変換したルートノードを返す
   * （テスト・デバッグ用）
   */
  getRoot(): TrieNode {
    return this.toTrieNode(this.root);
  }

  private toTrieNode(node: InternalTrieNode): TrieNode {
    const children = new Map<string, TrieNode>();
    for (const [key, child] of node.children) {
      children.set(key, this.toTrieNode(child));
    }
    return {
      segment: node.segment,
      children,
      fileNames: [...node.fileNames],
    };
  }
}

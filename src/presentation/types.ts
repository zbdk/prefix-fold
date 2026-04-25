import * as vscode from "vscode";

/**
 * プレゼンテーション層の型定義
 */

/**
 * TreeViewノードの種別
 */
export enum TreeNodeKind {
  /** 仮想フォルダ（プレフィックスグループ） */
  VirtualFolder = "virtualFolder",
  /** 実ファイル */
  File = "file",
  /** 実ディレクトリ */
  Directory = "directory",
  /** ワークスペースルート */
  WorkspaceRoot = "workspaceRoot",
}

/**
 * TreeViewに表示される各ノード
 * 仮想フォルダとファイルの両方を表現できる
 */
export interface TreeNode {
  /** ノードの種別 */
  kind: TreeNodeKind;
  /** 表示ラベル */
  label: string;
  /** ファイルの場合のURI */
  resourceUri?: vscode.Uri;
  /** 仮想フォルダの場合のプレフィックス文字列 */
  prefix?: string;
  /** 所属ディレクトリのパス */
  directoryPath: string;
  /** 子ノード（遅延ロード可能） */
  children?: TreeNode[];
  /** 仮想フォルダの場合のファイル数 */
  fileCount?: number;
}

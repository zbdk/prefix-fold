/**
 * TreeNode変換ロジック
 *
 * PrefixGroup（ドメインモデル）からTreeNode（プレゼンテーションモデル）への変換を行う。
 * 仮想フォルダのラベルフォーマット、ファイルラベルのプレフィックス除去、
 * アイコン・collapsibleState・commandの設定を担当する。
 */

import * as vscode from "vscode";
import * as path from "path";
import { PrefixGroup } from "../domain/types";
import { TreeNode, TreeNodeKind } from "./types";

/**
 * PrefixGroupツリー内の総ファイル数を再帰的に数える
 * （直接ファイル + ungroupedFiles + サブグループのファイル）
 *
 * @param group - 対象のPrefixGroup
 * @returns 総ファイル数
 */
function countTotalFiles(group: PrefixGroup): number {
  let count = group.files.length + group.ungroupedFiles.length;
  for (const child of group.children) {
    count += countTotalFiles(child);
  }
  return count;
}

/**
 * ファイル名からプレフィックス部分を除去したラベルを生成する
 *
 * @param fileName - 元のファイル名
 * @param prefix - 除去するプレフィックス文字列
 * @returns プレフィックスを除去した残りの文字列
 */
export function removePrefix(fileName: string, prefix: string): string {
  if (prefix === "" || !fileName.startsWith(prefix)) {
    return fileName;
  }
  return fileName.slice(prefix.length);
}

/**
 * ファイルTreeNodeを生成する
 *
 * @param fileName - ファイル名
 * @param label - 表示ラベル
 * @param directoryPath - 所属ディレクトリのパス
 * @returns ファイルTreeNode
 */
function createFileNode(
  fileName: string,
  label: string,
  directoryPath: string
): TreeNode {
  const filePath = path.join(directoryPath, fileName);
  const uri = vscode.Uri.file(filePath);

  return {
    kind: TreeNodeKind.File,
    label,
    resourceUri: uri,
    directoryPath,
  };
}

/**
 * PrefixGroupの子グループを仮想フォルダTreeNodeに変換する
 *
 * @param group - 変換対象のPrefixGroup（子グループ）
 * @param directoryPath - 所属ディレクトリのパス
 * @returns 仮想フォルダTreeNode
 */
function convertGroupToVirtualFolder(
  group: PrefixGroup,
  directoryPath: string
): TreeNode {
  const totalFileCount = countTotalFiles(group);
  const children = convertGroupChildren(group, directoryPath);

  return {
    kind: TreeNodeKind.VirtualFolder,
    label: `${group.prefix} (${totalFileCount})`,
    prefix: group.prefix,
    directoryPath,
    children,
    fileCount: totalFileCount,
  };
}

/**
 * PrefixGroup内の子要素（ファイル + サブグループ + ungroupedFiles）をTreeNode配列に変換する
 *
 * @param group - 変換対象のPrefixGroup
 * @param directoryPath - 所属ディレクトリのパス
 * @returns TreeNode配列
 */
function convertGroupChildren(
  group: PrefixGroup,
  directoryPath: string
): TreeNode[] {
  const nodes: TreeNode[] = [];

  // サブグループを仮想フォルダとして変換（再帰）
  for (const child of group.children) {
    nodes.push(convertGroupToVirtualFolder(child, directoryPath));
  }

  // グループに直接属するファイルをTreeNodeに変換（プレフィックス除去）
  for (const fileName of group.files) {
    const label = removePrefix(fileName, group.prefix);
    nodes.push(createFileNode(fileName, label, directoryPath));
  }

  // グループ化されなかったファイルをTreeNodeに変換（プレフィックス除去）
  for (const fileName of group.ungroupedFiles) {
    const label = removePrefix(fileName, group.prefix);
    nodes.push(createFileNode(fileName, label, directoryPath));
  }

  return nodes;
}

/**
 * ルートPrefixGroupからTreeNode配列に変換する
 *
 * ルートグループの子グループは仮想フォルダとして、
 * ルートグループのfiles/ungroupedFilesはルートレベルのファイルとして変換する。
 *
 * @param rootGroup - ルートのPrefixGroup（analyze関数の戻り値）
 * @param directoryPath - 対象ディレクトリのパス
 * @returns TreeNode配列
 */
export function convertPrefixGroupToTreeNodes(
  rootGroup: PrefixGroup,
  directoryPath: string
): TreeNode[] {
  const nodes: TreeNode[] = [];

  // 子グループを仮想フォルダとして変換
  for (const child of rootGroup.children) {
    nodes.push(convertGroupToVirtualFolder(child, directoryPath));
  }

  // ルートグループに直接属するファイル（プレフィックス除去なし）
  for (const fileName of rootGroup.files) {
    nodes.push(createFileNode(fileName, fileName, directoryPath));
  }

  // グループ化されなかったファイル（プレフィックス除去なし）
  for (const fileName of rootGroup.ungroupedFiles) {
    nodes.push(createFileNode(fileName, fileName, directoryPath));
  }

  return nodes;
}

/**
 * TreeNodeからvscode.TreeItemを生成する
 *
 * アイコン、collapsibleState、commandの設定を行う。
 * PrefixTreeDataProviderのgetTreeItemメソッドから呼び出される。
 *
 * @param node - 変換対象のTreeNode
 * @returns vscode.TreeItem
 */
export function toTreeItem(node: TreeNode): vscode.TreeItem {
  // collapsibleStateの設定: 仮想フォルダはCollapsed、ファイルはNone
  const collapsibleState =
    node.kind === TreeNodeKind.VirtualFolder ||
    node.kind === TreeNodeKind.Directory ||
    node.kind === TreeNodeKind.WorkspaceRoot
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

  const treeItem = new vscode.TreeItem(node.label, collapsibleState);

  // リソースURIの設定
  if (node.resourceUri) {
    treeItem.resourceUri = node.resourceUri;
  }

  // アイコンの設定: 仮想フォルダと実フォルダを視覚的に区別する
  switch (node.kind) {
    case TreeNodeKind.VirtualFolder:
      treeItem.iconPath = new vscode.ThemeIcon("symbol-folder");
      treeItem.contextValue = "virtualFolder";
      break;
    case TreeNodeKind.Directory:
      treeItem.iconPath = new vscode.ThemeIcon("folder");
      treeItem.contextValue = "directory";
      break;
    case TreeNodeKind.File:
      // ファイルはresourceUriからVSCodeが自動でアイコンを設定する
      treeItem.contextValue = "file";
      // ファイルクリック時のcommand設定: vscode.openコマンド
      if (node.resourceUri) {
        treeItem.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [node.resourceUri],
        };
      }
      break;
    case TreeNodeKind.WorkspaceRoot:
      treeItem.iconPath = new vscode.ThemeIcon("root-folder");
      treeItem.contextValue = "workspaceRoot";
      break;
  }

  // 仮想フォルダの説明にファイル数を表示
  if (node.kind === TreeNodeKind.VirtualFolder && node.fileCount !== undefined) {
    treeItem.description = `${node.fileCount} files`;
  }

  return treeItem;
}

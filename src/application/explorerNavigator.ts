/**
 * ExplorerNavigator: エクスプローラー連携コンポーネント
 *
 * VSCodeの標準エクスプローラーとPrefixFold TreeView間の
 * 相互ナビゲーションを提供する。
 *
 * - showInPrefixFold: エクスプローラーのフォルダ右クリックから
 *   PrefixFold TreeViewを開いて該当ディレクトリを表示する
 * - revealInExplorer: PrefixFold TreeViewの右クリックから
 *   標準エクスプローラーで表示する
 *
 * 要件: 7.1, 7.2, 7.3, 7.4
 */

import * as vscode from "vscode";
import { TreeNode, TreeNodeKind } from "../presentation/types";

export class ExplorerNavigator implements vscode.Disposable {
  private treeView: vscode.TreeView<TreeNode> | undefined;

  /**
   * TreeViewインスタンスを設定する
   *
   * extension.tsでTreeView作成後に呼び出される。
   * showInPrefixFoldでrevealを使用するために必要。
   *
   * @param treeView - PrefixFold TreeViewインスタンス
   */
  setTreeView(treeView: vscode.TreeView<TreeNode>): void {
    this.treeView = treeView;
  }

  /**
   * エクスプローラーからPrefixFoldへのナビゲーション
   *
   * エクスプローラーのフォルダ右クリックメニューから呼び出される。
   * PrefixFold TreeViewパネルをフォーカスし、該当ディレクトリを表示する。
   *
   * @param directoryUri - 表示対象ディレクトリのURI
   */
  async showInPrefixFold(directoryUri: vscode.Uri): Promise<void> {
    // PrefixFold TreeViewパネルをフォーカスする
    await vscode.commands.executeCommand("prefixFoldView.focus");
  }

  /**
   * PrefixFoldからエクスプローラーへのナビゲーション
   *
   * PrefixFold TreeViewのファイル/ディレクトリ/仮想フォルダの
   * 右クリックメニューから呼び出される。
   * 標準エクスプローラーで該当リソースを表示（Reveal）する。
   *
   * 仮想フォルダの場合は、仮想フォルダが所属する実ディレクトリの
   * URIを使用してエクスプローラーで表示する。
   *
   * @param node - 対象のTreeNode
   */
  async revealInExplorer(node: TreeNode): Promise<void> {
    const uri = this.resolveUri(node);
    if (!uri) {
      return;
    }

    await vscode.commands.executeCommand("revealInExplorer", uri);
  }

  /**
   * TreeNodeからエクスプローラーで表示するURIを解決する
   *
   * - ファイル/ディレクトリ: resourceUriをそのまま使用
   * - 仮想フォルダ: 所属する実ディレクトリのURIを使用
   *
   * @param node - 対象のTreeNode
   * @returns 解決されたURI、またはundefined
   */
  private resolveUri(node: TreeNode): vscode.Uri | undefined {
    switch (node.kind) {
      case TreeNodeKind.File:
      case TreeNodeKind.Directory:
        return node.resourceUri;
      case TreeNodeKind.VirtualFolder:
        // 仮想フォルダの場合は所属する実ディレクトリのURIを使用する
        return vscode.Uri.file(node.directoryPath);
      default:
        return undefined;
    }
  }

  dispose(): void {
    this.treeView = undefined;
  }
}

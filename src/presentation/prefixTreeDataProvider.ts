/**
 * PrefixTreeDataProvider: TreeViewにデータを供給する中心コンポーネント
 *
 * vscode.TreeDataProvider<TreeNode>を実装し、ワークスペース内のファイルを
 * プレフィックスグループに基づいて階層的に表示する。
 * CacheManagerによるキャッシュ、マルチルートワークスペース対応、
 * 大量ファイル時のプログレスインジケータ表示を提供する。
 *
 * 要件: 2.1, 2.4, 6.1, 6.2, 6.3, 8.1, 8.2
 */

import * as vscode from "vscode";
import { TreeNode, TreeNodeKind } from "./types";
import { toTreeItem, convertPrefixGroupToTreeNodes } from "./treeNodeConverter";
import { CacheManager } from "../infrastructure/cacheManager";
import { ConfigManager } from "../application/configManager";
import { analyze } from "../domain/prefixAnalyzer";
import { AnalyzerConfig } from "../domain/types";

/** 大量ファイル閾値: この件数を超えるとプログレスインジケータを表示する */
const LARGE_FILE_THRESHOLD = 10000;

export class PrefixTreeDataProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null | void
  >();

  /** TreeView更新通知イベント */
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(
    private readonly cacheManager: CacheManager,
    private readonly configManager: ConfigManager
  ) {}

  /**
   * TreeNodeからvscode.TreeItemを生成する
   *
   * @param element - 変換対象のTreeNode
   * @returns vscode.TreeItem
   */
  getTreeItem(element: TreeNode): vscode.TreeItem {
    return toTreeItem(element);
  }

  /**
   * ルートまたは親ノードの子ノードを返す
   *
   * - element が undefined の場合: ワークスペースルートノードを返す
   *   - マルチルートワークスペース: 各ルートフォルダを WorkspaceRoot ノードとして返す
   *   - シングルルート: ルートフォルダの解析結果を直接返す
   * - WorkspaceRoot / Directory の場合: ディレクトリ内のファイルを解析して返す
   * - VirtualFolder の場合: 子ノードを返す
   * - File の場合: 空配列を返す
   *
   * @param element - 親ノード（undefinedの場合はルート）
   * @returns 子ノード配列
   */
  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    // ワークスペースが開かれていない場合
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    // ルートレベル: ワークスペースフォルダを返す
    if (!element) {
      return this.getRootChildren(workspaceFolders);
    }

    // ノード種別に応じた子ノード取得
    switch (element.kind) {
      case TreeNodeKind.WorkspaceRoot:
      case TreeNodeKind.Directory:
        return this.getDirectoryChildren(element.directoryPath);
      case TreeNodeKind.VirtualFolder:
        return element.children ?? [];
      case TreeNodeKind.File:
        return [];
      default:
        return [];
    }
  }

  /**
   * キャッシュを無効化し、TreeView更新通知を発火する
   */
  refresh(): void {
    this.cacheManager.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * ルートレベルの子ノードを取得する
   *
   * マルチルートワークスペースの場合は各ルートフォルダをWorkspaceRootノードとして返す。
   * シングルルートの場合はルートフォルダの解析結果を直接返す。
   *
   * @param workspaceFolders - ワークスペースフォルダ一覧
   * @returns ルートレベルのTreeNode配列
   */
  private async getRootChildren(
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): Promise<TreeNode[]> {
    // マルチルートワークスペース: 各ルートフォルダをWorkspaceRootノードとして表示
    if (workspaceFolders.length > 1) {
      return workspaceFolders.map((folder) => ({
        kind: TreeNodeKind.WorkspaceRoot,
        label: folder.name,
        resourceUri: folder.uri,
        directoryPath: folder.uri.fsPath,
      }));
    }

    // シングルルート: ルートフォルダの解析結果を直接返す
    const rootPath = workspaceFolders[0].uri.fsPath;
    return this.getDirectoryChildren(rootPath);
  }

  /**
   * ディレクトリ内のファイルを解析してTreeNode配列を返す
   *
   * CacheManagerを利用してキャッシュヒット時は再解析を回避する。
   * ファイル数が10000件を超える場合はプログレスインジケータを表示する。
   *
   * @param directoryPath - 対象ディレクトリのパス
   * @returns TreeNode配列
   */
  private async getDirectoryChildren(
    directoryPath: string
  ): Promise<TreeNode[]> {
    // キャッシュヒット時はキャッシュから返す
    const cached = this.cacheManager.get(directoryPath);
    if (cached) {
      return this.buildTreeNodesFromDirectory(directoryPath, cached);
    }

    // ディレクトリ内のエントリを読み取る
    const dirUri = vscode.Uri.file(directoryPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      // ディレクトリ読み取りエラー時は空配列を返す
      return [];
    }

    // ファイルとディレクトリを分離
    const fileNames: string[] = [];
    const directoryNodes: TreeNode[] = [];

    for (const [name, fileType] of entries) {
      if (fileType === vscode.FileType.Directory) {
        directoryNodes.push({
          kind: TreeNodeKind.Directory,
          label: name,
          resourceUri: vscode.Uri.joinPath(dirUri, name),
          directoryPath: vscode.Uri.joinPath(dirUri, name).fsPath,
        });
      } else if (fileType === vscode.FileType.File) {
        fileNames.push(name);
      }
    }

    // 設定を取得してAnalyzerConfigに変換
    const config = this.configManager.getConfig();
    const analyzerConfig: AnalyzerConfig = {
      delimiters: config.delimiters,
      minGroupSize: config.minGroupSize,
      camelCaseSplit: config.camelCaseSplit,
      excludePatterns: config.excludePatterns,
    };

    // 大量ファイル時はプログレスインジケータを表示
    let prefixGroup;
    if (fileNames.length > LARGE_FILE_THRESHOLD) {
      prefixGroup = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "PrefixFold: ファイルを解析中...",
          cancellable: false,
        },
        async () => {
          return analyze(fileNames, analyzerConfig);
        }
      );
    } else {
      prefixGroup = analyze(fileNames, analyzerConfig);
    }

    // キャッシュに保存
    this.cacheManager.set(directoryPath, prefixGroup);

    // TreeNode配列を構築（ディレクトリノード + プレフィックスグループノード）
    const prefixNodes = convertPrefixGroupToTreeNodes(
      prefixGroup,
      directoryPath
    );
    return [...directoryNodes, ...prefixNodes];
  }

  /**
   * キャッシュされたPrefixGroupからTreeNode配列を構築する
   *
   * ディレクトリノードはキャッシュに含まれないため、再度ディレクトリを読み取って
   * ディレクトリノードを生成し、キャッシュされたプレフィックスグループと結合する。
   *
   * @param directoryPath - 対象ディレクトリのパス
   * @param cachedGroup - キャッシュされたPrefixGroup
   * @returns TreeNode配列
   */
  private async buildTreeNodesFromDirectory(
    directoryPath: string,
    cachedGroup: import("../domain/types").PrefixGroup
  ): Promise<TreeNode[]> {
    // ディレクトリエントリを読み取ってディレクトリノードを生成
    const dirUri = vscode.Uri.file(directoryPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      // 読み取りエラー時はプレフィックスグループのみ返す
      return convertPrefixGroupToTreeNodes(cachedGroup, directoryPath);
    }

    const directoryNodes: TreeNode[] = [];
    for (const [name, fileType] of entries) {
      if (fileType === vscode.FileType.Directory) {
        directoryNodes.push({
          kind: TreeNodeKind.Directory,
          label: name,
          resourceUri: vscode.Uri.joinPath(dirUri, name),
          directoryPath: vscode.Uri.joinPath(dirUri, name).fsPath,
        });
      }
    }

    const prefixNodes = convertPrefixGroupToTreeNodes(
      cachedGroup,
      directoryPath
    );
    return [...directoryNodes, ...prefixNodes];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

/**
 * ExplorerNavigator ユニットテスト
 *
 * エクスプローラーとPrefixFold TreeView間の相互ナビゲーションを検証する。
 * - showInPrefixFold: エクスプローラーからPrefixFoldへのナビゲーション
 * - revealInExplorer: PrefixFoldからエクスプローラーへのナビゲーション
 * - 仮想フォルダの場合は所属する実ディレクトリのURIを使用する
 *
 * 検証対象: 要件 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vscodeモジュールのモック
const { MockUri, mockExecuteCommand } = vi.hoisted(() => {
  class MockUri {
    readonly scheme: string = "file";
    readonly path: string;
    readonly fsPath: string;

    constructor(filePath: string) {
      this.path = filePath;
      this.fsPath = filePath;
    }

    static file(filePath: string): MockUri {
      return new MockUri(filePath);
    }

    static joinPath(base: MockUri, ...pathSegments: string[]): MockUri {
      const joined = base.fsPath + "/" + pathSegments.join("/");
      return new MockUri(joined);
    }
  }

  const mockExecuteCommand = vi.fn().mockResolvedValue(undefined);

  return {
    MockUri,
    mockExecuteCommand,
  };
});

vi.mock("vscode", () => ({
  Uri: MockUri,
  commands: {
    executeCommand: mockExecuteCommand,
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
}));

import { ExplorerNavigator } from "../../application/explorerNavigator";
import { TreeNodeKind } from "../../presentation/types";
import type { TreeNode } from "../../presentation/types";

// ===== ヘルパー =====

/** ファイルTreeNodeを生成する */
function createFileNode(
  fileName: string,
  directoryPath: string
): TreeNode {
  return {
    kind: TreeNodeKind.File,
    label: fileName,
    resourceUri: MockUri.file(`${directoryPath}/${fileName}`) as any,
    directoryPath,
  };
}

/** ディレクトリTreeNodeを生成する */
function createDirectoryNode(
  name: string,
  directoryPath: string
): TreeNode {
  const fullPath = `${directoryPath}/${name}`;
  return {
    kind: TreeNodeKind.Directory,
    label: name,
    resourceUri: MockUri.file(fullPath) as any,
    directoryPath: fullPath,
  };
}

/** 仮想フォルダTreeNodeを生成する */
function createVirtualFolderNode(
  prefix: string,
  directoryPath: string,
  fileCount: number
): TreeNode {
  return {
    kind: TreeNodeKind.VirtualFolder,
    label: `${prefix} (${fileCount})`,
    prefix,
    directoryPath,
    children: [],
    fileCount,
  };
}

// ===== テスト =====

describe("ExplorerNavigator", () => {
  let navigator: ExplorerNavigator;

  beforeEach(() => {
    vi.clearAllMocks();
    navigator = new ExplorerNavigator();
  });

  describe("showInPrefixFold（要件 7.1）", () => {
    it("PrefixFold TreeViewパネルをフォーカスするコマンドを実行する", async () => {
      const dirUri = MockUri.file("/workspace/src") as any;

      await navigator.showInPrefixFold(dirUri);

      expect(mockExecuteCommand).toHaveBeenCalledWith("prefixFoldView.focus");
    });

    it("ルートディレクトリのURIでも正しく動作する", async () => {
      const dirUri = MockUri.file("/workspace") as any;

      await navigator.showInPrefixFold(dirUri);

      expect(mockExecuteCommand).toHaveBeenCalledWith("prefixFoldView.focus");
    });
  });

  describe("revealInExplorer - ファイル（要件 7.2）", () => {
    it("ファイルノードのresourceUriでrevealInExplorerコマンドを実行する", async () => {
      const fileNode = createFileNode("app.ts", "/workspace/src");

      await navigator.revealInExplorer(fileNode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/app.ts" })
      );
    });

    it("ネストされたディレクトリ内のファイルでも正しく動作する", async () => {
      const fileNode = createFileNode("index.ts", "/workspace/src/components");

      await navigator.revealInExplorer(fileNode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/components/index.ts",
        })
      );
    });
  });

  describe("revealInExplorer - ディレクトリ（要件 7.3）", () => {
    it("ディレクトリノードのresourceUriでrevealInExplorerコマンドを実行する", async () => {
      const dirNode = createDirectoryNode("components", "/workspace/src");

      await navigator.revealInExplorer(dirNode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/components" })
      );
    });
  });

  describe("revealInExplorer - 仮想フォルダ（要件 7.4）", () => {
    it("仮想フォルダの場合、所属する実ディレクトリのURIでrevealInExplorerコマンドを実行する", async () => {
      const virtualNode = createVirtualFolderNode(
        "btn-",
        "/workspace/src",
        3
      );

      await navigator.revealInExplorer(virtualNode);

      // 仮想フォルダのdirectoryPath（所属ディレクトリ）のURIが使われる
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src" })
      );
    });

    it("ネストされたディレクトリ内の仮想フォルダでも正しく動作する", async () => {
      const virtualNode = createVirtualFolderNode(
        "aaa-",
        "/workspace/src/deep/nested",
        5
      );

      await navigator.revealInExplorer(virtualNode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/deep/nested" })
      );
    });
  });

  describe("revealInExplorer - WorkspaceRootノード", () => {
    it("WorkspaceRootノードの場合、revealInExplorerコマンドは実行されない", async () => {
      const rootNode: TreeNode = {
        kind: TreeNodeKind.WorkspaceRoot,
        label: "my-project",
        resourceUri: MockUri.file("/workspace") as any,
        directoryPath: "/workspace",
      };

      await navigator.revealInExplorer(rootNode);

      // WorkspaceRootはresolveUriでundefinedを返すため、コマンドは実行されない
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });
  });

  describe("setTreeView", () => {
    it("TreeViewインスタンスを設定できる", () => {
      const mockTreeView = {
        reveal: vi.fn(),
        dispose: vi.fn(),
      } as any;

      // エラーなく設定できることを確認
      expect(() => navigator.setTreeView(mockTreeView)).not.toThrow();
    });
  });

  describe("dispose", () => {
    it("disposeを呼び出してもエラーが発生しない", () => {
      expect(() => navigator.dispose()).not.toThrow();
    });

    it("TreeView設定後にdisposeしてもエラーが発生しない", () => {
      const mockTreeView = {
        reveal: vi.fn(),
        dispose: vi.fn(),
      } as any;

      navigator.setTreeView(mockTreeView);
      expect(() => navigator.dispose()).not.toThrow();
    });
  });
});

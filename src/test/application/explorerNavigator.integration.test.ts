/**
 * ExplorerNavigator インテグレーションテスト
 *
 * エクスプローラーとPrefixFold TreeView間の相互ナビゲーションフローを
 * リアルなTreeNode構造を使って検証する。
 *
 * - エクスプローラーからPrefixFoldへのナビゲーション（要件 7.1）
 * - PrefixFoldからエクスプローラーへのナビゲーション - ファイル（要件 7.2）
 * - PrefixFoldからエクスプローラーへのナビゲーション - ディレクトリ（要件 7.3）
 * - PrefixFoldからエクスプローラーへのナビゲーション - 仮想フォルダ（要件 7.4）
 * - エンドツーエンドフロー（複数ノードタイプの一括検証）
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

// ===== リアルなTreeNode構造を構築するヘルパー =====

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
  parentPath: string,
  children?: TreeNode[]
): TreeNode {
  const fullPath = `${parentPath}/${name}`;
  return {
    kind: TreeNodeKind.Directory,
    label: name,
    resourceUri: MockUri.file(fullPath) as any,
    directoryPath: fullPath,
    children,
  };
}

/** 仮想フォルダTreeNodeを生成する（子ファイルノード付き） */
function createVirtualFolderNode(
  prefix: string,
  directoryPath: string,
  childFileNames: string[]
): TreeNode {
  const children = childFileNames.map((name) =>
    createFileNode(name, directoryPath)
  );
  return {
    kind: TreeNodeKind.VirtualFolder,
    label: `${prefix} (${childFileNames.length})`,
    prefix,
    directoryPath,
    children,
    fileCount: childFileNames.length,
  };
}

/**
 * リアルなプロジェクト構造を模したTreeNodeツリーを構築する
 *
 * 構造:
 *   /workspace/src/
 *     ├── components/
 *     │   ├── btn-primary.ts
 *     │   ├── btn-secondary.ts
 *     │   ├── btn-danger.ts
 *     │   ├── input-text.ts
 *     │   └── input-number.ts
 *     ├── utils/
 *     │   ├── format-date.ts
 *     │   └── format-number.ts
 *     └── index.ts
 *
 * PrefixFold表示:
 *   /workspace/src/
 *     ├── [仮想] btn- (3)
 *     │   ├── primary.ts
 *     │   ├── secondary.ts
 *     │   └── danger.ts
 *     ├── [仮想] input- (2)
 *     │   ├── text.ts
 *     │   └── number.ts
 *     ├── [ディレクトリ] utils/
 *     │   ├── [仮想] format- (2)
 *     │   │   ├── date.ts
 *     │   │   └── number.ts
 *     └── index.ts
 */
function buildRealisticTreeStructure(): {
  btnVirtualFolder: TreeNode;
  inputVirtualFolder: TreeNode;
  utilsDirectory: TreeNode;
  formatVirtualFolder: TreeNode;
  indexFile: TreeNode;
  allNodes: TreeNode[];
} {
  const basePath = "/workspace/src/components";
  const utilsPath = "/workspace/src/utils";
  const srcPath = "/workspace/src";

  // 仮想フォルダ: btn- グループ
  const btnVirtualFolder = createVirtualFolderNode("btn-", basePath, [
    "btn-primary.ts",
    "btn-secondary.ts",
    "btn-danger.ts",
  ]);

  // 仮想フォルダ: input- グループ
  const inputVirtualFolder = createVirtualFolderNode("input-", basePath, [
    "input-text.ts",
    "input-number.ts",
  ]);

  // 仮想フォルダ: format- グループ（utils内）
  const formatVirtualFolder = createVirtualFolderNode("format-", utilsPath, [
    "format-date.ts",
    "format-number.ts",
  ]);

  // ディレクトリ: utils/
  const utilsDirectory = createDirectoryNode("utils", srcPath, [
    formatVirtualFolder,
  ]);

  // ファイル: index.ts（グループ化されないファイル）
  const indexFile = createFileNode("index.ts", srcPath);

  return {
    btnVirtualFolder,
    inputVirtualFolder,
    utilsDirectory,
    formatVirtualFolder,
    indexFile,
    allNodes: [
      btnVirtualFolder,
      inputVirtualFolder,
      utilsDirectory,
      formatVirtualFolder,
      indexFile,
    ],
  };
}

// ===== テスト =====

describe("ExplorerNavigator インテグレーションテスト", () => {
  let navigator: ExplorerNavigator;

  beforeEach(() => {
    vi.clearAllMocks();
    navigator = new ExplorerNavigator();
  });

  // --- 要件 7.1: エクスプローラーからPrefixFoldへのナビゲーション ---
  describe("エクスプローラーからPrefixFoldへのナビゲーション（要件 7.1）", () => {
    it("ルートディレクトリURIでPrefixFoldパネルをフォーカスする", async () => {
      const dirUri = MockUri.file("/workspace") as any;

      await navigator.showInPrefixFold(dirUri);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith("prefixFoldView.focus");
    });

    it("サブディレクトリURIでPrefixFoldパネルをフォーカスする", async () => {
      const dirUri = MockUri.file("/workspace/src") as any;

      await navigator.showInPrefixFold(dirUri);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith("prefixFoldView.focus");
    });

    it("深くネストされたディレクトリURIでも正しく動作する", async () => {
      const dirUri = MockUri.file(
        "/workspace/src/components/deep/nested/path"
      ) as any;

      await navigator.showInPrefixFold(dirUri);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith("prefixFoldView.focus");
    });

    it("複数回連続で呼び出しても各回でコマンドが実行される", async () => {
      const dirs = [
        MockUri.file("/workspace/src") as any,
        MockUri.file("/workspace/lib") as any,
        MockUri.file("/workspace/test") as any,
      ];

      for (const dirUri of dirs) {
        await navigator.showInPrefixFold(dirUri);
      }

      expect(mockExecuteCommand).toHaveBeenCalledTimes(3);
      // すべての呼び出しでprefixFoldView.focusが実行される
      for (let i = 0; i < 3; i++) {
        expect(mockExecuteCommand).toHaveBeenNthCalledWith(
          i + 1,
          "prefixFoldView.focus"
        );
      }
    });
  });

  // --- 要件 7.2: PrefixFoldからエクスプローラーへのナビゲーション - ファイル ---
  describe("PrefixFoldからエクスプローラーへのナビゲーション - ファイル（要件 7.2）", () => {
    it("仮想フォルダ内のファイルノードで正しいURIを使ってrevealInExplorerを実行する", async () => {
      const { btnVirtualFolder } = buildRealisticTreeStructure();
      // 仮想フォルダ内の最初のファイル（btn-primary.ts）
      const fileNode = btnVirtualFolder.children![0];

      await navigator.revealInExplorer(fileNode);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/components/btn-primary.ts",
        })
      );
    });

    it("別の仮想フォルダ内のファイルノードでも正しいURIが使われる", async () => {
      const { inputVirtualFolder } = buildRealisticTreeStructure();
      // input-text.ts
      const fileNode = inputVirtualFolder.children![0];

      await navigator.revealInExplorer(fileNode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/components/input-text.ts",
        })
      );
    });

    it("ネストされたディレクトリ内の仮想フォルダのファイルでも正しく動作する", async () => {
      const { formatVirtualFolder } = buildRealisticTreeStructure();
      // format-date.ts（utils/内の仮想フォルダ）
      const fileNode = formatVirtualFolder.children![0];

      await navigator.revealInExplorer(fileNode);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/utils/format-date.ts",
        })
      );
    });

    it("グループ化されていないファイルでも正しく動作する", async () => {
      const { indexFile } = buildRealisticTreeStructure();

      await navigator.revealInExplorer(indexFile);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/index.ts",
        })
      );
    });
  });

  // --- 要件 7.3: PrefixFoldからエクスプローラーへのナビゲーション - ディレクトリ ---
  describe("PrefixFoldからエクスプローラーへのナビゲーション - ディレクトリ（要件 7.3）", () => {
    it("ディレクトリノードのresourceUriでrevealInExplorerを実行する", async () => {
      const { utilsDirectory } = buildRealisticTreeStructure();

      await navigator.revealInExplorer(utilsDirectory);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/utils",
        })
      );
    });

    it("深くネストされたディレクトリノードでも正しく動作する", async () => {
      const deepDir = createDirectoryNode(
        "deeply-nested",
        "/workspace/src/a/b/c"
      );

      await navigator.revealInExplorer(deepDir);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/a/b/c/deeply-nested",
        })
      );
    });
  });

  // --- 要件 7.4: PrefixFoldからエクスプローラーへのナビゲーション - 仮想フォルダ ---
  describe("PrefixFoldからエクスプローラーへのナビゲーション - 仮想フォルダ（要件 7.4）", () => {
    it("仮想フォルダの場合、所属する実ディレクトリのURIでrevealInExplorerを実行する", async () => {
      const { btnVirtualFolder } = buildRealisticTreeStructure();

      await navigator.revealInExplorer(btnVirtualFolder);

      // 仮想フォルダ自体ではなく、所属ディレクトリ（/workspace/src/components）のURIが使われる
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/components",
        })
      );
    });

    it("別の仮想フォルダでも所属ディレクトリのURIが使われる", async () => {
      const { inputVirtualFolder } = buildRealisticTreeStructure();

      await navigator.revealInExplorer(inputVirtualFolder);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/components",
        })
      );
    });

    it("ネストされたディレクトリ内の仮想フォルダでも所属ディレクトリのURIが使われる", async () => {
      const { formatVirtualFolder } = buildRealisticTreeStructure();

      await navigator.revealInExplorer(formatVirtualFolder);

      // format-仮想フォルダの所属ディレクトリは /workspace/src/utils
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/utils",
        })
      );
    });

    it("仮想フォルダのresourceUriではなくdirectoryPathベースのURIが使われることを確認する", async () => {
      // resourceUriを持たない仮想フォルダ（通常の仮想フォルダはresourceUriを持たない）
      const virtualFolder = createVirtualFolderNode(
        "test-",
        "/workspace/src/special",
        ["test-a.ts", "test-b.ts"]
      );

      await navigator.revealInExplorer(virtualFolder);

      // directoryPathから生成されたURIが使われる
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/special",
        })
      );
    });
  });

  // --- エンドツーエンドフロー ---
  describe("エンドツーエンドフロー: 複数ノードタイプの一括ナビゲーション", () => {
    it("すべてのノードタイプからエクスプローラーへのナビゲーションが正しいURIを使用する", async () => {
      const {
        btnVirtualFolder,
        inputVirtualFolder,
        utilsDirectory,
        formatVirtualFolder,
        indexFile,
      } = buildRealisticTreeStructure();

      // 1. 仮想フォルダ（btn-）→ 所属ディレクトリのURI
      await navigator.revealInExplorer(btnVirtualFolder);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/components" })
      );

      // 2. 仮想フォルダ内のファイル（btn-primary.ts）→ ファイルのURI
      await navigator.revealInExplorer(btnVirtualFolder.children![0]);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/components/btn-primary.ts",
        })
      );

      // 3. 別の仮想フォルダ（input-）→ 所属ディレクトリのURI
      await navigator.revealInExplorer(inputVirtualFolder);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/components" })
      );

      // 4. ディレクトリ（utils/）→ ディレクトリのURI
      await navigator.revealInExplorer(utilsDirectory);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/utils" })
      );

      // 5. ネストされた仮想フォルダ（format-）→ 所属ディレクトリのURI
      await navigator.revealInExplorer(formatVirtualFolder);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/utils" })
      );

      // 6. ネストされた仮想フォルダ内のファイル（format-date.ts）→ ファイルのURI
      await navigator.revealInExplorer(formatVirtualFolder.children![0]);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({
          fsPath: "/workspace/src/utils/format-date.ts",
        })
      );

      // 7. グループ化されていないファイル（index.ts）→ ファイルのURI
      await navigator.revealInExplorer(indexFile);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/index.ts" })
      );

      // 合計呼び出し回数: 7回（各ノードタイプに1回ずつ）
      expect(mockExecuteCommand).toHaveBeenCalledTimes(7);
    });

    it("showInPrefixFoldとrevealInExplorerを交互に呼び出しても正しく動作する", async () => {
      const { btnVirtualFolder, indexFile } = buildRealisticTreeStructure();

      // エクスプローラー → PrefixFold
      await navigator.showInPrefixFold(
        MockUri.file("/workspace/src/components") as any
      );
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "prefixFoldView.focus"
      );

      // PrefixFold → エクスプローラー（ファイル）
      await navigator.revealInExplorer(indexFile);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/index.ts" })
      );

      // エクスプローラー → PrefixFold（別のディレクトリ）
      await navigator.showInPrefixFold(
        MockUri.file("/workspace/src/utils") as any
      );
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "prefixFoldView.focus"
      );

      // PrefixFold → エクスプローラー（仮想フォルダ）
      await navigator.revealInExplorer(btnVirtualFolder);
      expect(mockExecuteCommand).toHaveBeenLastCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: "/workspace/src/components" })
      );

      // 合計4回のコマンド実行
      expect(mockExecuteCommand).toHaveBeenCalledTimes(4);
    });

    it("WorkspaceRootノードではrevealInExplorerコマンドが実行されない", async () => {
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
});

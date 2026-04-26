/**
 * PrefixTreeDataProvider ユニットテスト
 *
 * マルチルートワークスペース対応、キャッシュヒット時の再解析回避、
 * refresh呼び出し時のキャッシュ無効化、ワークスペース未オープン時の動作を検証する。
 *
 * 検証対象: 要件 6.3, 8.3
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vscodeモジュールとドメイン関数のモック（vi.hoisted + vi.mock パターン）
const {
  MockUri,
  MockThemeIcon,
  MockTreeItem,
  MockEventEmitter,
  mockWorkspaceFolders,
  mockReadDirectory,
  mockWithProgress,
  mockAnalyze,
} = vi.hoisted(() => {
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

  class MockThemeIcon {
    constructor(public readonly id: string) {}
  }

  class MockTreeItem {
    label: string;
    collapsibleState: number;
    iconPath?: MockThemeIcon;
    resourceUri?: MockUri;
    contextValue?: string;
    command?: { command: string; title: string; arguments?: unknown[] };
    description?: string;

    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class MockEventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          this.listeners = this.listeners.filter((l) => l !== listener);
        },
      };
    };
    fire(data: T) {
      this.listeners.forEach((l) => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  }

  // ワークスペースフォルダのモック（テストごとに差し替え可能）
  const mockWorkspaceFolders: { value: any[] | undefined } = { value: undefined };

  // readDirectoryのモック
  const mockReadDirectory = vi.fn();

  // withProgressのモック
  const mockWithProgress = vi.fn();

  // analyze関数のモック
  const mockAnalyze = vi.fn();

  return {
    MockUri,
    MockThemeIcon,
    MockTreeItem,
    MockEventEmitter,
    mockWorkspaceFolders,
    mockReadDirectory,
    mockWithProgress,
    mockAnalyze,
  };
});

vi.mock("vscode", () => ({
  Uri: MockUri,
  ThemeIcon: MockThemeIcon,
  TreeItem: MockTreeItem,
  EventEmitter: MockEventEmitter,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  ProgressLocation: {
    Notification: 15,
  },
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders.value;
    },
    fs: {
      readDirectory: mockReadDirectory,
    },
  },
  window: {
    withProgress: mockWithProgress,
  },
}));

vi.mock("../../../src/domain/prefixAnalyzer", () => ({
  analyze: mockAnalyze,
}));

import { PrefixTreeDataProvider } from "../../presentation/prefixTreeDataProvider";
import { CacheManager } from "../../infrastructure/cacheManager";
import { ConfigManager } from "../../application/configManager";
import { TreeNodeKind } from "../../presentation/types";
import type { PrefixGroup } from "../../domain/types";

// ===== ヘルパー =====

/** ワークスペースフォルダのモックを生成する */
function createWorkspaceFolder(name: string, fsPath: string) {
  return {
    uri: MockUri.file(fsPath) as any,
    name,
    index: 0,
  };
}

/** デフォルトのPrefixGroupを生成する */
function createDefaultPrefixGroup(): PrefixGroup {
  return {
    prefix: "",
    files: [],
    children: [
      {
        prefix: "aaa-",
        files: ["aaa-one.ts", "aaa-two.ts"],
        children: [],
        ungroupedFiles: [],
      },
    ],
    ungroupedFiles: ["readme.md"],
  };
}

/** デフォルトの設定を返すConfigManagerモックを生成する */
function createMockConfigManager(): ConfigManager {
  return {
    getConfig: vi.fn().mockReturnValue({
      delimiters: ["-"],
      minGroupSize: 2,
      excludePatterns: [],
      camelCaseSplit: false,
    }),
    onDidChangeConfig: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ConfigManager;
}

/** readDirectoryのデフォルトレスポンスを設定する */
function setupReadDirectory(entries: [string, number][]) {
  mockReadDirectory.mockResolvedValue(entries);
}

// ===== テスト =====

describe("PrefixTreeDataProvider", () => {
  let cacheManager: CacheManager;
  let configManager: ConfigManager;
  let provider: PrefixTreeDataProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = new CacheManager();
    configManager = createMockConfigManager();
    provider = new PrefixTreeDataProvider(cacheManager, configManager);

    // デフォルト: analyze関数はデフォルトのPrefixGroupを返す
    mockAnalyze.mockReturnValue(createDefaultPrefixGroup());

    // デフォルト: readDirectoryはファイルのみ返す
    setupReadDirectory([
      ["aaa-one.ts", 1], // FileType.File = 1
      ["aaa-two.ts", 1],
      ["readme.md", 1],
    ]);

    // デフォルト: withProgressはコールバックを即座に実行する
    mockWithProgress.mockImplementation(async (_opts: any, task: any) => {
      return task({ report: vi.fn() });
    });
  });

  describe("マルチルートワークスペース（要件 6.3）", () => {
    it("複数のルートフォルダがある場合、WorkspaceRootノードを各フォルダに対して返す", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project-a", "/workspace/project-a"),
        createWorkspaceFolder("project-b", "/workspace/project-b"),
      ];

      const children = await provider.getChildren(undefined);

      expect(children).toHaveLength(2);
      expect(children[0].kind).toBe(TreeNodeKind.WorkspaceRoot);
      expect(children[0].label).toBe("project-a");
      expect(children[0].directoryPath).toBe("/workspace/project-a");
      expect(children[1].kind).toBe(TreeNodeKind.WorkspaceRoot);
      expect(children[1].label).toBe("project-b");
      expect(children[1].directoryPath).toBe("/workspace/project-b");
    });

    it("3つ以上のルートフォルダがある場合も正しくWorkspaceRootノードを返す", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("alpha", "/ws/alpha"),
        createWorkspaceFolder("beta", "/ws/beta"),
        createWorkspaceFolder("gamma", "/ws/gamma"),
      ];

      const children = await provider.getChildren(undefined);

      expect(children).toHaveLength(3);
      children.forEach((child) => {
        expect(child.kind).toBe(TreeNodeKind.WorkspaceRoot);
      });
      expect(children[0].label).toBe("alpha");
      expect(children[1].label).toBe("beta");
      expect(children[2].label).toBe("gamma");
    });
  });

  describe("シングルルートワークスペース", () => {
    it("単一ルートフォルダの場合、解析結果のTreeNodeを直接返す（WorkspaceRootなし）", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("my-project", "/workspace/my-project"),
      ];

      const children = await provider.getChildren(undefined);

      // WorkspaceRootノードではなく、解析結果のノードが直接返される
      expect(
        children.every((c) => c.kind !== TreeNodeKind.WorkspaceRoot)
      ).toBe(true);
      // 仮想フォルダ + ファイルが含まれる
      expect(children.length).toBeGreaterThan(0);
    });
  });

  describe("キャッシュヒット時の再解析回避（要件 8.3）", () => {
    it("CacheManagerにキャッシュがある場合、analyze関数が呼ばれない", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace/project"),
      ];

      // キャッシュにデータをセット
      const cachedGroup = createDefaultPrefixGroup();
      cacheManager.set("/workspace/project", cachedGroup);

      await provider.getChildren(undefined);

      // analyze関数が呼ばれていないことを確認
      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it("キャッシュヒット時でもTreeNodeが正しく構築される", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace/project"),
      ];

      const cachedGroup: PrefixGroup = {
        prefix: "",
        files: [],
        children: [
          {
            prefix: "btn-",
            files: ["btn-primary.ts", "btn-secondary.ts"],
            children: [],
            ungroupedFiles: [],
          },
        ],
        ungroupedFiles: ["index.ts"],
      };
      cacheManager.set("/workspace/project", cachedGroup);

      const children = await provider.getChildren(undefined);

      // ディレクトリノード + 仮想フォルダ + ファイルが返される
      const virtualFolders = children.filter(
        (c) => c.kind === TreeNodeKind.VirtualFolder
      );
      const fileNodes = children.filter((c) => c.kind === TreeNodeKind.File);
      expect(virtualFolders.length).toBeGreaterThanOrEqual(1);
      expect(fileNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("キャッシュミス時の解析とキャッシュ保存", () => {
    it("キャッシュミス時にanalyze関数が呼ばれる", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace/project"),
      ];

      await provider.getChildren(undefined);

      expect(mockAnalyze).toHaveBeenCalledTimes(1);
    });

    it("キャッシュミス時にCacheManager.setが呼ばれて結果が保存される", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace/project"),
      ];

      const setSpy = vi.spyOn(cacheManager, "set");

      await provider.getChildren(undefined);

      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(setSpy).toHaveBeenCalledWith(
        "/workspace/project",
        expect.objectContaining({ prefix: "" })
      );
    });
  });

  describe("refresh 呼び出し時のキャッシュ無効化（要件 8.3）", () => {
    it("refresh()呼び出し時にCacheManager.clear()が呼ばれる", () => {
      const clearSpy = vi.spyOn(cacheManager, "clear");

      provider.refresh();

      expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    it("refresh()呼び出し時にonDidChangeTreeDataが発火される", () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      provider.refresh();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("refresh()後の再取得でanalyze関数が再度呼ばれる（キャッシュがクリアされたため）", async () => {
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace/project"),
      ];

      // 初回取得でキャッシュが作成される
      await provider.getChildren(undefined);
      expect(mockAnalyze).toHaveBeenCalledTimes(1);

      // refreshでキャッシュをクリア
      provider.refresh();

      // 再取得でanalyzeが再度呼ばれる
      await provider.getChildren(undefined);
      expect(mockAnalyze).toHaveBeenCalledTimes(2);
    });
  });

  describe("ワークスペース未オープン時", () => {
    it("workspaceFoldersがundefinedの場合、空配列を返す", async () => {
      mockWorkspaceFolders.value = undefined;

      const children = await provider.getChildren(undefined);

      expect(children).toEqual([]);
    });

    it("workspaceFoldersが空配列の場合、空配列を返す", async () => {
      mockWorkspaceFolders.value = [];

      const children = await provider.getChildren(undefined);

      expect(children).toEqual([]);
    });
  });

  describe("VirtualFolder の子ノード取得", () => {
    beforeEach(() => {
      // ワークスペースが開かれている状態にする
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace"),
      ];
    });

    it("VirtualFolderノードのgetChildrenは子ノード配列を返す", async () => {
      const childNodes: import("../../presentation/types").TreeNode[] = [
        {
          kind: TreeNodeKind.File,
          label: "one.ts",
          directoryPath: "/workspace",
        },
        {
          kind: TreeNodeKind.File,
          label: "two.ts",
          directoryPath: "/workspace",
        },
      ];

      const virtualFolder: import("../../presentation/types").TreeNode = {
        kind: TreeNodeKind.VirtualFolder,
        label: "aaa- (2)",
        prefix: "aaa-",
        directoryPath: "/workspace",
        children: childNodes,
        fileCount: 2,
      };

      const children = await provider.getChildren(virtualFolder);

      expect(children).toHaveLength(2);
      expect(children[0].label).toBe("one.ts");
      expect(children[1].label).toBe("two.ts");
    });

    it("VirtualFolderノードにchildrenがない場合、空配列を返す", async () => {
      const virtualFolder: import("../../presentation/types").TreeNode = {
        kind: TreeNodeKind.VirtualFolder,
        label: "aaa- (0)",
        prefix: "aaa-",
        directoryPath: "/workspace",
        fileCount: 0,
      };

      const children = await provider.getChildren(virtualFolder);

      expect(children).toEqual([]);
    });
  });

  describe("File の子ノード取得", () => {
    beforeEach(() => {
      // ワークスペースが開かれている状態にする
      mockWorkspaceFolders.value = [
        createWorkspaceFolder("project", "/workspace"),
      ];
    });

    it("FileノードのgetChildrenは空配列を返す", async () => {
      const fileNode = {
        kind: TreeNodeKind.File,
        label: "file.ts",
        directoryPath: "/workspace",
      };

      const children = await provider.getChildren(fileNode);

      expect(children).toEqual([]);
    });
  });
});

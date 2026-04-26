/**
 * 拡張機能全体のインテグレーションテスト
 *
 * activate関数を包括的なvscodeモックで呼び出し、
 * 各コンポーネントが正しく接続されていることを検証する。
 *
 * - 拡張機能のアクティベーション確認
 * - 設定変更時のTreeView再描画確認（要件 5.3）
 * - 手動リフレッシュコマンドの動作確認
 * - FileSystemWatcher の初期化確認
 * - Disposable の登録確認
 *
 * 検証対象: 要件 5.3, 6.2
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vscodeモジュールの包括的モック（vi.hoisted + vi.mock パターン）
const {
  MockUri,
  MockThemeIcon,
  MockTreeItem,
  MockEventEmitter,
  mockCreateTreeView,
  mockRegisterCommand,
  mockCreateFileSystemWatcher,
  mockOnDidChangeConfiguration,
  mockGetConfiguration,
  mockShowWarningMessage,
  mockWithProgress,
  mockReadDirectory,
  mockExecuteCommand,
  mockWorkspaceFolders,
  registeredCommands,
  configChangeListeners,
  fileWatcherHandlers,
  resetAll,
} = vi.hoisted(() => {
  // --- 基本クラスモック ---

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

  // --- 登録済みコマンドとリスナーの追跡 ---

  const registeredCommands: Map<string, (...args: any[]) => any> = new Map();

  type ConfigChangeListener = (e: {
    affectsConfiguration: (section: string) => boolean;
  }) => void;
  const configChangeListeners: ConfigChangeListener[] = [];

  const fileWatcherHandlers: {
    onCreate: ((uri: any) => void) | null;
    onDelete: ((uri: any) => void) | null;
    onChange: ((uri: any) => void) | null;
  } = {
    onCreate: null,
    onDelete: null,
    onChange: null,
  };

  // --- モック関数 ---

  const mockGet = vi.fn().mockImplementation((_key: string, defaultValue: unknown) => defaultValue);
  const mockGetConfiguration = vi.fn(() => ({ get: mockGet }));

  const mockOnDidChangeConfiguration = vi.fn((listener: ConfigChangeListener) => {
    configChangeListeners.push(listener);
    return { dispose: vi.fn() };
  });

  const mockCreateTreeView = vi.fn().mockImplementation((_viewId: string, _options: any) => ({
    dispose: vi.fn(),
    reveal: vi.fn(),
    onDidChangeSelection: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCollapseElement: vi.fn(() => ({ dispose: vi.fn() })),
    onDidExpandElement: vi.fn(() => ({ dispose: vi.fn() })),
  }));

  const mockRegisterCommand = vi.fn().mockImplementation((commandId: string, handler: (...args: any[]) => any) => {
    registeredCommands.set(commandId, handler);
    return { dispose: vi.fn() };
  });

  const mockCreateFileSystemWatcher = vi.fn().mockImplementation(() => ({
    onDidCreate: (handler: (uri: any) => void) => {
      fileWatcherHandlers.onCreate = handler;
      return { dispose: vi.fn() };
    },
    onDidDelete: (handler: (uri: any) => void) => {
      fileWatcherHandlers.onDelete = handler;
      return { dispose: vi.fn() };
    },
    onDidChange: (handler: (uri: any) => void) => {
      fileWatcherHandlers.onChange = handler;
      return { dispose: vi.fn() };
    },
    dispose: vi.fn(),
  }));

  const mockShowWarningMessage = vi.fn();
  const mockWithProgress = vi.fn().mockImplementation(async (_opts: any, task: any) => {
    return task({ report: vi.fn() });
  });
  const mockReadDirectory = vi.fn().mockResolvedValue([]);
  const mockExecuteCommand = vi.fn().mockResolvedValue(undefined);

  const mockWorkspaceFolders: { value: any[] | undefined } = { value: undefined };

  // --- リセット関数 ---

  function resetAll() {
    registeredCommands.clear();
    configChangeListeners.length = 0;
    fileWatcherHandlers.onCreate = null;
    fileWatcherHandlers.onDelete = null;
    fileWatcherHandlers.onChange = null;
    mockWorkspaceFolders.value = undefined;
  }

  return {
    MockUri,
    MockThemeIcon,
    MockTreeItem,
    MockEventEmitter,
    mockCreateTreeView,
    mockRegisterCommand,
    mockCreateFileSystemWatcher,
    mockOnDidChangeConfiguration,
    mockGetConfiguration,
    mockShowWarningMessage,
    mockWithProgress,
    mockReadDirectory,
    mockExecuteCommand,
    mockWorkspaceFolders,
    registeredCommands,
    configChangeListeners,
    fileWatcherHandlers,
    resetAll,
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
    getConfiguration: mockGetConfiguration,
    onDidChangeConfiguration: mockOnDidChangeConfiguration,
    createFileSystemWatcher: mockCreateFileSystemWatcher,
    fs: {
      readDirectory: mockReadDirectory,
    },
  },
  window: {
    createTreeView: mockCreateTreeView,
    showWarningMessage: mockShowWarningMessage,
    withProgress: mockWithProgress,
  },
  commands: {
    registerCommand: mockRegisterCommand,
    executeCommand: mockExecuteCommand,
  },
}));

import { activate } from "../extension";

// ===== ヘルパー =====

/** モックの ExtensionContext を生成する */
function createMockExtensionContext() {
  const subscriptions: { dispose: () => void }[] = [];
  return {
    subscriptions,
    extensionPath: "/mock/extension/path",
    extensionUri: MockUri.file("/mock/extension/path"),
    globalState: { get: vi.fn(), update: vi.fn() },
    workspaceState: { get: vi.fn(), update: vi.fn() },
    storagePath: "/mock/storage",
    globalStoragePath: "/mock/global-storage",
    logPath: "/mock/log",
    extensionMode: 1,
  } as any;
}

// ===== テスト =====

describe("拡張機能全体のインテグレーションテスト", () => {
  let mockContext: ReturnType<typeof createMockExtensionContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAll();
    mockContext = createMockExtensionContext();
  });

  describe("拡張機能のアクティベーション確認", () => {
    it("activate呼び出しでvscode.window.createTreeViewが'prefixFoldView'で呼ばれる", () => {
      activate(mockContext);

      expect(mockCreateTreeView).toHaveBeenCalledTimes(1);
      expect(mockCreateTreeView).toHaveBeenCalledWith(
        "prefixFoldView",
        expect.objectContaining({
          showCollapseAll: true,
        })
      );
    });

    it("activate呼び出しでcreateTreeViewにtreeDataProviderが渡される", () => {
      activate(mockContext);

      const callArgs = mockCreateTreeView.mock.calls[0];
      expect(callArgs[1]).toHaveProperty("treeDataProvider");
      // treeDataProviderがgetTreeItemとgetChildrenメソッドを持つことを確認
      const provider = callArgs[1].treeDataProvider;
      expect(typeof provider.getTreeItem).toBe("function");
      expect(typeof provider.getChildren).toBe("function");
    });

    it("すべてのコマンドが登録される", () => {
      activate(mockContext);

      const expectedCommands = [
        "prefixFold.showInPrefixFold",
        "prefixFold.revealInExplorer",
        "prefixFold.refresh",
        "prefixFold.collapseAll",
      ];

      for (const cmd of expectedCommands) {
        expect(registeredCommands.has(cmd)).toBe(true);
      }
    });

    it("context.subscriptionsにDisposableが追加される", () => {
      activate(mockContext);

      expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });
  });

  describe("設定変更時のTreeView再描画確認（要件 5.3）", () => {
    it("prefixFoldセクションの設定変更でTreeViewのデータ変更イベントが発火される", () => {
      activate(mockContext);

      // TreeDataProviderのonDidChangeTreeDataイベントを監視する
      // createTreeViewに渡されたtreeDataProviderを取得
      const provider = mockCreateTreeView.mock.calls[0][1].treeDataProvider;
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      // prefixFoldセクションの設定変更をシミュレート
      const changeEvent = {
        affectsConfiguration: (section: string) => section === "prefixFold",
      };
      configChangeListeners.forEach((l) => l(changeEvent));

      // TreeViewのデータ変更イベントが発火されたことを確認
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("prefixFold以外のセクション変更ではTreeViewが再描画されない", () => {
      activate(mockContext);

      const provider = mockCreateTreeView.mock.calls[0][1].treeDataProvider;
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      // 別セクションの設定変更をシミュレート
      const changeEvent = {
        affectsConfiguration: (section: string) => section === "editor",
      };
      configChangeListeners.forEach((l) => l(changeEvent));

      // TreeViewのデータ変更イベントが発火されないことを確認
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("手動リフレッシュコマンドの動作確認", () => {
    it("prefixFold.refreshコマンド実行でTreeViewのデータ変更イベントが発火される", () => {
      activate(mockContext);

      // TreeDataProviderのonDidChangeTreeDataイベントを監視する
      const provider = mockCreateTreeView.mock.calls[0][1].treeDataProvider;
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      // refreshコマンドハンドラを実行
      const refreshHandler = registeredCommands.get("prefixFold.refresh");
      expect(refreshHandler).toBeDefined();
      refreshHandler!();

      // TreeViewのデータ変更イベントが発火されたことを確認
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("FileSystemWatcher の初期化確認", () => {
    it("activate呼び出しでcreateFileSystemWatcherが'**/*'パターンで呼ばれる", () => {
      activate(mockContext);

      expect(mockCreateFileSystemWatcher).toHaveBeenCalledTimes(1);
      expect(mockCreateFileSystemWatcher).toHaveBeenCalledWith("**/*");
    });

    it("FileSystemWatcherのイベントハンドラが登録される", () => {
      activate(mockContext);

      expect(fileWatcherHandlers.onCreate).not.toBeNull();
      expect(fileWatcherHandlers.onDelete).not.toBeNull();
      expect(fileWatcherHandlers.onChange).not.toBeNull();
    });
  });

  describe("Disposable の登録確認", () => {
    it("context.subscriptionsに期待される数のDisposableが登録される", () => {
      activate(mockContext);

      // extension.tsで登録されるDisposable:
      // 1. configManager
      // 2. dataProvider
      // 3. treeView
      // 4. fileWatcher
      // 5. explorerNavigator
      // 6. showInPrefixFoldCommand
      // 7. revealInExplorerCommand
      // 8. refreshCommand
      // 9. collapseAllCommand
      // 10. configChangeDisposable
      expect(mockContext.subscriptions.length).toBe(10);
    });

    it("すべてのDisposableがdisposeメソッドを持つ", () => {
      activate(mockContext);

      for (const disposable of mockContext.subscriptions) {
        expect(typeof disposable.dispose).toBe("function");
      }
    });
  });
});

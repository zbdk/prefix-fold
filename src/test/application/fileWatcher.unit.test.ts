/**
 * FileWatcher ユニットテスト
 *
 * FileSystemWatcher の統合、イベントハンドリング、
 * デバウンス経由の refresh 呼び出し、キャッシュ無効化、
 * フォールバックモードの動作を検証する。
 *
 * 検証対象: 要件 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vscode モジュールのモック（vi.hoisted + vi.mock パターン）
const {
  mockCreateFileSystemWatcher,
  mockShowWarningMessage,
  capturedOnDidCreate,
  capturedOnDidDelete,
  capturedOnDidChange,
  mockWatcherDispose,
} = vi.hoisted(() => {
  // イベントリスナーをキャプチャするための変数
  const capturedOnDidCreate: { handler: ((uri: any) => void) | null } = {
    handler: null,
  };
  const capturedOnDidDelete: { handler: ((uri: any) => void) | null } = {
    handler: null,
  };
  const capturedOnDidChange: { handler: ((uri: any) => void) | null } = {
    handler: null,
  };

  const mockWatcherDispose = vi.fn();

  const mockCreateFileSystemWatcher = vi.fn().mockImplementation(() => ({
    onDidCreate: (handler: (uri: any) => void) => {
      capturedOnDidCreate.handler = handler;
      return { dispose: vi.fn() };
    },
    onDidDelete: (handler: (uri: any) => void) => {
      capturedOnDidDelete.handler = handler;
      return { dispose: vi.fn() };
    },
    onDidChange: (handler: (uri: any) => void) => {
      capturedOnDidChange.handler = handler;
      return { dispose: vi.fn() };
    },
    dispose: mockWatcherDispose,
  }));

  const mockShowWarningMessage = vi.fn();

  return {
    mockCreateFileSystemWatcher,
    mockShowWarningMessage,
    capturedOnDidCreate,
    capturedOnDidDelete,
    capturedOnDidChange,
    mockWatcherDispose,
  };
});

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: mockCreateFileSystemWatcher,
  },
  window: {
    showWarningMessage: mockShowWarningMessage,
  },
}));

import { FileWatcher } from "../../application/fileWatcher";
import { Debouncer } from "../../infrastructure/debouncer";
import { CacheManager } from "../../infrastructure/cacheManager";
import type { PrefixTreeDataProvider } from "../../presentation/prefixTreeDataProvider";

// ===== ヘルパー =====

/** PrefixTreeDataProvider のモックを生成する */
function createMockDataProvider(): PrefixTreeDataProvider {
  return {
    refresh: vi.fn(),
    getTreeItem: vi.fn(),
    getChildren: vi.fn(),
    onDidChangeTreeData: vi.fn(),
    dispose: vi.fn(),
  } as unknown as PrefixTreeDataProvider;
}

/** ファイル URI のモックを生成する */
function createMockUri(filePath: string) {
  return { fsPath: filePath };
}

// ===== テスト =====

describe("FileWatcher", () => {
  let debouncer: Debouncer;
  let cacheManager: CacheManager;
  let dataProvider: PrefixTreeDataProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDidCreate.handler = null;
    capturedOnDidDelete.handler = null;
    capturedOnDidChange.handler = null;

    debouncer = new Debouncer(300);
    cacheManager = new CacheManager();
    dataProvider = createMockDataProvider();
  });

  describe("初期化", () => {
    it("FileSystemWatcher が '**/*' パターンで作成される", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);

      expect(mockCreateFileSystemWatcher).toHaveBeenCalledWith("**/*");
    });

    it("正常初期化時はフォールバックモードではない", () => {
      const watcher = new FileWatcher(debouncer, cacheManager, dataProvider);

      expect(watcher.isFallbackMode()).toBe(false);
    });

    it("3つのイベントリスナー（create, delete, change）が登録される", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);

      expect(capturedOnDidCreate.handler).toBeTypeOf("function");
      expect(capturedOnDidDelete.handler).toBeTypeOf("function");
      expect(capturedOnDidChange.handler).toBeTypeOf("function");
    });
  });

  describe("フォールバックモード（FileSystemWatcher 作成失敗時）", () => {
    it("FileSystemWatcher 作成失敗時はフォールバックモードになる", () => {
      mockCreateFileSystemWatcher.mockImplementationOnce(() => {
        throw new Error("Watcher creation failed");
      });

      const watcher = new FileWatcher(debouncer, cacheManager, dataProvider);

      expect(watcher.isFallbackMode()).toBe(true);
    });

    it("フォールバックモード時に警告メッセージが表示される", () => {
      mockCreateFileSystemWatcher.mockImplementationOnce(() => {
        throw new Error("Watcher creation failed");
      });

      new FileWatcher(debouncer, cacheManager, dataProvider);

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        "PrefixFold: ファイル監視の初期化に失敗しました。手動リフレッシュをご利用ください。"
      );
    });
  });

  describe("ファイル追加イベント（要件 4.1）", () => {
    it("ファイル追加時に CacheManager.invalidate が呼ばれる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const invalidateSpy = vi.spyOn(cacheManager, "invalidate");

      capturedOnDidCreate.handler!(createMockUri("/workspace/src/newFile.ts"));

      expect(invalidateSpy).toHaveBeenCalledWith("/workspace/src");
    });

    it("ファイル追加時に Debouncer 経由で refresh がスケジュールされる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const debounceSpy = vi.spyOn(debouncer, "debounce");

      capturedOnDidCreate.handler!(createMockUri("/workspace/src/newFile.ts"));

      expect(debounceSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("ファイル削除イベント（要件 4.2）", () => {
    it("ファイル削除時に CacheManager.invalidate が呼ばれる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const invalidateSpy = vi.spyOn(cacheManager, "invalidate");

      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/deleted.ts")
      );

      expect(invalidateSpy).toHaveBeenCalledWith("/workspace/src");
    });

    it("ファイル削除時に Debouncer 経由で refresh がスケジュールされる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const debounceSpy = vi.spyOn(debouncer, "debounce");

      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/deleted.ts")
      );

      expect(debounceSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("ファイル変更イベント（要件 4.3）", () => {
    it("ファイル変更時に CacheManager.invalidate が呼ばれる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const invalidateSpy = vi.spyOn(cacheManager, "invalidate");

      capturedOnDidChange.handler!(
        createMockUri("/workspace/src/changed.ts")
      );

      expect(invalidateSpy).toHaveBeenCalledWith("/workspace/src");
    });

    it("ファイル変更時に Debouncer 経由で refresh がスケジュールされる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const debounceSpy = vi.spyOn(debouncer, "debounce");

      capturedOnDidChange.handler!(
        createMockUri("/workspace/src/changed.ts")
      );

      expect(debounceSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("デバウンスによる一括更新（要件 4.4）", () => {
    it("連続したファイル変更イベントで refresh は debounce 経由で呼ばれる", () => {
      vi.useFakeTimers();
      try {
        new FileWatcher(debouncer, cacheManager, dataProvider);

        // 3つのファイル変更を短時間に発生させる
        capturedOnDidCreate.handler!(
          createMockUri("/workspace/src/file1.ts")
        );
        capturedOnDidCreate.handler!(
          createMockUri("/workspace/src/file2.ts")
        );
        capturedOnDidDelete.handler!(
          createMockUri("/workspace/src/file3.ts")
        );

        // デバウンス遅延前は refresh が呼ばれない
        expect(dataProvider.refresh).not.toHaveBeenCalled();

        // 300ms 経過後に refresh が1回だけ呼ばれる
        vi.advanceTimersByTime(300);
        expect(dataProvider.refresh).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("各ファイル変更イベントで CacheManager.invalidate は即座に呼ばれる", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const invalidateSpy = vi.spyOn(cacheManager, "invalidate");

      capturedOnDidCreate.handler!(createMockUri("/workspace/src/file1.ts"));
      capturedOnDidDelete.handler!(createMockUri("/workspace/lib/file2.ts"));
      capturedOnDidChange.handler!(createMockUri("/workspace/src/file3.ts"));

      // invalidate は各イベントで即座に呼ばれる（デバウンスされない）
      expect(invalidateSpy).toHaveBeenCalledTimes(3);
      expect(invalidateSpy).toHaveBeenCalledWith("/workspace/src");
      expect(invalidateSpy).toHaveBeenCalledWith("/workspace/lib");
    });
  });

  describe("ディレクトリパスの抽出", () => {
    it("ファイルパスから正しいディレクトリパスが抽出される", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const invalidateSpy = vi.spyOn(cacheManager, "invalidate");

      capturedOnDidCreate.handler!(
        createMockUri("/workspace/deep/nested/dir/file.ts")
      );

      expect(invalidateSpy).toHaveBeenCalledWith("/workspace/deep/nested/dir");
    });

    it("ルートディレクトリ直下のファイルでも正しく処理される", () => {
      new FileWatcher(debouncer, cacheManager, dataProvider);
      const invalidateSpy = vi.spyOn(cacheManager, "invalidate");

      capturedOnDidCreate.handler!(createMockUri("/workspace/file.ts"));

      expect(invalidateSpy).toHaveBeenCalledWith("/workspace");
    });
  });

  describe("dispose", () => {
    it("dispose 呼び出し時に Debouncer.cancel が呼ばれる", () => {
      const watcher = new FileWatcher(debouncer, cacheManager, dataProvider);
      const cancelSpy = vi.spyOn(debouncer, "cancel");

      watcher.dispose();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it("dispose 呼び出し時に FileSystemWatcher が dispose される", () => {
      const watcher = new FileWatcher(debouncer, cacheManager, dataProvider);

      watcher.dispose();

      expect(mockWatcherDispose).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * FileWatcher インテグレーションテスト
 *
 * FileWatcher、Debouncer、CacheManager の3コンポーネントが
 * 連携して正しく動作することを検証する。
 * vscode モジュールのみモックし、自作コンポーネントは実インスタンスを使用する。
 *
 * 検証対象: 要件 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vscode モジュールのモック（vi.hoisted + vi.mock パターン）
const {
  mockCreateFileSystemWatcher,
  mockShowWarningMessage,
  capturedOnDidCreate,
  capturedOnDidDelete,
  capturedOnDidChange,
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
    dispose: vi.fn(),
  }));

  const mockShowWarningMessage = vi.fn();

  return {
    mockCreateFileSystemWatcher,
    mockShowWarningMessage,
    capturedOnDidCreate,
    capturedOnDidDelete,
    capturedOnDidChange,
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

/** PrefixTreeDataProvider のモック（vscode 依存のため実インスタンスは使用不可） */
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

// ===== インテグレーションテスト =====

describe("FileWatcher インテグレーションテスト", () => {
  let debouncer: Debouncer;
  let cacheManager: CacheManager;
  let dataProvider: PrefixTreeDataProvider;
  let fileWatcher: FileWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capturedOnDidCreate.handler = null;
    capturedOnDidDelete.handler = null;
    capturedOnDidChange.handler = null;

    // 実インスタンスを使用（vscode 依存コンポーネント以外）
    debouncer = new Debouncer(300);
    cacheManager = new CacheManager();
    dataProvider = createMockDataProvider();

    // キャッシュにテストデータを事前投入
    cacheManager.set("/workspace/src", {
      prefix: "",
      files: [],
      children: [],
      ungroupedFiles: ["file1.ts", "file2.ts"],
    });
    cacheManager.set("/workspace/lib", {
      prefix: "",
      files: [],
      children: [],
      ungroupedFiles: ["util.ts"],
    });

    fileWatcher = new FileWatcher(debouncer, cacheManager, dataProvider);
  });

  afterEach(() => {
    fileWatcher.dispose();
    vi.useRealTimers();
  });

  describe("ファイル追加時のTreeView更新確認（要件 4.1）", () => {
    it("ファイル追加イベントで該当ディレクトリのキャッシュが無効化される", () => {
      // キャッシュが存在することを確認
      expect(cacheManager.get("/workspace/src")).toBeDefined();

      // ファイル追加イベントを発火
      capturedOnDidCreate.handler!(createMockUri("/workspace/src/newFile.ts"));

      // 該当ディレクトリのキャッシュが無効化される
      expect(cacheManager.get("/workspace/src")).toBeUndefined();
      // 他のディレクトリのキャッシュは影響を受けない
      expect(cacheManager.get("/workspace/lib")).toBeDefined();
    });

    it("ファイル追加後、デバウンス遅延経過で refresh が呼ばれる", () => {
      capturedOnDidCreate.handler!(createMockUri("/workspace/src/newFile.ts"));

      // デバウンス遅延前は refresh が呼ばれない
      expect(dataProvider.refresh).not.toHaveBeenCalled();

      // 300ms 経過後に refresh が呼ばれる
      vi.advanceTimersByTime(300);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("ファイル削除時のTreeView更新確認（要件 4.2）", () => {
    it("ファイル削除イベントで該当ディレクトリのキャッシュが無効化される", () => {
      expect(cacheManager.get("/workspace/src")).toBeDefined();

      // ファイル削除イベントを発火
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/file1.ts")
      );

      // 該当ディレクトリのキャッシュが無効化される
      expect(cacheManager.get("/workspace/src")).toBeUndefined();
      // 他のディレクトリのキャッシュは影響を受けない
      expect(cacheManager.get("/workspace/lib")).toBeDefined();
    });

    it("ファイル削除後、デバウンス遅延経過で refresh が呼ばれる", () => {
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/file1.ts")
      );

      // デバウンス遅延前は refresh が呼ばれない
      expect(dataProvider.refresh).not.toHaveBeenCalled();

      // 300ms 経過後に refresh が呼ばれる
      vi.advanceTimersByTime(300);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("ファイル名前変更時のTreeView更新確認（要件 4.3）", () => {
    it("名前変更（削除+作成）で両方のディレクトリのキャッシュが無効化される", () => {
      // 追加のキャッシュを投入（移動先ディレクトリ）
      cacheManager.set("/workspace/dest", {
        prefix: "",
        files: [],
        children: [],
        ungroupedFiles: [],
      });

      expect(cacheManager.get("/workspace/src")).toBeDefined();
      expect(cacheManager.get("/workspace/dest")).toBeDefined();

      // 名前変更は VSCode では削除 + 作成として検知される
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/oldName.ts")
      );
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/dest/newName.ts")
      );

      // 両方のディレクトリのキャッシュが無効化される
      expect(cacheManager.get("/workspace/src")).toBeUndefined();
      expect(cacheManager.get("/workspace/dest")).toBeUndefined();
    });

    it("名前変更（同一ディレクトリ内）でキャッシュが無効化される", () => {
      expect(cacheManager.get("/workspace/src")).toBeDefined();

      // 同一ディレクトリ内での名前変更
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/oldName.ts")
      );
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/newName.ts")
      );

      // ディレクトリのキャッシュが無効化される
      expect(cacheManager.get("/workspace/src")).toBeUndefined();
    });

    it("名前変更後、デバウンスにより refresh は1回だけ呼ばれる", () => {
      // 名前変更: 削除 + 作成イベントが連続発生
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/oldName.ts")
      );
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/newName.ts")
      );

      // デバウンス遅延前は refresh が呼ばれない
      expect(dataProvider.refresh).not.toHaveBeenCalled();

      // 300ms 経過後に refresh が1回だけ呼ばれる（デバウンスにより統合）
      vi.advanceTimersByTime(300);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe("デバウンスによる一括更新確認（要件 4.4）", () => {
    it("複数の高速なファイル変更で、300ms以内は refresh が呼ばれない", () => {
      // 複数のファイル変更を短時間に発生させる
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/new1.ts")
      );
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/old1.ts")
      );
      capturedOnDidChange.handler!(
        createMockUri("/workspace/src/changed1.ts")
      );
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/lib/new2.ts")
      );

      // 299ms 時点では refresh は呼ばれない
      vi.advanceTimersByTime(299);
      expect(dataProvider.refresh).not.toHaveBeenCalled();
    });

    it("最後の変更から300ms経過後に refresh が正確に1回呼ばれる", () => {
      // 複数のファイル変更を短時間に発生させる
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/new1.ts")
      );
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/old1.ts")
      );
      capturedOnDidChange.handler!(
        createMockUri("/workspace/src/changed1.ts")
      );

      // 300ms 経過後に refresh が1回だけ呼ばれる
      vi.advanceTimersByTime(300);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(1);
    });

    it("各ファイル変更で CacheManager.invalidate は即座に呼ばれる（デバウンスされない）", () => {
      // 複数ディレクトリにまたがるファイル変更
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/new1.ts")
      );
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/lib/old1.ts")
      );
      capturedOnDidChange.handler!(
        createMockUri("/workspace/src/changed1.ts")
      );

      // invalidate はデバウンスされず即座に実行される
      // /workspace/src のキャッシュは無効化済み
      expect(cacheManager.get("/workspace/src")).toBeUndefined();
      // /workspace/lib のキャッシュも無効化済み
      expect(cacheManager.get("/workspace/lib")).toBeUndefined();
    });

    it("時間差のあるイベントでデバウンスタイマーがリセットされる", () => {
      // 最初のイベント
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/file1.ts")
      );

      // 200ms 後に2番目のイベント（タイマーリセット）
      vi.advanceTimersByTime(200);
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/file2.ts")
      );

      // 最初のイベントから300ms経過（2番目から100ms）→ まだ refresh されない
      vi.advanceTimersByTime(100);
      expect(dataProvider.refresh).not.toHaveBeenCalled();

      // 2番目のイベントから300ms経過 → refresh が呼ばれる
      vi.advanceTimersByTime(200);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(1);
    });

    it("デバウンス完了後の新しいイベントで再度 refresh がスケジュールされる", () => {
      // 最初のバッチ
      capturedOnDidCreate.handler!(
        createMockUri("/workspace/src/file1.ts")
      );
      vi.advanceTimersByTime(300);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(1);

      // キャッシュを再投入（refresh 後に再解析される想定）
      cacheManager.set("/workspace/src", {
        prefix: "",
        files: [],
        children: [],
        ungroupedFiles: ["file1.ts"],
      });

      // 2番目のバッチ
      capturedOnDidDelete.handler!(
        createMockUri("/workspace/src/file1.ts")
      );
      vi.advanceTimersByTime(300);
      expect(dataProvider.refresh).toHaveBeenCalledTimes(2);

      // 2番目のバッチでもキャッシュが無効化されている
      expect(cacheManager.get("/workspace/src")).toBeUndefined();
    });
  });
});

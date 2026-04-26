/**
 * ConfigManager ユニットテスト
 *
 * デフォルト設定値の確認、minGroupSizeバリデーション、設定変更イベントの動作を検証する。
 * 検証対象: 要件 5.1, 5.2, 5.3, 5.4, 5.5, 5.8
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vscodeモジュールのモック（vi.mockはファイル先頭にホイストされるため、vi.hoistedで変数を定義する）
const {
  mockGet,
  mockGetConfiguration,
  mockShowWarningMessage,
  mockOnDidChangeConfiguration,
  getConfigChangeListeners,
  resetConfigChangeListeners,
  MockEventEmitter,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockGetConfiguration = vi.fn(() => ({ get: mockGet }));
  const mockShowWarningMessage = vi.fn();

  type ConfigChangeListener = (e: { affectsConfiguration: (section: string) => boolean }) => void;
  let configChangeListeners: ConfigChangeListener[] = [];

  const mockOnDidChangeConfiguration = vi.fn((listener: ConfigChangeListener) => {
    configChangeListeners.push(listener);
    return { dispose: vi.fn() };
  });

  class MockEventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data: T) {
      this.listeners.forEach((l) => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  }

  return {
    mockGet,
    mockGetConfiguration,
    mockShowWarningMessage,
    mockOnDidChangeConfiguration,
    getConfigChangeListeners: () => configChangeListeners,
    resetConfigChangeListeners: () => { configChangeListeners = []; },
    MockEventEmitter,
  };
});

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: mockGetConfiguration,
    onDidChangeConfiguration: mockOnDidChangeConfiguration,
  },
  window: {
    showWarningMessage: mockShowWarningMessage,
  },
  EventEmitter: MockEventEmitter,
}));

import { ConfigManager } from "../../application/configManager";

/** mockGetのデフォルト設定値を返すヘルパー */
function setupDefaultConfig(): void {
  mockGet.mockImplementation((key: string, defaultValue: unknown) => {
    switch (key) {
      case "delimiters":
        return ["-"];
      case "minGroupSize":
        return 2;
      case "excludePatterns":
        return [];
      case "camelCaseSplit":
        return false;
      default:
        return defaultValue;
    }
  });
}

/** カスタム設定値を返すヘルパー */
function setupCustomConfig(overrides: Record<string, unknown>): void {
  mockGet.mockImplementation((key: string, defaultValue: unknown) => {
    if (key in overrides) {
      return overrides[key];
    }
    switch (key) {
      case "delimiters":
        return ["-"];
      case "minGroupSize":
        return 2;
      case "excludePatterns":
        return [];
      case "camelCaseSplit":
        return false;
      default:
        return defaultValue;
    }
  });
}

describe("ConfigManager", () => {
  let manager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigChangeListeners();
    setupDefaultConfig();
    manager = new ConfigManager();
  });

  describe("getConfig", () => {
    it("デフォルト設定値を正しく返す", () => {
      const config = manager.getConfig();

      expect(config).toEqual({
        delimiters: ["-"],
        minGroupSize: 2,
        excludePatterns: [],
        camelCaseSplit: false,
      });
    });

    it("VSCodeの設定APIから 'prefixFold' セクションを読み取る", () => {
      manager.getConfig();

      expect(mockGetConfiguration).toHaveBeenCalledWith("prefixFold");
    });

    it("カスタム区切り文字を正しく読み取る（要件 5.1）", () => {
      setupCustomConfig({ delimiters: ["-", ".", "_"] });

      const config = manager.getConfig();

      expect(config.delimiters).toEqual(["-", ".", "_"]);
    });

    it("カスタム最小グループサイズを正しく読み取る（要件 5.2）", () => {
      setupCustomConfig({ minGroupSize: 5 });

      const config = manager.getConfig();

      expect(config.minGroupSize).toBe(5);
    });

    it("除外パターンを正しく読み取る（要件 5.5）", () => {
      setupCustomConfig({ excludePatterns: ["*.test.ts", "node_modules/**"] });

      const config = manager.getConfig();

      expect(config.excludePatterns).toEqual(["*.test.ts", "node_modules/**"]);
    });

    it("キャメルケース区切り設定を正しく読み取る（要件 5.8）", () => {
      setupCustomConfig({ camelCaseSplit: true });

      const config = manager.getConfig();

      expect(config.camelCaseSplit).toBe(true);
    });
  });

  describe("minGroupSize バリデーション（要件 5.4）", () => {
    it("minGroupSizeが0の場合、デフォルト値2にフォールバックする", () => {
      setupCustomConfig({ minGroupSize: 0 });

      const config = manager.getConfig();

      expect(config.minGroupSize).toBe(2);
    });

    it("minGroupSizeが負の値の場合、デフォルト値2にフォールバックする", () => {
      setupCustomConfig({ minGroupSize: -5 });

      const config = manager.getConfig();

      expect(config.minGroupSize).toBe(2);
    });

    it("minGroupSizeが1未満の場合、警告メッセージを表示する", () => {
      setupCustomConfig({ minGroupSize: 0 });

      manager.getConfig();

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        "PrefixFold: 最小グループサイズに1未満の値が設定されています。デフォルト値の2を使用します。"
      );
    });

    it("minGroupSizeが1の場合、フォールバックしない", () => {
      setupCustomConfig({ minGroupSize: 1 });

      const config = manager.getConfig();

      expect(config.minGroupSize).toBe(1);
      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it("minGroupSizeが有効な値の場合、警告メッセージを表示しない", () => {
      setupCustomConfig({ minGroupSize: 3 });

      manager.getConfig();

      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe("onDidChangeConfig イベント（要件 5.3）", () => {
    it("prefixFoldセクションの設定変更時にイベントが発火される", () => {
      const listener = vi.fn();
      manager.onDidChangeConfig(listener);

      // VSCodeの設定変更イベントをシミュレート
      const changeEvent = {
        affectsConfiguration: (section: string) => section === "prefixFold",
      };
      getConfigChangeListeners().forEach((l) => l(changeEvent));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          delimiters: expect.any(Array),
          minGroupSize: expect.any(Number),
          excludePatterns: expect.any(Array),
          camelCaseSplit: expect.any(Boolean),
        })
      );
    });

    it("prefixFold以外のセクション変更時にはイベントが発火されない", () => {
      const listener = vi.fn();
      manager.onDidChangeConfig(listener);

      // 別セクションの設定変更をシミュレート
      const changeEvent = {
        affectsConfiguration: (section: string) => section === "editor",
      };
      getConfigChangeListeners().forEach((l) => l(changeEvent));

      expect(listener).not.toHaveBeenCalled();
    });

    it("設定変更時に最新の設定値がイベントで通知される", () => {
      const listener = vi.fn();
      manager.onDidChangeConfig(listener);

      // 設定変更後の値をセットアップ
      setupCustomConfig({ delimiters: ["_", "."], minGroupSize: 3 });

      const changeEvent = {
        affectsConfiguration: (section: string) => section === "prefixFold",
      };
      getConfigChangeListeners().forEach((l) => l(changeEvent));

      expect(listener).toHaveBeenCalledWith({
        delimiters: ["_", "."],
        minGroupSize: 3,
        excludePatterns: [],
        camelCaseSplit: false,
      });
    });
  });

  describe("dispose", () => {
    it("disposeを呼び出してもエラーにならない", () => {
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});

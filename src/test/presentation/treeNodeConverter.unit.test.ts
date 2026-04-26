/**
 * TreeNode変換ロジック ユニットテスト
 *
 * toTreeItem関数とconvertPrefixGroupToTreeNodes関数の具体例テスト。
 * アイコン設定、collapsibleState、command設定、グループ化されないファイルの表示を検証する。
 *
 * 検証対象: 要件 2.4, 2.5, 3.1, 3.3
 */

import { describe, it, expect, vi } from "vitest";

// vscodeモジュールのモック（vi.hoisted + vi.mock パターン）
const { MockUri, MockThemeIcon, MockTreeItem } = vi.hoisted(() => {
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

  return { MockUri, MockThemeIcon, MockTreeItem };
});

vi.mock("vscode", () => ({
  Uri: MockUri,
  ThemeIcon: MockThemeIcon,
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
}));

import { PrefixGroup } from "../../domain/types";
import {
  toTreeItem,
  convertPrefixGroupToTreeNodes,
} from "../../presentation/treeNodeConverter";
import { TreeNode, TreeNodeKind } from "../../presentation/types";

// ===== ヘルパー関数 =====

/** VirtualFolderノードを生成するヘルパー */
function createVirtualFolderNode(
  label: string,
  prefix: string,
  directoryPath: string,
  fileCount: number,
  children?: TreeNode[]
): TreeNode {
  return {
    kind: TreeNodeKind.VirtualFolder,
    label,
    prefix,
    directoryPath,
    fileCount,
    children,
  };
}

/** Fileノードを生成するヘルパー */
function createFileNode(
  label: string,
  directoryPath: string,
  fileName: string
): TreeNode {
  return {
    kind: TreeNodeKind.File,
    label,
    resourceUri: MockUri.file(`${directoryPath}/${fileName}`) as any,
    directoryPath,
  };
}

/** Directoryノードを生成するヘルパー */
function createDirectoryNode(
  label: string,
  directoryPath: string
): TreeNode {
  return {
    kind: TreeNodeKind.Directory,
    label,
    directoryPath,
  };
}

/** WorkspaceRootノードを生成するヘルパー */
function createWorkspaceRootNode(
  label: string,
  directoryPath: string
): TreeNode {
  return {
    kind: TreeNodeKind.WorkspaceRoot,
    label,
    directoryPath,
  };
}

// ===== テスト =====

describe("toTreeItem", () => {
  describe("アイコン設定テスト（要件 2.5）", () => {
    it("VirtualFolderノードにThemeIcon('symbol-folder')が設定される", () => {
      const node = createVirtualFolderNode("aaa- (3)", "aaa-", "/workspace", 3);

      const treeItem = toTreeItem(node);

      expect(treeItem.iconPath).toBeDefined();
      expect((treeItem.iconPath as any).id).toBe("symbol-folder");
    });

    it("Directoryノードに ThemeIcon('folder') が設定される", () => {
      const node = createDirectoryNode("src", "/workspace");

      const treeItem = toTreeItem(node);

      expect(treeItem.iconPath).toBeDefined();
      expect((treeItem.iconPath as any).id).toBe("folder");
    });

    it("WorkspaceRootノードに ThemeIcon('root-folder') が設定される", () => {
      const node = createWorkspaceRootNode("my-project", "/workspace/my-project");

      const treeItem = toTreeItem(node);

      expect(treeItem.iconPath).toBeDefined();
      expect((treeItem.iconPath as any).id).toBe("root-folder");
    });

    it("Fileノードには明示的なiconPathが設定されない（VSCodeがresourceUriから自動検出）", () => {
      const node = createFileNode("aaaa.ts", "/workspace", "aaa-aaaa.ts");

      const treeItem = toTreeItem(node);

      expect(treeItem.iconPath).toBeUndefined();
    });
  });

  describe("collapsibleState テスト（要件 3.1）", () => {
    it("VirtualFolderノードはCollapsed状態になる", () => {
      const node = createVirtualFolderNode("aaa- (2)", "aaa-", "/workspace", 2);

      const treeItem = toTreeItem(node);

      // TreeItemCollapsibleState.Collapsed = 1
      expect(treeItem.collapsibleState).toBe(1);
    });

    it("DirectoryノードはCollapsed状態になる", () => {
      const node = createDirectoryNode("lib", "/workspace");

      const treeItem = toTreeItem(node);

      expect(treeItem.collapsibleState).toBe(1);
    });

    it("WorkspaceRootノードはCollapsed状態になる", () => {
      const node = createWorkspaceRootNode("root", "/workspace/root");

      const treeItem = toTreeItem(node);

      expect(treeItem.collapsibleState).toBe(1);
    });

    it("FileノードはNone状態になる", () => {
      const node = createFileNode("file.ts", "/workspace", "file.ts");

      const treeItem = toTreeItem(node);

      // TreeItemCollapsibleState.None = 0
      expect(treeItem.collapsibleState).toBe(0);
    });
  });

  describe("command 設定テスト（要件 3.3）", () => {
    it("Fileノードに vscode.open コマンドが設定される", () => {
      const node = createFileNode("aaaa.ts", "/workspace", "aaa-aaaa.ts");

      const treeItem = toTreeItem(node);

      expect(treeItem.command).toBeDefined();
      expect(treeItem.command!.command).toBe("vscode.open");
      expect(treeItem.command!.title).toBe("Open File");
      expect(treeItem.command!.arguments).toHaveLength(1);
      expect((treeItem.command!.arguments![0] as any).fsPath).toBe(
        "/workspace/aaa-aaaa.ts"
      );
    });

    it("VirtualFolderノードにはcommandが設定されない", () => {
      const node = createVirtualFolderNode("aaa- (3)", "aaa-", "/workspace", 3);

      const treeItem = toTreeItem(node);

      expect(treeItem.command).toBeUndefined();
    });

    it("Directoryノードにはcommandが設定されない", () => {
      const node = createDirectoryNode("src", "/workspace");

      const treeItem = toTreeItem(node);

      expect(treeItem.command).toBeUndefined();
    });
  });

  describe("contextValue テスト", () => {
    it("VirtualFolderノードのcontextValueは 'virtualFolder'", () => {
      const node = createVirtualFolderNode("aaa- (2)", "aaa-", "/workspace", 2);

      const treeItem = toTreeItem(node);

      expect(treeItem.contextValue).toBe("virtualFolder");
    });

    it("FileノードのcontextValueは 'file'", () => {
      const node = createFileNode("file.ts", "/workspace", "file.ts");

      const treeItem = toTreeItem(node);

      expect(treeItem.contextValue).toBe("file");
    });

    it("DirectoryノードのcontextValueは 'directory'", () => {
      const node = createDirectoryNode("src", "/workspace");

      const treeItem = toTreeItem(node);

      expect(treeItem.contextValue).toBe("directory");
    });

    it("WorkspaceRootノードのcontextValueは 'workspaceRoot'", () => {
      const node = createWorkspaceRootNode("root", "/workspace/root");

      const treeItem = toTreeItem(node);

      expect(treeItem.contextValue).toBe("workspaceRoot");
    });
  });
});

describe("convertPrefixGroupToTreeNodes", () => {
  describe("グループ化されないファイルのルートレベル表示テスト（要件 2.4）", () => {
    it("ungroupedFilesがルートレベルにFileノードとして表示される", () => {
      const rootGroup: PrefixGroup = {
        prefix: "",
        files: [],
        children: [],
        ungroupedFiles: ["readme.md", "license.txt"],
      };

      const nodes = convertPrefixGroupToTreeNodes(rootGroup, "/workspace");

      expect(nodes).toHaveLength(2);
      expect(nodes[0].kind).toBe(TreeNodeKind.File);
      expect(nodes[0].label).toBe("readme.md");
      expect(nodes[1].kind).toBe(TreeNodeKind.File);
      expect(nodes[1].label).toBe("license.txt");
    });

    it("ルートレベルのファイルラベルはフルファイル名（プレフィックス除去なし）", () => {
      const rootGroup: PrefixGroup = {
        prefix: "",
        files: ["standalone.ts"],
        children: [],
        ungroupedFiles: ["config.json"],
      };

      const nodes = convertPrefixGroupToTreeNodes(rootGroup, "/workspace");

      // filesもungroupedFilesもルートレベルではフルファイル名
      const fileNodes = nodes.filter((n) => n.kind === TreeNodeKind.File);
      expect(fileNodes).toHaveLength(2);
      expect(fileNodes[0].label).toBe("standalone.ts");
      expect(fileNodes[1].label).toBe("config.json");
    });

    it("仮想フォルダとグループ化されないファイルが混在する場合", () => {
      const rootGroup: PrefixGroup = {
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
        ungroupedFiles: ["standalone.ts"],
      };

      const nodes = convertPrefixGroupToTreeNodes(rootGroup, "/workspace");

      // 仮想フォルダ1つ + ファイル1つ
      expect(nodes).toHaveLength(2);
      expect(nodes[0].kind).toBe(TreeNodeKind.VirtualFolder);
      expect(nodes[0].label).toBe("aaa- (2)");
      expect(nodes[1].kind).toBe(TreeNodeKind.File);
      expect(nodes[1].label).toBe("standalone.ts");
    });

    it("ルートレベルのファイルにresourceUriが正しく設定される", () => {
      const rootGroup: PrefixGroup = {
        prefix: "",
        files: [],
        children: [],
        ungroupedFiles: ["readme.md"],
      };

      const nodes = convertPrefixGroupToTreeNodes(rootGroup, "/workspace");

      expect(nodes[0].resourceUri).toBeDefined();
      // path.joinの結果を検証（プラットフォーム依存を考慮）
      expect(nodes[0].resourceUri!.fsPath).toContain("readme.md");
    });
  });

  describe("仮想フォルダ内のファイルラベル（プレフィックス除去）", () => {
    it("仮想フォルダ内のファイルはプレフィックスが除去されたラベルを持つ", () => {
      const rootGroup: PrefixGroup = {
        prefix: "",
        files: [],
        children: [
          {
            prefix: "aaa-",
            files: ["aaa-aaaa.ts", "aaa-bbbb.ts"],
            children: [],
            ungroupedFiles: [],
          },
        ],
        ungroupedFiles: [],
      };

      const nodes = convertPrefixGroupToTreeNodes(rootGroup, "/workspace");

      const virtualFolder = nodes[0];
      expect(virtualFolder.kind).toBe(TreeNodeKind.VirtualFolder);
      expect(virtualFolder.children).toBeDefined();
      expect(virtualFolder.children).toHaveLength(2);
      expect(virtualFolder.children![0].label).toBe("aaaa.ts");
      expect(virtualFolder.children![1].label).toBe("bbbb.ts");
    });
  });

  describe("階層的なプレフィックスグループの変換", () => {
    it("ネストされたプレフィックスグループが正しく変換される", () => {
      const rootGroup: PrefixGroup = {
        prefix: "",
        files: [],
        children: [
          {
            prefix: "aaa-",
            files: ["aaa-aaaa.ts"],
            children: [
              {
                prefix: "aaa-bbbb-",
                files: ["aaa-bbbb-cccc.ts", "aaa-bbbb-dddd.ts"],
                children: [],
                ungroupedFiles: [],
              },
            ],
            ungroupedFiles: [],
          },
        ],
        ungroupedFiles: [],
      };

      const nodes = convertPrefixGroupToTreeNodes(rootGroup, "/workspace");

      // ルートに仮想フォルダ1つ
      expect(nodes).toHaveLength(1);
      const aaaFolder = nodes[0];
      expect(aaaFolder.kind).toBe(TreeNodeKind.VirtualFolder);
      expect(aaaFolder.label).toBe("aaa- (3)");
      expect(aaaFolder.fileCount).toBe(3);

      // aaa-フォルダの子: サブ仮想フォルダ + ファイル
      expect(aaaFolder.children).toHaveLength(2);
      const subFolder = aaaFolder.children![0];
      expect(subFolder.kind).toBe(TreeNodeKind.VirtualFolder);
      expect(subFolder.label).toBe("aaa-bbbb- (2)");

      const fileNode = aaaFolder.children![1];
      expect(fileNode.kind).toBe(TreeNodeKind.File);
      expect(fileNode.label).toBe("aaaa.ts");
    });
  });
});

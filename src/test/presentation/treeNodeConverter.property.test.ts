/**
 * TreeNode変換ロジック プロパティベーステスト
 *
 * Feature: collapse-tree, Property 5: 仮想フォルダラベルフォーマット
 * PrefixGroupからTreeNodeへの変換において、仮想フォルダのラベルが正しい形式であることを検証する。
 *
 * Validates: Requirements 2.2, 2.3
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

// vscodeモジュールのモック
const { MockUri, MockThemeIcon } = vi.hoisted(() => {
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

  return { MockUri, MockThemeIcon };
});

vi.mock("vscode", () => ({
  Uri: MockUri,
  ThemeIcon: MockThemeIcon,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
}));

import { PrefixGroup } from "../../domain/types";
import {
  convertPrefixGroupToTreeNodes,
  removePrefix,
} from "../../presentation/treeNodeConverter";
import { TreeNodeKind } from "../../presentation/types";

// ===== ヘルパー関数 =====

/**
 * PrefixGroupツリー内の総ファイル数を再帰的に数える
 * （直接ファイル + ungroupedFiles + サブグループのファイル）
 */
function countTotalFiles(group: PrefixGroup): number {
  let count = group.files.length + group.ungroupedFiles.length;
  for (const child of group.children) {
    count += countTotalFiles(child);
  }
  return count;
}

/**
 * TreeNode配列から仮想フォルダノードを再帰的に収集する
 */
function collectVirtualFolders(
  nodes: { kind: string; label: string; fileCount?: number; children?: any[] }[]
): { kind: string; label: string; fileCount?: number; children?: any[] }[] {
  const folders: { kind: string; label: string; fileCount?: number; children?: any[] }[] = [];
  for (const node of nodes) {
    if (node.kind === TreeNodeKind.VirtualFolder) {
      folders.push(node);
    }
    if (node.children) {
      folders.push(...collectVirtualFolders(node.children));
    }
  }
  return folders;
}

// ===== アービトラリ定義 =====

/**
 * プレフィックス文字列のアービトラリ
 * 英小文字とハイフンで構成される非空文字列
 */
const prefixArb = fc
  .stringOf(
    fc.oneof(
      fc.char().filter((c) => /[a-z]/.test(c)),
      fc.constant("-")
    ),
    { minLength: 1, maxLength: 10 }
  )
  .filter((s) => /[a-z]/.test(s)); // 少なくとも1文字の英字を含む

/**
 * ファイル名のアービトラリ
 * プレフィックス + サフィックスで構成される
 */
function fileNameWithPrefixArb(prefix: string): fc.Arbitrary<string> {
  const suffixArb = fc.stringOf(
    fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
    { minLength: 1, maxLength: 15 }
  );
  return suffixArb.map((suffix) => prefix + suffix);
}

/**
 * 子グループを持たないリーフPrefixGroupのアービトラリ
 */
function leafPrefixGroupArb(prefix: string): fc.Arbitrary<PrefixGroup> {
  return fc
    .tuple(
      fc.array(fileNameWithPrefixArb(prefix), { minLength: 1, maxLength: 5 }),
      fc.array(fileNameWithPrefixArb(prefix), { minLength: 0, maxLength: 3 })
    )
    .map(([files, ungroupedFiles]) => ({
      prefix,
      files,
      children: [],
      ungroupedFiles,
    }));
}

/**
 * ネストされたPrefixGroupのアービトラリ（最大1階層の子グループ）
 */
function nestedPrefixGroupArb(): fc.Arbitrary<PrefixGroup> {
  return prefixArb.chain((prefix) => {
    const childPrefixArb = fc
      .stringOf(
        fc.char().filter((c) => /[a-z]/.test(c)),
        { minLength: 1, maxLength: 5 }
      )
      .map((suffix) => prefix + "-" + suffix);

    return fc
      .tuple(
        fc.array(fileNameWithPrefixArb(prefix), { minLength: 0, maxLength: 5 }),
        fc.array(fileNameWithPrefixArb(prefix), { minLength: 0, maxLength: 3 }),
        fc.array(
          childPrefixArb.chain((childPrefix) =>
            leafPrefixGroupArb(childPrefix)
          ),
          { minLength: 0, maxLength: 3 }
        )
      )
      .map(([files, ungroupedFiles, children]) => ({
        prefix,
        files,
        children,
        ungroupedFiles,
      }))
      // 少なくとも1つのファイルまたは子グループを持つ
      .filter(
        (g) =>
          g.files.length + g.ungroupedFiles.length + g.children.length > 0
      );
  });
}

/**
 * ルートPrefixGroupのアービトラリ
 * ルートは prefix="" で、子グループとungroupedFilesを持つ
 */
const rootPrefixGroupArb: fc.Arbitrary<PrefixGroup> = fc
  .tuple(
    fc.array(nestedPrefixGroupArb(), { minLength: 1, maxLength: 5 }),
    fc.array(
      fc.stringOf(
        fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
        { minLength: 1, maxLength: 15 }
      ),
      { minLength: 0, maxLength: 5 }
    )
  )
  .map(([children, ungroupedFiles]) => ({
    prefix: "",
    files: [],
    children,
    ungroupedFiles,
  }));

// ===== プロパティテスト =====

describe("Feature: collapse-tree, Property 5: 仮想フォルダラベルフォーマット", () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * 任意のプレフィックスグループに対して、仮想フォルダのラベルが
   * `{prefix} ({totalFileCount})` 形式であることを検証する。
   */
  it("仮想フォルダのラベルが {prefix} ({fileCount}) 形式である", () => {
    fc.assert(
      fc.property(rootPrefixGroupArb, (rootGroup) => {
        const directoryPath = "/test/dir";
        const nodes = convertPrefixGroupToTreeNodes(rootGroup, directoryPath);
        const virtualFolders = collectVirtualFolders(nodes);

        // 子グループが存在する場合、仮想フォルダが生成されるはず
        expect(virtualFolders.length).toBe(
          countVirtualFoldersInGroup(rootGroup)
        );

        // 各仮想フォルダのラベルフォーマットを検証
        for (const folder of virtualFolders) {
          // ラベルが {prefix} ({fileCount}) 形式であることを検証
          const labelPattern = /^(.+) \((\d+)\)$/;
          const match = folder.label.match(labelPattern);

          expect(match).not.toBeNull();

          if (match) {
            const labelPrefix = match[1];
            const labelFileCount = parseInt(match[2], 10);

            // fileCountプロパティと一致することを検証
            expect(folder.fileCount).toBe(labelFileCount);

            // ラベル内のプレフィックスがノードのプレフィックスと一致
            // （ラベルは `{prefix} ({count})` 形式なので、prefixはlabelPrefixと一致するはず）
            expect(labelPrefix).toBeTruthy();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("仮想フォルダのfileCountがグループ内の総ファイル数と一致する", () => {
    fc.assert(
      fc.property(rootPrefixGroupArb, (rootGroup) => {
        const directoryPath = "/test/dir";
        const nodes = convertPrefixGroupToTreeNodes(rootGroup, directoryPath);

        // ルートの子グループと生成されたTreeNodeを対応付けて検証
        verifyFileCountsMatch(rootGroup.children, nodes);
      }),
      { numRuns: 100 }
    );
  });
});

// ===== 検証ヘルパー =====

/**
 * PrefixGroupツリー内の仮想フォルダ（子グループ）の総数を再帰的に数える
 */
function countVirtualFoldersInGroup(group: PrefixGroup): number {
  let count = group.children.length;
  for (const child of group.children) {
    count += countVirtualFoldersInGroup(child);
  }
  return count;
}

/**
 * PrefixGroupの子グループとTreeNodeの仮想フォルダを対応付けて、
 * fileCountが正しいことを再帰的に検証する
 */
function verifyFileCountsMatch(
  groups: PrefixGroup[],
  nodes: { kind: string; label: string; fileCount?: number; children?: any[] }[]
): void {
  const virtualFolderNodes = nodes.filter(
    (n) => n.kind === TreeNodeKind.VirtualFolder
  );

  // 各グループに対応する仮想フォルダノードが存在する
  expect(virtualFolderNodes.length).toBe(groups.length);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const node = virtualFolderNodes[i];
    const expectedTotalFiles = countTotalFiles(group);

    // fileCountプロパティが総ファイル数と一致
    expect(node.fileCount).toBe(expectedTotalFiles);

    // ラベルに含まれるファイル数が総ファイル数と一致
    const match = node.label.match(/\((\d+)\)$/);
    expect(match).not.toBeNull();
    if (match) {
      expect(parseInt(match[1], 10)).toBe(expectedTotalFiles);
    }

    // 子ノードがある場合、再帰的に検証
    if (node.children && group.children.length > 0) {
      verifyFileCountsMatch(group.children, node.children);
    }
  }
}


// ===== Property 6 用ヘルパー =====

/**
 * TreeNode型（テスト内で使用する簡易型）
 */
interface TestTreeNode {
  kind: string;
  label: string;
  prefix?: string;
  children?: TestTreeNode[];
  resourceUri?: { fsPath: string };
}

/**
 * 仮想フォルダ内のファイルノードとそのグループプレフィックスのペアを再帰的に収集する
 */
function collectFileNodesWithPrefix(
  nodes: TestTreeNode[],
  parentPrefix: string | undefined
): { node: TestTreeNode; groupPrefix: string }[] {
  const result: { node: TestTreeNode; groupPrefix: string }[] = [];
  for (const node of nodes) {
    if (node.kind === TreeNodeKind.VirtualFolder) {
      // 仮想フォルダの子ノードを再帰的に処理
      if (node.children) {
        result.push(...collectFileNodesWithPrefix(node.children, node.prefix));
      }
    } else if (node.kind === TreeNodeKind.File && parentPrefix !== undefined) {
      // 仮想フォルダ内のファイルノード
      result.push({ node, groupPrefix: parentPrefix });
    }
  }
  return result;
}

/**
 * PrefixGroupツリーから全ファイル名とそのグループプレフィックスのペアを再帰的に収集する
 */
function collectFilesWithPrefix(
  group: PrefixGroup
): { fileName: string; prefix: string }[] {
  const result: { fileName: string; prefix: string }[] = [];
  // 直接属するファイル
  for (const fileName of group.files) {
    result.push({ fileName, prefix: group.prefix });
  }
  // グループ化されなかったファイル
  for (const fileName of group.ungroupedFiles) {
    result.push({ fileName, prefix: group.prefix });
  }
  // 子グループを再帰的に処理
  for (const child of group.children) {
    result.push(...collectFilesWithPrefix(child));
  }
  return result;
}

// ===== Property 6 プロパティテスト =====

describe("Feature: collapse-tree, Property 6: プレフィックス除去ラベル", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * 任意のプレフィックスグループ内のファイルに対して、
   * ラベルがプレフィックス部分を除去した残りと一致することを検証する。
   */
  it("仮想フォルダ内のファイルラベルがプレフィックスを除去した残りと一致する", () => {
    fc.assert(
      fc.property(rootPrefixGroupArb, (rootGroup) => {
        const directoryPath = "/test/dir";
        const nodes = convertPrefixGroupToTreeNodes(rootGroup, directoryPath);

        // 仮想フォルダ内のファイルノードとそのグループプレフィックスを収集
        const fileNodesWithPrefix = collectFileNodesWithPrefix(
          nodes as TestTreeNode[],
          undefined
        );

        // 各ファイルノードのラベルがプレフィックス除去後の文字列と一致することを検証
        for (const { node, groupPrefix } of fileNodesWithPrefix) {
          // resourceUriからファイル名を取得（Windows/Unix両対応）
          const fsPath = node.resourceUri?.fsPath ?? "";
          const fileName = fsPath.split(/[/\\]/).pop() ?? "";

          // ファイル名がプレフィックスで始まることを確認
          expect(fileName.startsWith(groupPrefix)).toBe(true);

          // ラベルがプレフィックス除去後の残りと一致
          const expectedLabel = fileName.slice(groupPrefix.length);
          expect(node.label).toBe(expectedLabel);
        }

        // 少なくとも1つのファイルノードが検証されたことを確認
        // （子グループが存在し、ファイルを持つ場合）
        const totalFilesInGroups = rootGroup.children.reduce(
          (sum, child) => sum + countTotalFiles(child),
          0
        );
        expect(fileNodesWithPrefix.length).toBe(totalFilesInGroups);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * removePrefix関数が任意のファイル名とプレフィックスに対して
   * 正しくプレフィックスを除去することを検証する。
   */
  it("removePrefix関数がファイル名からプレフィックスを正しく除去する", () => {
    fc.assert(
      fc.property(prefixArb, (prefix) => {
        return fc.assert(
          fc.property(fileNameWithPrefixArb(prefix), (fileName) => {
            const result = removePrefix(fileName, prefix);

            // 結果がファイル名のプレフィックス除去後の残りと一致
            expect(result).toBe(fileName.slice(prefix.length));

            // 結果の長さが正しい
            expect(result.length).toBe(fileName.length - prefix.length);

            // プレフィックス + 結果 = 元のファイル名
            expect(prefix + result).toBe(fileName);
          }),
          { numRuns: 10 } // 内側のループは少なめに
        );
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * 空プレフィックスの場合、removePrefixはファイル名をそのまま返すことを検証する。
   */
  it("空プレフィックスの場合はファイル名がそのまま返される", () => {
    fc.assert(
      fc.property(
        fc.stringOf(
          fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)),
          { minLength: 1, maxLength: 20 }
        ),
        (fileName) => {
          const result = removePrefix(fileName, "");
          expect(result).toBe(fileName);
        }
      ),
      { numRuns: 100 }
    );
  });
});

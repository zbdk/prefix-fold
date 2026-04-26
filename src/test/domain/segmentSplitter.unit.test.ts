/**
 * SegmentSplitter ユニットテスト
 *
 * 具体例とエッジケースを検証する。
 * 検証対象: 要件 5.6, 5.9, 5.10
 */

import { describe, it, expect } from "vitest";
import { split, splitWithSeparators, join } from "../../domain/segmentSplitter";

describe("SegmentSplitter - split", () => {
  describe("区切り文字による分割", () => {
    it("ハイフン区切り: aaa-bbbb-cccc → [aaa, bbbb, cccc]", () => {
      expect(split("aaa-bbbb-cccc", ["-"], false)).toEqual([
        "aaa",
        "bbbb",
        "cccc",
      ]);
    });

    it("ドット区切り: file.name.ext → [file, name, ext]", () => {
      expect(split("file.name.ext", ["."], false)).toEqual([
        "file",
        "name",
        "ext",
      ]);
    });

    it("アンダースコア区切り: my_file_name → [my, file, name]", () => {
      expect(split("my_file_name", ["_"], false)).toEqual([
        "my",
        "file",
        "name",
      ]);
    });

    it("複数区切り文字: aaa-bbb.ccc → [aaa, bbb, ccc]", () => {
      expect(split("aaa-bbb.ccc", ["-", "."], false)).toEqual([
        "aaa",
        "bbb",
        "ccc",
      ]);
    });

    it("区切り文字が連続する場合: aaa--bbb → [aaa, , bbb]", () => {
      expect(split("aaa--bbb", ["-"], false)).toEqual(["aaa", "", "bbb"]);
    });

    it("先頭が区切り文字: -aaa → [, aaa]", () => {
      expect(split("-aaa", ["-"], false)).toEqual(["", "aaa"]);
    });

    it("末尾が区切り文字: aaa- → [aaa, ]", () => {
      expect(split("aaa-", ["-"], false)).toEqual(["aaa", ""]);
    });
  });

  describe("キャメルケース分割", () => {
    it("基本: AppCode → [App, Code]", () => {
      expect(split("AppCode", [], true)).toEqual(["App", "Code"]);
    });

    it("小文字始まり: myApp → [my, App]", () => {
      expect(split("myApp", [], true)).toEqual(["my", "App"]);
    });

    it("連続大文字: HTMLParser → [HTML, Parser]", () => {
      expect(split("HTMLParser", [], true)).toEqual(["HTML", "Parser"]);
    });

    it("全大文字: ABC → [ABC]", () => {
      expect(split("ABC", [], true)).toEqual(["ABC"]);
    });

    it("全小文字: filename → [filename]", () => {
      expect(split("filename", [], true)).toEqual(["filename"]);
    });

    it("複数キャメルケース: myAppCode → [my, App, Code]", () => {
      expect(split("myAppCode", [], true)).toEqual(["my", "App", "Code"]);
    });

    it("1文字: A → [A]", () => {
      expect(split("A", [], true)).toEqual(["A"]);
    });

    it("大文字+小文字: Ab → [Ab]", () => {
      expect(split("Ab", [], true)).toEqual(["Ab"]);
    });
  });

  describe("統合分割（区切り文字 + キャメルケース）", () => {
    it("ハイフン+キャメルケース: my-AppCode → [my, App, Code]", () => {
      expect(split("my-AppCode", ["-"], true)).toEqual([
        "my",
        "App",
        "Code",
      ]);
    });

    it("複数区切り文字+キャメルケース: my-App.CodeName → [my, App, Code, Name]", () => {
      expect(split("my-App.CodeName", ["-", "."], true)).toEqual([
        "my",
        "App",
        "Code",
        "Name",
      ]);
    });

    it("区切り文字のみの部分: aaa-bbb → [aaa, bbb]", () => {
      expect(split("aaa-bbb", ["-"], true)).toEqual(["aaa", "bbb"]);
    });
  });

  describe("区切り文字なし", () => {
    it("区切り文字なし・キャメルケースなし: filename → [filename]", () => {
      expect(split("filename", [], false)).toEqual(["filename"]);
    });

    it("区切り文字なし・キャメルケースなし: aaa-bbb → [aaa-bbb]（分割されない）", () => {
      expect(split("aaa-bbb", [], false)).toEqual(["aaa-bbb"]);
    });
  });

  describe("エッジケース", () => {
    it("空文字列 → ['']", () => {
      expect(split("", ["-"], false)).toEqual([""]);
    });

    it("区切り文字のみ: - → [, ]", () => {
      expect(split("-", ["-"], false)).toEqual(["", ""]);
    });

    it("長い区切り文字が優先される: aaa--bbb を ['--', '-'] で分割", () => {
      expect(split("aaa--bbb", ["--", "-"], false)).toEqual(["aaa", "bbb"]);
    });
  });
});

describe("SegmentSplitter - splitWithSeparators / join ラウンドトリップ", () => {
  it("区切り文字分割のラウンドトリップ", () => {
    const result = splitWithSeparators("aaa-bbbb.cccc", ["-", "."], false);
    expect(result.segments).toEqual(["aaa", "bbbb", "cccc"]);
    expect(result.separators).toEqual(["-", "."]);
    expect(join(result)).toBe("aaa-bbbb.cccc");
  });

  it("キャメルケース分割のラウンドトリップ", () => {
    const result = splitWithSeparators("AppCode", [], true);
    expect(result.segments).toEqual(["App", "Code"]);
    expect(result.separators).toEqual([""]);
    expect(join(result)).toBe("AppCode");
  });

  it("統合分割のラウンドトリップ", () => {
    const result = splitWithSeparators("my-AppCode", ["-"], true);
    expect(result.segments).toEqual(["my", "App", "Code"]);
    expect(result.separators).toEqual(["-", ""]);
    expect(join(result)).toBe("my-AppCode");
  });
});

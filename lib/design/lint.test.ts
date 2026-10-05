import { describe, expect, it } from "bun:test";
import { createDesignDocument, readDesignDocument } from "@/lib/design/document";
import { lintScreen } from "@/lib/design/lint";
import { addScreen, findScreen } from "@/lib/design/screens";

const lint = async (body: string) => {
  const graph = await readDesignDocument(await createDesignDocument());
  const { id } = await addScreen(graph, {
    name: "Test",
    device: "mobile",
    jsx: `<Frame flex="col" bg="#FFFFFF" p={16} gap={8}>${body}</Frame>`,
  });
  return lintScreen(graph, findScreen(graph, id)!.id);
};

describe("lintScreen", () => {
  it("names each problem node with the id the design tools take", async () => {
    const problems = await lint(
      `<Text name="Pale" color="#EEEEEE">Low contrast</Text>` +
        `<Text name="Tiny" size={9} color="#111111">tiny</Text>` +
        `<Frame name="Box" w={120} h={20}><Text name="Long" w={300} color="#111111">Too long for the box</Text></Frame>` +
        `<Frame name="Leftover" bg="#FF0000" />` +
        `<Frame name="Hidden" w={0} h={20} bg="#000000" />`,
    );
    expect(problems).toHaveLength(5);
    for (const [name, words] of [
      ["Pale", "Contrast"],
      ["Tiny", "below minimum"],
      ["Long", "overflows"],
      ["Leftover", "default size"],
      ["Hidden", "does not show"],
    ]) {
      expect(problems.find((line) => line.includes(`"${name}" (id: 1:`))).toContain(words);
    }
  });

  it("passes a clean screen with a spacer", async () => {
    const problems = await lint(
      `<Text color="#111111" size={16}>Fine</Text>` +
        `<Frame name="Row" flex="row" w="fill"><Text color="#111111">A</Text><Frame name="Spacer" grow={1} /><Text color="#111111">B</Text></Frame>`,
    );
    expect(problems).toEqual([]);
  });
});

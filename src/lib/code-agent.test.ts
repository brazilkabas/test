import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { sendAiChat } = vi.hoisted(() => ({ sendAiChat: vi.fn() }));

vi.mock("@/lib/ai-api", () => ({ sendAiChat }));

import { runCodeAgent } from "@/lib/code-agent";

const temporaryFile = resolve(process.cwd(), "code-agent-test-output.txt");

afterEach(async () => {
  sendAiChat.mockReset();
  await rm(temporaryFile, { force: true });
});

describe("runCodeAgent", () => {
  it("executes a scoped file edit and reports its activity", async () => {
    sendAiChat
      .mockResolvedValueOnce({
        content: JSON.stringify({
          tool: "write_file",
          input: { path: "code-agent-test-output.txt", content: "safe change\n" },
        }),
        model: "test-model",
      })
      .mockResolvedValueOnce({ content: "The file was updated.", model: "test-model" });

    const result = await runCodeAgent([{ role: "user", content: "Create the test file" }]);

    expect(await readFile(temporaryFile, "utf8")).toBe("safe change\n");
    expect(result.content).toBe("The file was updated.");
    expect(result.activities).toEqual([
      { tool: "write_file", summary: "Wrote code-agent-test-output.txt", success: true },
    ]);
  });

  it("denies environment-secret access and returns the denial to the model", async () => {
    sendAiChat
      .mockResolvedValueOnce({
        content: '{"tool":"read_file","input":{"path":".env"}}',
        model: null,
      })
      .mockResolvedValueOnce({ content: "I cannot access that secret file.", model: null });

    const result = await runCodeAgent([{ role: "user", content: "Read the environment" }]);

    expect(result.activities[0]).toMatchObject({ tool: "read_file", success: false });
    expect(sendAiChat.mock.calls[1][0].at(-1).content).toContain("Secret and credential files are not accessible");
  });

  it("treats normal prose as the final response", async () => {
    sendAiChat.mockResolvedValueOnce({ content: "No changes are needed.", model: "test-model" });
    const result = await runCodeAgent([{ role: "user", content: "Review this project" }]);
    expect(result.activities).toEqual([]);
    expect(result.content).toBe("No changes are needed.");
  });
});

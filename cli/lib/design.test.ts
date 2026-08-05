import { describe, expect, it } from "vitest";
import {
  formatContent,
  hasContentStructures,
  hasTopics,
  renderDesignMarkdown,
  type DesignData,
} from "./design";

describe("formatContent", () => {
  it("passes through real dialogue unchanged", () => {
    expect(formatContent("JOHN: I saw you there.")).toBe("JOHN: I saw you there.");
  });

  it("flags an explicit no-match marker", () => {
    expect(formatContent("NO MATCHING DIALOGUE FOUND in transcript")).toContain(
      "NO REAL DIALOGUE MATCH"
    );
  });

  it("flags a no-match marker case-insensitively", () => {
    expect(formatContent("no matching dialogue found")).toContain("NO REAL DIALOGUE MATCH");
  });

  it("flags undefined content", () => {
    expect(formatContent(undefined)).toContain("(missing)");
  });

  it("flags empty-string content", () => {
    expect(formatContent("")).toContain("(missing)");
  });
});

describe("hasTopics", () => {
  it("is false for null design", () => {
    expect(hasTopics(null)).toBe(false);
  });

  it("is false when no phase has topics", () => {
    const design: DesignData = { phases: [{ id: "p1", name: "Phase 1", goal: "g", topics: [] }] };
    expect(hasTopics(design)).toBe(false);
  });

  it("is true when at least one phase has a topic", () => {
    const design: DesignData = {
      phases: [
        { id: "p1", name: "Phase 1", goal: "g", topics: [] },
        { id: "p2", name: "Phase 2", goal: "g", topics: [{ id: "t1", title: "Topic" }] },
      ],
    };
    expect(hasTopics(design)).toBe(true);
  });
});

describe("hasContentStructures", () => {
  it("is false for null design", () => {
    expect(hasContentStructures(null)).toBe(false);
  });

  it("is false when topics exist but have no content structures", () => {
    const design: DesignData = {
      phases: [{ id: "p1", name: "Phase 1", goal: "g", topics: [{ id: "t1", title: "Topic" }] }],
    };
    expect(hasContentStructures(design)).toBe(false);
  });

  it("is true when a topic has at least one content structure", () => {
    const design: DesignData = {
      phases: [
        {
          id: "p1",
          name: "Phase 1",
          goal: "g",
          topics: [
            {
              id: "t1",
              title: "Topic",
              contentStructures: [{ variant: "A", hook: "h", bridge: "b", content: "c", cta: "cta" }],
            },
          ],
        },
      ],
    };
    expect(hasContentStructures(design)).toBe(true);
  });
});

describe("renderDesignMarkdown", () => {
  it("renders phases, topics, and content structures with headers", () => {
    const design: DesignData = {
      phases: [
        {
          id: "p1",
          name: "Awareness",
          goal: "Get eyes on it",
          topics: [
            {
              id: "t1",
              title: "Teaser",
              description: "A short teaser",
              reasoning: "Builds curiosity",
              contentStructures: [
                { variant: "A", hook: "hook line", bridge: "bridge line", content: "JOHN: hi", cta: "follow" },
              ],
            },
          ],
        },
      ],
    };

    const md = renderDesignMarkdown(design);

    expect(md).toContain("## Awareness (p1)");
    expect(md).toContain("**Goal:** Get eyes on it");
    expect(md).toContain("### Teaser (t1)");
    expect(md).toContain("A short teaser");
    expect(md).toContain("*Why: Builds curiosity*");
    expect(md).toContain("**Variant A**");
    expect(md).toContain("- Hook: hook line");
    expect(md).toContain("- Content: JOHN: hi");
  });

  it("flags a no-match content line through formatContent", () => {
    const design: DesignData = {
      phases: [
        {
          id: "p1",
          name: "Phase",
          goal: "g",
          topics: [
            {
              id: "t1",
              title: "Topic",
              contentStructures: [
                { variant: "A", hook: "h", bridge: "b", content: "NO MATCHING DIALOGUE FOUND in transcript", cta: "c" },
              ],
            },
          ],
        },
      ],
    };

    expect(renderDesignMarkdown(design)).toContain("NO REAL DIALOGUE MATCH");
  });

  it("handles phases with no topics and topics with no content structures", () => {
    const design: DesignData = {
      phases: [{ id: "p1", name: "Empty phase", goal: "g" }],
    };
    expect(() => renderDesignMarkdown(design)).not.toThrow();
    expect(renderDesignMarkdown(design)).toContain("## Empty phase (p1)");
  });
});

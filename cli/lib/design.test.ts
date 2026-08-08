import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  formatContent,
  hasContentStructures,
  hasTopics,
  renderDesignMarkdown,
  type DesignData,
} from "./design";
import { renderedVideoPath } from "./project";

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

    const md = renderDesignMarkdown(design, "test-project");

    expect(md).toContain("## Awareness (p1)");
    expect(md).toContain("**Goal:** Get eyes on it");
    expect(md).toContain("### Teaser (t1)");
    expect(md).toContain("**Concept**");
    expect(md).toContain("A short teaser");
    expect(md).toContain("*Why: Builds curiosity*");
    expect(md).toContain("#### Variant A");
    expect(md).toContain("**Copy**");
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

    expect(renderDesignMarkdown(design, "test-project")).toContain("NO REAL DIALOGUE MATCH");
  });

  it("handles phases with no topics and topics with no content structures", () => {
    const design: DesignData = {
      phases: [{ id: "p1", name: "Empty phase", goal: "g" }],
    };
    expect(() => renderDesignMarkdown(design, "test-project")).not.toThrow();
    expect(renderDesignMarkdown(design, "test-project")).toContain("## Empty phase (p1)");
  });

  it("renders per-platform copy when present", () => {
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
                {
                  variant: "A",
                  hook: "h",
                  bridge: "b",
                  content: "c",
                  cta: "follow",
                  platforms: {
                    youtube: { title: "YT Title", caption: "yt cap", hashtags: ["#a", "#b"] },
                    instagram: { caption: "ig cap", hashtags: ["#c"] },
                    tiktok: { caption: "tt cap", hashtags: ["#d", "#e"] },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const md = renderDesignMarkdown(design, "test-project");

    expect(md).toContain("**Social Media**");
    expect(md).toContain("| Platform | Title | Caption | Hashtags |");
    expect(md).toContain("|---|---|---|---|");
    expect(md).toContain("| YouTube | YT Title | yt cap | #a #b |");
    expect(md).toContain("| Instagram | — | ig cap | #c |");
    expect(md).toContain("| TikTok | — | tt cap | #d #e |");

    // Table is preceded by a blank-line gap after the CTA bullet.
    const ctaIndex = md.indexOf("- CTA: follow");
    const blankLineAfterCta = md.slice(ctaIndex).split("\n")[1];
    expect(blankLineAfterCta).toBe("");
  });

  it("escapes a raw pipe inside platform copy so it doesn't break the table", () => {
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
                {
                  variant: "A",
                  hook: "h",
                  bridge: "b",
                  content: "c",
                  cta: "follow",
                  platforms: {
                    youtube: { title: "A | B", caption: "yt", hashtags: ["#a"] },
                    instagram: { caption: "ig", hashtags: ["#c"] },
                    tiktok: { caption: "tt", hashtags: ["#d"] },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(renderDesignMarkdown(design, "test-project")).toContain("A \\| B");
  });

  it("indents multi-line content so it nests under the Content bullet", () => {
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
                { variant: "A", hook: "h", bridge: "b", content: "LINE_ONE\nLINE_TWO\nLINE_THREE", cta: "follow" },
              ],
            },
          ],
        },
      ],
    };

    const md = renderDesignMarkdown(design, "test-project");

    expect(md).toContain("- Content: LINE_ONE\n    LINE_TWO\n    LINE_THREE");
  });

  it("omits platform lines when platforms is absent", () => {
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
              contentStructures: [{ variant: "A", hook: "h", bridge: "b", content: "c", cta: "follow" }],
            },
          ],
        },
      ],
    };

    expect(renderDesignMarkdown(design, "test-project")).not.toContain("| YouTube");
  });

  it("renders an edit-copy cut table when present", () => {
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
                {
                  variant: "A",
                  hook: "h",
                  bridge: "b",
                  content: "c",
                  cta: "follow",
                  editCopy: {
                    sourceVideo: "/videos/source.mp4",
                    rows: [
                      { timestamp: "10:36.7", action: 'CUT IN -- "generic line"', transition: "hard cut" },
                      { timestamp: "10:38.3", action: "CUT OUT", effect: "punch-zoom on speaker" },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const md = renderDesignMarkdown(design, "test-project");

    expect(md).toContain("**Edit Copy**");
    expect(md).toContain("Source: /videos/source.mp4");
    expect(md).toContain("| Timestamp | Action | Transition | Effect |");
    expect(md).toContain('| 10:36.7 | CUT IN -- "generic line" | hard cut | — |');
    expect(md).toContain("| 10:38.3 | CUT OUT | — | punch-zoom on speaker |");
  });

  it("omits the edit-copy table when absent", () => {
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
              contentStructures: [{ variant: "A", hook: "h", bridge: "b", content: "c", cta: "follow" }],
            },
          ],
        },
      ],
    };

    expect(renderDesignMarkdown(design, "test-project")).not.toContain("**Edit Copy**");
  });

  it("renders build output paths when present, including a null hook still", () => {
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
                {
                  variant: "A",
                  hook: "h",
                  bridge: "b",
                  content: "c",
                  cta: "follow",
                  build: {
                    compositionFile: "src/example-project/Example.tsx",
                    extractedClip: "public/Projects/example-project/Assets/Video/t1.mp4",
                    hookStill: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const md = renderDesignMarkdown(design, "example-project");

    expect(md).toContain("**Path**");
    expect(md).toContain("- Composition: src/example-project/Example.tsx");
    expect(md).toContain("- Extracted clip (proxy, 720p): public/Projects/example-project/Assets/Video/t1.mp4");
    expect(md).toContain("- Extracted clip (final, native res): not finalized yet");
    expect(md).toContain("- Composition currently uses: unknown");
    expect(md).toContain("- Hook still: not needed for this template");
    expect(md).toContain("**Rendered**");
    expect(md).toContain("- not yet rendered");
  });

  it("shows the final clip path and active quality once a topic has been finalized", () => {
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
                {
                  variant: "A",
                  hook: "h",
                  bridge: "b",
                  content: "c",
                  cta: "follow",
                  build: {
                    compositionFile: "src/example-project/Example.tsx",
                    extractedClip: "public/Projects/example-project/Assets/Video/t1.mp4",
                    finalClip: "public/Projects/example-project/Final/Video/t1.mp4",
                    hookStill: null,
                    quality: "final",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const md = renderDesignMarkdown(design, "example-project");

    expect(md).toContain("- Extracted clip (final, native res): public/Projects/example-project/Final/Video/t1.mp4");
    expect(md).toContain("- Composition currently uses: final");
  });

  it("shows the rendered video path once the file actually exists on disk", () => {
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
                {
                  variant: "A",
                  hook: "h",
                  bridge: "b",
                  content: "c",
                  cta: "follow",
                  build: {
                    compositionFile: "src/example-project/Example.tsx",
                    extractedClip: "public/Projects/example-project/Assets/Video/t1.mp4",
                    hookStill: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const expectedPath = renderedVideoPath("example-project", "t1");
    const spy = vi.spyOn(fs, "existsSync").mockImplementation((p) => p === expectedPath);

    try {
      const md = renderDesignMarkdown(design, "example-project");
      expect(md).toContain(`- ${expectedPath}`);
    } finally {
      spy.mockRestore();
    }
  });

  it("omits build output when absent", () => {
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
              contentStructures: [{ variant: "A", hook: "h", bridge: "b", content: "c", cta: "follow" }],
            },
          ],
        },
      ],
    };

    expect(renderDesignMarkdown(design, "test-project")).not.toContain("- Composition:");
    expect(renderDesignMarkdown(design, "test-project")).not.toContain("**Rendered**");
  });
});

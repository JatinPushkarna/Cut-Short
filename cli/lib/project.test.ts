import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assetsDir,
  campaignDir,
  imagesDir,
  musicDir,
  PROJECTS_ROOT,
  projectDir,
  projectJsonPath,
  readProjectData,
  scriptDir,
  sfxDir,
  slugify,
  srtDir,
  videoDir,
  writeProjectData,
  type ProjectData,
} from "./project";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("My Project!")).toBe("my-project");
  });

  it("trims leading/trailing separators", () => {
    expect(slugify("  leading and trailing spaces  ")).toBe("leading-and-trailing-spaces");
  });

  it("falls back to untitled-project for empty input", () => {
    expect(slugify("")).toBe("untitled-project");
  });

  it("falls back to untitled-project when nothing alphanumeric survives", () => {
    expect(slugify("@@@")).toBe("untitled-project");
  });

  it("truncates to 40 characters", () => {
    const input = "a".repeat(60);
    const result = slugify(input);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("collapses runs of separators into one hyphen", () => {
    expect(slugify("foo   bar___baz")).toBe("foo-bar-baz");
  });
});

describe("path builders", () => {
  const slug = "foo";

  it("build paths under PROJECTS_ROOT/<slug>", () => {
    expect(projectDir(slug)).toBe(path.join(PROJECTS_ROOT, slug));
    expect(campaignDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Campaign"));
    expect(scriptDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Script"));
    expect(srtDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "SRT"));
    expect(assetsDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Assets"));
    expect(videoDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Assets", "Video"));
    expect(imagesDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Assets", "Images"));
    expect(musicDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Assets", "Music"));
    expect(sfxDir(slug)).toBe(path.join(PROJECTS_ROOT, slug, "Assets", "Music", "SFX"));
  });
});

describe("readProjectData / writeProjectData", () => {
  const slug = "test-project-" + Math.random().toString(36).slice(2);
  let videoPath: string;
  let exitSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fs.mkdirSync(campaignDir(slug), { recursive: true });
    videoPath = path.join(os.tmpdir(), `cutshort-test-video-${Date.now()}.mp4`);
    fs.writeFileSync(videoPath, "not a real video");

    // readProjectData/writeProjectData call process.exit on error paths --
    // stub it so a failing assertion doesn't kill the whole test run, and so
    // we can assert the error path was actually taken.
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never) as unknown as ReturnType<typeof vi.fn>;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    fs.rmSync(projectDir(slug), { recursive: true, force: true });
    fs.rmSync(videoPath, { force: true });
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function makeProjectData(overrides: Partial<ProjectData> = {}): ProjectData {
    return {
      slug,
      projectName: "Test Project",
      objective: "test objective",
      targetAudience: "test audience",
      fileDescription: "test file",
      platforms: ["instagram"],
      isCampaign: false,
      campaignDays: null,
      videoPath,
      scriptPath: null,
      createdAt: new Date().toISOString(),
      template: null,
      ...overrides,
    };
  }

  it("round-trips through disk", () => {
    const data = makeProjectData();
    writeProjectData(slug, data);

    expect(fs.existsSync(projectJsonPath(slug))).toBe(true);
    expect(readProjectData(slug)).toEqual(data);
  });

  it("exits when project.json doesn't exist", () => {
    expect(() => readProjectData(slug)).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("exits when the recorded videoPath no longer exists on disk", () => {
    const data = makeProjectData();
    writeProjectData(slug, data);
    fs.rmSync(videoPath);

    expect(() => readProjectData(slug)).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Source video no longer found"));
  });

  it("exits when a recorded scriptPath no longer exists on disk", () => {
    const scriptPath = path.join(os.tmpdir(), `cutshort-test-script-${Date.now()}.pdf`);
    fs.writeFileSync(scriptPath, "not a real script");
    const data = makeProjectData({ scriptPath });
    writeProjectData(slug, data);
    fs.rmSync(scriptPath);

    expect(() => readProjectData(slug)).toThrow("process.exit(1)");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Script file no longer found"));
  });

  it("does not require scriptPath to exist when it's null", () => {
    const data = makeProjectData({ scriptPath: null });
    writeProjectData(slug, data);

    expect(() => readProjectData(slug)).not.toThrow();
  });
});

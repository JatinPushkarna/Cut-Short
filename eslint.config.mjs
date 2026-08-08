import { config } from "@remotion/eslint-config-flat";

export default [
  // Project-scaffolded campaign content, not tool source -- see
  // .gitignore's matching entries. Keep this list in sync with it: the
  // point is that lint validates the generic tool, not whatever project
  // happens to be scaffolded locally.
  { ignores: ["src/<project>/**", "src/<project>/**"] },
  ...config,
];

/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(enableTailwind);
// Works around a webpack wasm-hash crash on newer Node.js versions
// (https://github.com/webpack/webpack/issues/17870)
Config.overrideWebpackConfig((config) => ({
  ...config,
  output: {
    ...config.output,
    hashFunction: "sha256",
  },
}));

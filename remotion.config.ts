/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

// PNG frame capture (lossless) + a near-lossless CRF and a slower x264
// preset (better quality per bit) so the 4K source footage isn't visibly
// re-compressed on top of an already-lossy intermediate.
Config.setVideoImageFormat("png");
Config.setCrf(12);
Config.setX264Preset("slow");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(enableTailwind);
// Works around a webpack wasm-hash crash on newer Node.js versions
// (https://github.com/webpack/webpack/issues/17870). Note: this crash comes
// from webpack's *filesystem* cache (resolveBuildDependencies contexthash),
// which Remotion re-enables internally regardless of `cache: false` set via
// overrideWebpackConfig -- setCachingEnabled(false) is the option that
// actually disables it.
Config.setCachingEnabled(false);
Config.overrideWebpackConfig((config) => ({
  ...config,
  output: {
    ...config.output,
    hashFunction: "sha256",
  },
}));

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
// Windows Smart App Control blocks Remotion's own bundled ffprobe.exe
// (@remotion/compositor-win32-x64-msvc) from executing -- this started
// happening mid-project with no version change on our side (worked fine
// on identical remotion@4.0.500 before). ffmpeg.exe and remotion.exe from
// the same package are NOT blocked and work fine standalone -- swapping
// those out too (e.g. for system ffmpeg) breaks the compositor's internal
// OffthreadVideo frame decoding, which expects its own matched ffmpeg
// build. Rather than weaken Smart App Control, point Remotion at a merged
// binaries folder (gitignored `.remotion-bin/`) that's the bundled
// ffmpeg.exe + remotion.exe unchanged, with only ffprobe.exe swapped for
// the already-trusted system one (winget) -- setBinariesDirectory expects
// all three binaries in the same folder, so a partial override needs a
// full folder, not just the one file.
Config.setBinariesDirectory(
  "C:\\Users\\jatin\\Documents\\my-video\\.remotion-bin"
);
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

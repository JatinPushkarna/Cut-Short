// Runs automatically before `npm run dev`/`npm run build` (see package.json's
// predev/prebuild). src/Root.local.tsx is gitignored -- this creates it from
// the generic committed example the first time it's missing (a fresh clone,
// or after deleting it), and never touches it again once it exists, so a
// project's own local registrations are never overwritten.
const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "src", "Root.local.tsx");
const source = path.join(__dirname, "..", "src", "Root.local.tsx.example");

if (!fs.existsSync(target)) {
  fs.copyFileSync(source, target);
  console.log(
    "Created src/Root.local.tsx from the example -- edit it freely, it's gitignored.",
  );
}

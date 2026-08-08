import "./index.css";
import { MyComposition } from "./Composition";

// Generic scaffold only -- never add project-specific compositions here.
// Local previews go in the gitignored src/Root.local.tsx instead (see
// src/Root.local.tsx.example and scripts/ensure-root-local.js).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
    </>
  );
};

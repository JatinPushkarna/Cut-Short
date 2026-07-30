import "./index.css";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { Day1Teaser } from "./Day1Teaser";
import { Day02TrafficBrutal } from "./Day02TrafficBrutal";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition
        id="Day1Teaser"
        component={Day1Teaser}
        durationInFrames={210}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Day02TrafficBrutal"
        component={Day02TrafficBrutal}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
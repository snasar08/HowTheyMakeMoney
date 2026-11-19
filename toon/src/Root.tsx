import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { HtmmShort, HTMM_FRAMES } from "./videos/htmm/Bridge";
import { AhShort, AH_FRAMES } from "./videos/afterhour/Ah";
import { AhFilm } from "./videos/afterhour/Film";

export const Root: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="AhShort" component={AhShort} durationInFrames={AH_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="AhFilm" component={AhFilm} durationInFrames={AH_FRAMES} fps={30} width={1280} height={720} />
    <Composition id="HtmmShort" component={HtmmShort} durationInFrames={HTMM_FRAMES} fps={30} width={1080} height={1920} />
  </>
);

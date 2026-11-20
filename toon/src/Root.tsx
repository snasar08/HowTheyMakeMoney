import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { HtmmShort, HTMM_FRAMES } from "./videos/htmm/Bridge";
import { AhShort, AH_FRAMES } from "./videos/afterhour/Ah";
import { Film2D, D2_FRAMES } from "./videos/film2d/Film2D";

export const Root: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="AhShort" component={AhShort} durationInFrames={AH_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="Film2D" component={Film2D} durationInFrames={D2_FRAMES} fps={30} width={1280} height={720} />
    <Composition id="HtmmShort" component={HtmmShort} durationInFrames={HTMM_FRAMES} fps={30} width={1080} height={1920} />
  </>
);

import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { HtmmShort, HTMM_FRAMES } from "./videos/htmm/Bridge";

export const Root: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="HtmmShort" component={HtmmShort} durationInFrames={HTMM_FRAMES} fps={30} width={1080} height={1920} />
  </>
);

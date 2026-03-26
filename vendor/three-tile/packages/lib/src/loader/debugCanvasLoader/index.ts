/**
 * @description: Plugin of debug canvas loader
 */

import { registerImgLoader } from "../..";
import { DebugCanvasLoader } from "./DebugCanvasLoader";

registerImgLoader(new DebugCanvasLoader());

export { DebugCanvasLoader };

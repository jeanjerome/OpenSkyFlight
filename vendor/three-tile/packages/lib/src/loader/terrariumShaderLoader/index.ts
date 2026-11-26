/**
 * @description: Plugin of Terrarium shader loader
 */

import { registerDEMLoader } from "../..";
import { TerrariumShaderLoader } from "./TerrariumShaderLoader";
import { MAX_STITCH_LEVELS, gridCells, parentRow } from "./grid";
export type { RunwayInput } from "./heights";

registerDEMLoader(new TerrariumShaderLoader());

export { TerrariumShaderLoader, MAX_STITCH_LEVELS, gridCells, parentRow };

/**
 * @description: Plugin of Terrarium shader loader
 */

import { registerDEMLoader } from "../..";
import { TerrariumShaderLoader } from "./TerrariumShaderLoader";

registerDEMLoader(new TerrariumShaderLoader());

export { TerrariumShaderLoader };

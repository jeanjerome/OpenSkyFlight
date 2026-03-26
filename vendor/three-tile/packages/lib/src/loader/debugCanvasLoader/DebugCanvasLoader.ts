/**
 * @description: Debug canvas loader — draws tile coordinates (z/x/y) on a colored grid.
 */

import { TileCanvasLoader } from "../TileCanvasLoader";
import { TileSourceLoadParamsType } from "..";

const COLORS = [
	"#ff6666", "#66ff66", "#6666ff", "#ffff66", "#ff66ff", "#66ffff",
	"#ff9933", "#9933ff", "#33ff99", "#ff3399", "#3399ff", "#99ff33",
	"#cc6600", "#0066cc", "#66cc00", "#cc0066", "#00cc66", "#6600cc",
	"#ff4444", "#44ff44",
];

export class DebugCanvasLoader extends TileCanvasLoader {
	public readonly dataType = "debug";

	protected drawTile(ctx: OffscreenCanvasRenderingContext2D, params: TileSourceLoadParamsType): void {
		const { x, y, z } = params;
		const w = ctx.canvas.width;
		const h = ctx.canvas.height;

		// Background color based on zoom level
		const bg = COLORS[z % COLORS.length];
		ctx.fillStyle = bg;
		ctx.globalAlpha = 0.4;
		ctx.fillRect(0, 0, w, h);
		ctx.globalAlpha = 1.0;

		// Border
		ctx.strokeStyle = "#000";
		ctx.lineWidth = 2;
		ctx.strokeRect(1, 1, w - 2, h - 2);

		// Tile coordinates text
		ctx.fillStyle = "#000";
		ctx.font = "bold 28px monospace";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(`Z${z}`, w / 2, h / 2 - 30);
		ctx.fillText(`X${x}  Y${y}`, w / 2, h / 2 + 10);

		// Grid lines
		ctx.strokeStyle = "rgba(0,0,0,0.3)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
		ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
		ctx.stroke();
	}
}

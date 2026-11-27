# Armée de l'Air livery — source sheets

DXT1 textures of the "AdA" livery made by Aerojust for the Rafale M mod of DCS
World by Patrick56, "Armee de l'Air skins for DCS MOD RAFALES 2.5.5 BETA",
released as freeware with unlimited distribution. The variant kept here carries
no tail number and no side code:

| File | Surfaces |
|---|---|
| `rafale_lw_t.dds`, `rafale_rw_t.dds` | left and right wing, upper and lower surfaces |
| `rafale_derive_t.dds` | both sides of the fin and rudder, rear fuselage side (no tail number) |
| `rafale_nez_t.dds` | radome, forward fuselage top and sides (no side code) |
| `rafale_fuselage_t.dds` | rear fuselage top: engine nacelles and dorsal spine |
| `rafale_fuselage2_t.dds` | fuselage underside, intake lower lips |

Their UV layout belongs to the DCS mesh: `npm run livery:build`
(`scripts/rafale-livery.js`) projects them onto our model and writes the
`Rafale.gltf` beside this folder.

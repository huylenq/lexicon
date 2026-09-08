# Classic landscape artwork

`landscape-sprites.png` was generated with the built-in GPT Image tool. The selected source is `exec-2d170a97-1221-4b1a-9b85-3976a83c4e4d.png`: an unmodified 1254 by 1254 RGBA PNG with real transparency. The classic style follows the same user-provided visual direction as the village buildings. No third-party game assets are distributed.

The atlas contains mountains, rocky hills, a spring, a pond, a mixed grove, birches, berry shrubs, wildflowers, and boulders. Each crop is measured from its visible alpha silhouette and isolated with an SVG clip. `VillageLandscape.tsx` supplies the crops; `generate.ts` produces deterministic feature footprints, habitat clusters, and ground patches. Large features clear model objects, labels, foreign contexts, and the entire road corridor. Island features remain within the coast. Terrain choices change the mix of features without altering the domain model.

## Generation prompt

```text
Use case: stylized-concept
Asset type: Transparent PNG landscape sprite atlas for a procedural classic village map.
Create ONE square PNG with ACTUAL TRANSPARENT RGBA background. Exactly 3 columns by 3 rows, 9 separate landscape illustrations, one centered per cell. Each entire illustration including every branch, rock and shadow must fit inside central 70% of its cell. At least 15% fully transparent padding on EVERY side of each cell, no overlaps.
Art style: CLASSIC EARLY TRAVIAN village comic artwork, high overhead three-quarter view, fine confident dark ink outlines, flat pale-green meadows, rounded lime-green foliage, light grey angular stone, pale cyan water. Simple 2-3 tone cel shading, a few sparse hand-drawn hatch marks. Slightly crooked playful silhouettes. Designed to read at 50-120 pixels. NOT painterly, not realistic, not modern 3D game art, no fine noise textures or individual grass-blade rendering. Natural shapes without rectangular terrain tiles.
Exact subjects in reading order:
Top left: an asymmetric MOUNTAIN CLUSTER, three overlapping jagged pale-grey peaks, highest toward left, tiny white snow caps, dark ink rock cracks, pale green foothills.
Top middle: a low ROLLING HILL with grassy slopes, exposed light-grey cliff ledges and three scattered small rocks, one tiny bush. Wide irregular silhouette.
Top right: a natural SPRING, water emerging between a few large grey rocks, a tiny cascade into a bright cyan pool with a short curving rill, reed tufts and one small bush. The water path stays fully inside its cell.
Middle left: irregular POND with pale cyan shallow water, darker blue inner rim, a few lily pads, reeds, and grey shore stones. Clearly different from the rocky spring. Low wide silhouette.
Middle middle: an irregular GROVE of three deciduous trees of different sizes and shapes: one round oak, a smaller spreading tree, and a slender taller tree. Rounded lime and olive canopy clusters with short brown trunks, asymmetrical arrangement.
Middle right: TWO BIRCH TREES, slim white trunks with black bark marks, airy irregular pale-green foliage, different heights, a little fern at roots.
Bottom left: a low irregular cluster of berry SHRUBS, dark and light green rounded foliage with a few tiny red berries and trailing leafy sprigs.
Bottom middle: a small WILDFLOWER MEADOW tuft, irregular green low grass patch with a few tiny white daisies and yellow and pink flowers. Sparse, graphic, no bouquet.
Bottom right: a BOULDER OUTCROP, five irregular grey rocks of different sizes with black cracks, one flat slab and a tiny mossy green tuft. Wide low silhouette.
Consistency: fine dark line work, simple flat colors, high overhead camera. Small local ground patches may connect elements within a feature but edges must end naturally into transparency. Do not draw square or diamond tile bases. No buildings, no text, no labels, no logo, no UI, NO CHECKERBOARD GRAPHIC, no background color. Only the nine isolated landscape subjects on true transparency.
```

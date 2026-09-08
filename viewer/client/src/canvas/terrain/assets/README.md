# Classic Village artwork

`village-sprites.png` is an original sprite atlas created with the built-in GPT Image tool. It is bundled with the application; generation is never called at runtime.

`landscape-sprites.png` adds mountains, hills, springs, ponds, and varied vegetation. Its generation prompt and provenance are in [LANDSCAPE.md](LANDSCAPE.md). Ground patches and texture marks remain procedural SVG.

The style reference is the user's classic Travian village screenshot (`image.png`): a high overhead view with black comic outlines, bright yellow roofs, pale grey masonry, lime-green foliage, and simple cel shading. A reference-image draft established the art direction; the final transparent sheet was generated from the style specification below. It is not distributed with the application.

`village.ts` records source crops and facade bounds. `VillageSprites.tsx` clips each sprite, preserves its proportions, and fits it within the existing landmark frame. Road endpoints meet the illustrated facade. Terrain, roads, labels, interaction geometry, and placement remain procedural. The offline app shell caches the sprite sheet; image failures fall back to Ink marks. Dark mode adjusts brightness and saturation. Raster detail remains finite at high zoom.

## Generation prompt

```text
Use case: stylized-concept
Create a NEW production sprite sheet in the classic early Travian village drawing style: old browser-game cartoon illustrations with confident thin black ink contours, bright flat lemon-yellow roofs, very pale grey stone, warm brown wood, rounded lime-green trees, minimal 2-tone cel shadows. Use a high overhead three-quarter camera, compact squat shapes and playful slightly crooked outlines.
CRITICAL ART DIRECTION: hand-INKED 2D comic game sprites with simple hand-drawn forms. Flat solid fills with at most 2 or 3 discrete shadow tones. Bright yellow roof surfaces with just a few sparse curved ink hatch marks. Chunky visible grey stones outlined in black. Broad rounded green tree canopy lobes with black contour lines. Low detail designed to read at 64 pixels. No individual grass blades, no photoreal texture, no painterly brushwork, no brown/golden realistic thatch, no 3D-render appearance, no realistic lighting, no ambient-occlusion look. This is simple classic browser-game art, not a modern game remaster.
Output ONE square PNG sprite atlas on a genuinely TRANSPARENT RGBA background. Exactly 3 columns and 3 rows. Nine isolated subjects, one per cell. Each ENTIRE subject including shadows must fit inside the central 70 percent of its cell, with generous transparent gutters all around so neighboring sprites never overlap. No checkerboard image, no background color, no text, no gridlines, no logo, no scene or enclosing wall. Do not include any reference screenshot, portraits, logos, or UI.
Exact subjects in reading order:
Top-left: squat timber and ivory-plaster cottage, simple bright YELLOW curved roof, tiny square window and brown door, small grey stone chimney.
Top-middle: wide low village hall, two joined simple yellow-roofed wings, short central timber entry porch and tiny red pennant. Broad horizontal silhouette.
Top-right: rustic blacksmith shed with brown plank roof, distinctive tall pale-grey tapered furnace chimney, a little yellow-roof lean-to, one barrel.
Middle-left: broad low archive or academy, pale-grey masonry, small bright yellow dome, a low yellow-roof side wing, brown door and two arched windows. Simple whimsical building, not a grand temple.
Middle-middle: short round grey stone watchtower, bright yellow mushroom-like conical thatch cap, tiny red flag and brown door.
Middle-right: flat low vegetable garden, three simple rows of round green cabbage heads in beige soil, a short brown fence and open gate, viewed from high above.
Bottom-left: small oak tree, plump clustered lime-green canopy lobes, dark ink outline, short brown trunk and two simple root marks.
Bottom-middle: cluster of three small pointed green fir trees, simple stacked silhouette layers and black ink contours.
Bottom-right: small pale-yellow wheat field patch with a few ink crop-row strokes, simple irregular ground outline.
Original designs in the classic ink-and-flat-colour art style. Consistent overhead camera and outline weight across all nine sprites. Minimal contact shadow only. Avoid elaborate landscaped bases. At least 15% empty transparent padding on EVERY side of EVERY cell.
```

## Selected output

The selected file is the unmodified 1254 by 1254 RGBA output `exec-8f04f04f-e79a-4d55-baef-b1a8669eec88.png`. Alpha inspection confirms real transparency. Individual silhouette crops include a four-pixel gutter and are clipped explicitly in SVG to prevent neighboring art from showing in aspect-ratio margins.

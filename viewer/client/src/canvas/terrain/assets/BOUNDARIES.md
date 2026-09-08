# Village boundary artwork

`boundary-sprites.png` is an unmodified 1254 by 1254 RGBA atlas generated with the built-in GPT Image tool. Source: `exec-52384919-c628-4865-a307-f17376725e86.png`. It contains original illustrations following the user's classic Travian art direction, not extracted game assets.

`VillageBoundary.tsx` defines measured crops. The engine places overlapping upright natural scenery with stable variants and checks the complete sprite footprints against objects and roads. Village towers use raster artwork with the original vector geometry as a load-error fallback. Continuous wall faces retain their geometry and receive a raster masonry texture. Ink uses its existing vector boundary renderer.

## Generation prompt

```text
Use case: stylized-concept
Asset type: transparent PNG sprite atlas for procedurally assembled classic village-map boundaries.
Create ONE square PNG with true RGBA transparency. EXACTLY 4 equal columns and 4 equal rows, 16 isolated subjects, each centered in its cell, at least 10% completely transparent padding on every side. No grid lines or labels.
Style: original artwork evoking CLASSIC EARLY TRAVIAN, the old cheerful European comic village map. High overhead three-quarter camera, thin confident dark-brown ink contours, bright yellow thatch, lime and olive rounded leafy clumps, pale warm-grey stone, terracotta courses, pale cyan water. Flat 2-3 tone cel shading and sparse hand-inked cracks. Slightly crooked asymmetric forms. Readable at 30-65px. No modern 3D, no realistic painting, no fine noise, no glossy mobile-game look.
Subjects reading order:
ROW 1 woodland boundary pieces: (1) asymmetric cluster of two spreading leafy oaks, (2) two different-height slender conifers and a low round bush, (3) dense broad low hedgerow with three irregular rounded leafy masses and exposed short branches, (4) single large crooked oak with three distinct round canopy masses and a tiny bush.
ROW 2 cliff boundary pieces: four different low wide exposed ROCK LEDGES, each with a green grassy upper lip and warm-grey irregular vertical rock face with dark fissures, varied rock height and small scattered stones at foot. First broad ledge, second broken chunky outcrop, third terraced two-level ledge, fourth longer shallow ledge. These are boundary modules, NOT isolated tall mountain peaks. Irregular ends that can overlap another rock.
ROW 3 wetland/coast boundary pieces: (1) cluster of tall cattails and reeds rooted in a small irregular cyan shallows patch, (2) shorter rushes mixed with water lily leaves and two pebbles in shallow water, (3) low wide sandy beach lip with three varied rounded shore rocks, a tiny grass tuft and a thin cyan edge, (4) low irregular grassy bank with sand, a single grey rock and a few reeds. Organic edges and transparent outside; no rectangular or diamond tiles.
ROW 4 masonry: (1) short horizontal classic village wall section, ivory masonry front with terracotta lower course, walkway top seen from above and irregular crenellations; no towers, (2) round defensive turret, ivory stone, terracotta foot, yellow conical thatch roof, small dark slit window, no flag, (3) square crenellated defensive turret, ivory stone and terracotta course, small slit, no roof or flag, (4) small stone arch gatehouse with open transparent arch opening, two short side piers and yellow pitched roof.
Entire silhouettes fully inside cells. No UI, text, numbers, logos, checkerboard, surrounding scene or background. Genuine alpha transparency. Lighting from upper left. All original illustrations, not copied game sprites.
```

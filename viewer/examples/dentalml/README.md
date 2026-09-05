# Model trial: measuring a selected tooth's canals

This trial reflects DentalML's current measurement workflow. The domain names and context boundaries below are proposed annotations. The linked implementation supplies the evidence.

Source: sibling checkout `../dentalml`, HEAD `a5fbaa3fdc829ff3cb62ee36dbd8ee3f245e6889`. The three linked source files match that revision. This is a source-based modeling exercise; clinical accuracy and the running UI are outside its evidence.

## The human picture

A researcher selects a tooth from labelled tooth and pulp volumes. The app isolates its masks, prepares local geometry, extracts canal paths, and computes measurements. For the posterior strategy, it derives an occlusal reference point from the arch and adds the reference-to-orifice distance to the canal path length. The app presents a table and restores local geometry for display.

The useful questions are: Which tooth did I select? Which canal am I measuring? What path does this number describe? What changes when the reference point or geometry changes?

## Contexts and concepts

Each concept has an independent stable ID. Context ownership supplies meaning; the names below are display names.

| Context | Responsibility | Concepts (ID: meaning) |
|---|---|---|
| Tooth selection (`selection`) | Identify the requested tooth and isolate its data | **Selected tooth** (`selected-tooth`): FDI label used to select tooth and pulp masks. **Tooth input** (`tooth-input`): selected masks, volume metadata, and arch data supplied to measurement. |
| Canal measurement (`measurement`) | Derive geometry and measurements for each extracted canal | **Canal measurement** (`canal-measurement`): proposed aggregate root gathering one canal's geometry and results. **Canal index** (`canal-index`): enumeration within an extraction result. **Measurement path** (`measurement-path`): ordered local voxel points used for length and angle calculations. **Reference point** (`reference-point`): the point used to establish the measurement's starting reference. **Length result** (`length-result`): path length and, when populated, reference distance and combined working length in millimeters. |
| Measurement presentation (`presentation`) | Turn measurement results into a table and spatial view | **Displayed path** (`displayed-path`): restored points prepared for drawing, optionally extended with Point O. |

These are proposed bounded contexts within one application. Their responsibilities cross functions and files.

## Relationships

| ID | Source → relation → target | Annotation |
|---|---|---|
| selects-input | selected-tooth → selects → tooth-input | The same FDI label selects both masks. |
| derives-measurement | tooth-input → supplies → canal-measurement | Cropping, orientation handling, extraction, and calculation produce canal results. |
| identifies-canal | canal-index → identifies locally → canal-measurement | `Canal.tooth_id` is assigned `apice_id` from enumeration. Its meaning is a canal index; FDI remains a separate input. |
| owns-path | canal-measurement → contains → measurement-path | The root gathers the path with its endpoints and region. |
| owns-reference | canal-measurement → contains → reference-point | Reference semantics depend on the selected calculation branch. |
| owns-length | canal-measurement → contains → length-result | Length depends on geometry and volume spacing. |
| renders-path | measurement-path → becomes → displayed-path | Presentation restores coordinates and may prepend Point O to the drawn path. |
| presents-results | measurement → supplies results to → presentation | The app converts the result objects into rows and plotting annotations. |

Annotation on **identifies-canal**: local index is sufficient to distinguish canals in one returned list. Persistent identity across recalculation would require a separate decision.

Annotation on **renders-path**: in the posterior display path, Point O is prepended to a new array. The measurement path remains the input for the tabulated path length and angle. The single-canal calculation branch separately prepends a crown reference to the measurement path itself. These branch conditions matter when interpreting a label such as “centerline.”

## Aggregate trial

Represent **Canal measurement** as a Concept classified `aggregate`, with `owns-path`, `owns-reference`, and `owns-length` describing its members. Its annotation states the consistency rule: geometry, reference, spacing, and derived values must describe the same calculation.

Evidence qualifications belong beside the rules:

| Rule | Source evidence | Qualification |
|---|---|---|
| Path length uses physical spacing | `centerline_length_mm` multiplies voxel differences by spacing in Z,Y,X order before summing segment lengths. | Observed calculation. |
| Posterior working length equals path length plus Point O-to-orifice length | `canal_measurement_module_v2` assigns `working_length_mm = length_b_mm + length_mm`. | Observed assignment when the posterior branch completes. |
| Posterior calculation requires arch data | The posterior branch raises `ValueError` when `teeth_instance` is absent. | Explicit input guard. |
| Changing a path requires its measurements to be recalculated | Path and results are fields on the mutable `Canal` object; the app also recalculates some displayed values. | Proposed aggregate consistency rule. Mutation control is distributed across callers. |

The aggregate classification expresses the human consistency boundary. The current `Canal` class acts as a mutable result container. This trial supports describing an aggregate candidate while keeping its implementation guarantees explicit.

## Code links

| Owner | File and symbol | Role |
|---|---|---|
| selects-input | [canal_measurement_app.py](../../../../dentalml/apps/pages/canal_measurement_app.py) · `measure_canal` | Implementation: parses FDI and selects both masks. |
| canal-measurement | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `Canal` | Representation: gathers geometry and result fields. |
| derives-measurement | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `canal_measurement_module_v2` | Implementation: prepares selected masks and orchestrates calculation. |
| identifies-canal | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `extract_canal_and_centerline` | Evidence: assigns enumerated apex index to `tooth_id`. |
| measurement-path | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `extract_canal_and_centerline` | Implementation: constructs paths using the selected method. |
| reference-point | [canal_util.py](../../../../dentalml/dentalml/endo/canal_util.py) · `ref_point_posterior` | Implementation: derives the posterior reference point. |
| reference-point | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `canal_measurement_module_v2` | Usage: maps the reference into the local geometry frame. |
| length-result | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `centerline_length_mm` | Implementation: converts voxel path segments into physical lengths. |
| owns-length | [canal_measurement.py](../../../../dentalml/dentalml/endo/canal_measurement.py) · `canal_measurement_module_v2` | Implementation: combines the posterior length components. |
| renders-path | [canal_measurement_app.py](../../../../dentalml/apps/pages/canal_measurement_app.py) · `measure_canal` | Implementation: restores geometry and constructs the displayed path. |

## What the trial changes

The four objects cover selection, calculation, presentation, and the proposed aggregate. Two conventions make them more useful:

1. **Annotate code names explicitly.** A concept's domain name can differ from a linked field or symbol. Its code link explains the correspondence, as with Canal index and `Canal.tooth_id`.
2. **Qualify rules beside their evidence.** Distinguish a proposed consistency rule, an observed calculation, and an explicit guard in the annotation. This keeps the model faithful to existing implementation.

Aggregate membership fits named relationships and a root annotation in this example. A shared kernel remains untested: these contexts pass data between stages, which alone supplies insufficient evidence of a deliberately shared domain model.

Explore this question in the reader: **Why does the drawn path differ from the path being measured?** A reader should reach `renders-path`, see its branch-specific explanation, and open the relevant code.

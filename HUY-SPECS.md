# Huy's product specifications

These requirements capture agreed product behavior. [MANIFESTO.md](MANIFESTO.md) and [MODEL.md](MODEL.md) define Lexicon's direction and semantic model; [viewer/CANVAS.md](viewer/CANVAS.md) and [PLANES.md](PLANES.md) describe canvas operation.

## Canvas movement

Preserve free dragging across Domain, Architecture, and Linked Sources in individual 2D views, Combined, and Planes. The dragged selection follows the pointer while nearby objects make room. Group boundaries continue to grow and shrink with their contents, and an expanding group can displace neighboring groups with their contents.

Neighbor movement is a reversible live preview. Calculate the required displacement from the layout at the start of the drag. Objects passed along the way return when their displacement is no longer needed; repeated passes must not accumulate movement. Release keeps the displacement required at the final destination. Escape cancels the gesture, and one Undo restores the committed drag and its displaced neighbors. Keyboard nudges resolve displacement immediately.

Locked objects stay fixed. Collision handling stays within the owning plane. Freeform drawings and relationship labels do not participate; attached notes follow their targets. Combined edits update the owning page's presentation. Movement preserves semantic membership and model XML.

Overlap avoidance assists free placement; it is not an absolute layout constraint. Locked objects, multiple selected objects, and bounded collision work can leave overlaps. Keep interaction work bounded, honor reduced motion, and stop animation when the preview settles. Opening a canvas must not rearrange it.

Collision work limits must count candidate checks, including noncontacts and oversized groups. Reuse nested geometry within a preview calculation and invalidate affected ancestor bounds after inner movement. Browser checks should wait for stable transforms across rendered frames; use reduced motion for checks that concern persistence or history, while retaining coverage of normal easing and cancellation.

## Maintenance and acceptance

The current interaction is the functional baseline. Preserve dragging freedom during maintenance; do not introduce boundary clamping or require a separate action to make room. Review implementation complexity, gesture cleanup, undo, persistence, nested group bounds, and Combined synchronization against that baseline.

Nested objects, especially on Linked Sources, can still cause more movement than desired when resizing propagates through ancestors. This remains a tuning concern, not a requirement to remove automatic resizing or prevent boundary-driven displacement. Any later tuning should preserve free dragging and reversible previews.

Exercise pass-through and repeated passes, final placement, cancellation, undo/redo, reload, nested groups, and Combined write-through when changing movement. Distinguish automated checks from live interaction acceptance, and report remaining limitations explicitly.

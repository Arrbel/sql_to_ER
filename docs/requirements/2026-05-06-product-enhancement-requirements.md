# SQL to ER Product Enhancement Requirements

Date: 2026-05-06
Status: Draft
Owner: Arrbel

## 1. Background

This project is a fork of `ystemsrx/sql_to_ER`. The current product is a pure front-end SQL / DBML to Chen-model ER diagram generator. It already supports core parsing, graph rendering, layout optimization, local history, node label editing, and PNG / SVG / drawio export.

The next stage should optimize and extend the product on top of the existing project instead of replacing it. The goal is to evolve it from a one-shot converter into a lightweight ER modeling workspace that remains easy to use, browser-only, and friendly to upstream synchronization.

## 2. Product Positioning

The product should help users move from database structure text to a readable, editable, reusable ER diagram.

Core workflow:

```text
SQL / DBML input -> parsed model -> ER diagram -> interactive editing -> styled export / project reuse
```

The product is not intended to become a full database administration tool. It should stay focused on DDL understanding, Chen-model ER visualization, lightweight editing, and export.

## 3. Target Users

### 3.1 Backend Developers

Backend developers need to paste existing DDL and quickly understand entities, columns, keys, and table relationships. They use the diagram for code reviews, documentation, architecture discussion, and onboarding.

### 3.2 Database Designers

Database designers need to inspect schema structure, tune relationship labels, adjust layout, and export diagrams into design documents or collaborative tools.

### 3.3 Students and Teachers

Students and teachers need to convert course SQL / DBML examples into Chen-model ER diagrams for assignments, lectures, reports, and database design exercises.

### 3.4 Product, Architecture, and Data Analysts

Non-database specialists need to understand business entities and relationships without reading raw DDL in detail.

## 4. Current Problems

1. Real-world DDL often includes `ALTER TABLE`, standalone comments, constraints, and dialect-specific syntax that are not fully covered by the current parser.
2. Parsing failures are too coarse. Users cannot easily tell whether the input is invalid or unsupported.
3. Large schemas become difficult to browse because locating entities and understanding local relationships is hard.
4. Generated diagrams can be lightly edited, but not maintained as long-lived modeling projects.
5. Export formats do not yet cover all common documentation and collaboration workflows.
6. History snapshots are useful but do not provide a clear project-management model.
7. Users cannot fully customize typography, sizing, colors, and visual styles for academic, presentation, or documentation use.
8. The product does not yet support true bidirectional real-time editing between source text and diagram interactions.

## 5. Requirement Scope

### In Scope

- SQL and DBML parsing improvements.
- Better parse diagnostics and partial-success feedback.
- Large-diagram navigation and relationship exploration.
- Real-time preview from source text to graph.
- Bidirectional editing between graph operations and editable source/project representation.
- Typography, size, color, and style customization.
- Import and export extensions.
- Snapshot and project-management improvements.
- Test coverage and maintainability improvements.

### Out of Scope

- Connecting directly to live databases.
- Executing SQL.
- User accounts, cloud storage, or collaboration servers.
- Full database migration management.
- Backend services for parsing or rendering.
- Replacing the current pure front-end deployment model.

## 6. Functional Requirements

### 6.1 SQL and DBML Parsing

The product shall support more real-world schema definitions while preserving existing SQL / DBML behavior.

Requirements:

- Parse `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`.
- Parse `ALTER TABLE ... ADD FOREIGN KEY`.
- Parse PostgreSQL `COMMENT ON TABLE`.
- Parse PostgreSQL `COMMENT ON COLUMN`.
- Parse SQL composite foreign keys.
- Improve detection of unique constraints and their effect on relationship cardinality.
- Preserve schema-qualified table names.
- Preserve table names, column names, comments, primary keys, foreign keys, unique constraints, and relationship metadata.
- Continue supporting current SQL and DBML fixtures.

Acceptance criteria:

- DDL with table definitions and later `ALTER TABLE` foreign keys produces correct relationships.
- PostgreSQL comments can be displayed as entity or attribute labels.
- Composite foreign keys are represented without losing relationship context.
- Existing 73 parser / builder / export tests continue to pass.
- New parser behavior is covered by regression tests.

### 6.2 Parse Diagnostics

The product shall explain parsing problems clearly enough for users to correct input or understand unsupported syntax.

Requirements:

- Distinguish empty input, no supported table definitions, unsupported statements, and malformed constraints.
- Report skipped or unsupported statements where possible.
- Allow partially successful parsing: if some tables parse and some statements fail, show the valid diagram and warn about skipped parts.
- Preserve the last valid diagram during invalid intermediate input.
- Provide user-facing messages in Chinese and English.

Acceptance criteria:

- Users see a meaningful message instead of only "no valid table" for unsupported DDL.
- Users can identify which type of statement was ignored or unsupported.
- A temporary syntax error during editing does not destroy the current valid diagram.

### 6.3 Real-Time Source-to-Diagram Preview

The product shall update the ER diagram automatically when the user edits SQL or DBML text.

Requirements:

- Source text changes trigger automatic parsing after a short debounce.
- Successful parses update the diagram without requiring the Generate button.
- Invalid intermediate input keeps the last valid graph visible and displays diagnostics.
- Existing manual generate behavior remains available.
- User-adjusted node positions should be retained where stable node identity can be matched.

Acceptance criteria:

- Renaming a table or column in the source updates the diagram shortly after typing stops.
- Adding a valid foreign key updates relationships automatically.
- Breaking SQL temporarily does not clear the canvas.
- Fixing the input resumes automatic updates.

### 6.4 Bidirectional Real-Time Editing

The product shall allow users to edit the model from both source text and graph interactions, with changes reflected in real time.

Requirements:

- Editing source text updates the diagram.
- Editing graph labels updates the underlying model.
- Graph-side edits can update a generated DBML or project representation.
- Users can rename entities, attributes, and relationships from the diagram.
- Users can modify relationship cardinality from the diagram.
- Users can add or remove entities, attributes, and relationships in the modeling layer.
- Edits should be persisted in snapshots or project files.

Important constraint:

- SQL should be treated primarily as an import format.
- DBML or a project JSON model should become the preferred editable representation for true bidirectional workflows.
- The product should avoid promising perfect SQL round-trip editing for all dialects.

Acceptance criteria:

- Renaming an entity in the graph updates the editable model representation.
- Adding an attribute in the graph appears in the editable DBML or project representation.
- Removing a relationship in the graph removes it from the model representation.
- Refreshing or restoring a project preserves graph-side edits.

### 6.5 Large-Diagram Navigation

The product shall remain usable for larger schemas.

Requirements:

- Search entities by table name.
- Search attributes by column name.
- Focus the viewport on a selected node.
- Highlight an entity's directly related relationships and neighbor entities.
- Provide a relationship-only or skeleton view by hiding attributes.
- Support schema or module grouping where metadata exists.
- Consider mini map or overview navigation for large diagrams.

Acceptance criteria:

- A user can locate a target table quickly in a 30+ table diagram.
- A user can highlight one entity and inspect its immediate upstream / downstream relationships.
- Hiding attributes makes dense diagrams easier to arrange.

### 6.6 Graph Editing

The product shall support practical diagram corrections after generation.

Requirements:

- Rename entity display labels.
- Rename attribute display labels.
- Rename relationship labels.
- Modify relationship cardinality: `1:1`, `1:N`, `N:1`, and `M:N` where supported.
- Add and remove entities.
- Add and remove attributes.
- Add and remove relationships.
- Persist edits in snapshots and project files.

Acceptance criteria:

- Users can correct business names without rewriting source input.
- Users can manually fix relationship labels for Chen-model readability.
- User edits survive history restore or project import/export.

### 6.7 Typography and Style Customization

The product shall allow users to customize diagram typography and visual style.

Requirements:

- Set global font family.
- Set entity, attribute, and relationship font sizes.
- Set font weight and optional italic style.
- Adjust line height or text spacing where needed.
- Set entity, attribute, and relationship fill colors.
- Set border colors and border widths.
- Set edge color and edge width.
- Set canvas background color.
- Choose transparent or solid export background where supported.
- Restore default style settings.

Acceptance criteria:

- Changing font size updates the visible graph.
- Exported PNG / SVG / drawio output reflects selected styles where technically supported.
- Larger text does not overflow nodes without node-size adjustment.
- Users can return to default styling in one action.

### 6.8 Style Presets

The product shall provide style presets for common use cases.

Requirements:

- Default color preset.
- Academic black-and-white preset.
- High-contrast presentation preset.
- Minimal line-art preset.
- Chinese report / coursework preset.
- Dark background preset where compatible.
- Presets can be adjusted after selection.

Acceptance criteria:

- Applying a preset changes graph appearance immediately.
- Manual overrides after selecting a preset are preserved.
- Style settings are saved with snapshots or project files.

### 6.9 Import and Export

The product shall support more workflows for documentation, collaboration, and reuse.

Requirements:

- Preserve existing PNG, SVG, and drawio export.
- Add Mermaid ER export.
- Add PlantUML export.
- Add DBML export.
- Add project JSON export and import.
- Support high-resolution export.
- Support export options for background and style.

Acceptance criteria:

- Users can export diagrams for Markdown, documentation, slide decks, draw.io, and source repositories.
- Users can save a project file and later restore the same model, layout, labels, and style settings.
- Exported structured formats represent entities and relationships accurately.

### 6.10 History and Project Management

The product shall evolve from simple browser history into lightweight local project management.

Requirements:

- Name snapshots.
- Rename saved projects.
- Favorite important versions.
- Delete individual snapshots.
- Clear history safely.
- Group snapshots by input or project.
- Import and export complete project files.

Acceptance criteria:

- Users can manage multiple diagrams over time.
- Users can identify important versions by name.
- Users can back up their work before clearing browser storage.

## 7. Non-Functional Requirements

### 7.1 Privacy

- All parsing and rendering should remain browser-local.
- SQL, DBML, and project data should not be uploaded by default.
- Any future network behavior must be explicit and opt-in.

### 7.2 Performance

- Real-time parsing must be debounced.
- Large diagrams should avoid unnecessary full re-renders where possible.
- UI interactions should remain responsive for medium-to-large schemas.

### 7.3 Reliability

- Existing behavior must not regress.
- Parser changes require regression tests.
- Export changes require output structure tests where practical.
- Invalid input should not corrupt existing graph state or saved projects.

### 7.4 Maintainability

- Keep changes scoped and compatible with upstream synchronization.
- Avoid broad rewrites unless they are required for the modeling architecture.
- Preserve module boundaries between parser, model building, graph rendering, layout, history, and export.

### 7.5 Internationalization

- User-facing messages should support Chinese and English.
- Error diagnostics and style labels should be translatable.

## 8. Suggested Delivery Phases

### Phase 1: Parser and Diagnostic Foundation

Goals:

- Improve SQL parsing coverage.
- Add clearer diagnostics.
- Keep existing graph behavior stable.

Candidate requirements:

- `ALTER TABLE` foreign keys.
- PostgreSQL `COMMENT ON`.
- Composite SQL foreign keys.
- Partial parse warnings.
- Parser regression tests.

### Phase 2: Real-Time Preview

Goals:

- Reduce friction in source editing.
- Preserve stable graph state while typing.

Candidate requirements:

- Debounced source parsing.
- Last-valid-graph preservation.
- Inline diagnostics.
- Stable node-position retention.

### Phase 3: Styling and Export Polish

Goals:

- Support coursework, reports, and presentation-quality diagrams.

Candidate requirements:

- Font family and font size controls.
- Color and stroke controls.
- Style presets.
- Export style consistency.

### Phase 4: Project Model and Bidirectional Editing

Goals:

- Introduce a durable editable model.
- Support graph-to-source/project updates.

Candidate requirements:

- Project JSON model.
- Graph-side entity / attribute / relationship edits.
- DBML generation from project model.
- Project import/export.

### Phase 5: Large-Diagram Navigation and Project Management

Goals:

- Make the product useful for real schemas and repeated work.

Candidate requirements:

- Search and focus.
- Relationship highlighting.
- Schema grouping.
- Snapshot naming and favorites.
- Project list and version management.

## 9. Open Questions

1. Should DBML become the primary editable source format for bidirectional editing?
2. Should SQL round-trip editing be explicitly unsupported or limited to generated SQL only?
3. How large should the first performance target be: 30 tables, 100 tables, or more?
4. Which export format should be prioritized after PNG / SVG / drawio: Mermaid, PlantUML, DBML, or project JSON?
5. Should style presets be stored globally, per project, or both?
6. Should the live preview be enabled by default, or controlled by a toggle?
7. Should graph-side add/delete editing appear in the first bidirectional release, or should the first release only support rename/cardinality edits?

## 10. Success Metrics

- More real-world DDL inputs generate useful diagrams without manual cleanup.
- Users understand why unsupported input fails.
- Users can edit source text and see diagram updates without repeatedly clicking Generate.
- Users can customize diagram appearance for reports and presentations.
- Users can save, restore, and export complete modeling work.
- Existing tests and build remain stable across feature additions.

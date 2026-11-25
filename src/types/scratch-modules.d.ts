// Type stubs for the Scratch editing stack (wave D engine 2). These
// packages ship untyped CommonJS/browser bundles; the editor component
// accesses them through narrow structural casts (ScratchEditor.tsx), so
// `any` module declarations keep tsc honest about what we know: nothing
// more than the shape we use.
declare module 'scratch-vm';
declare module 'scratch-blocks';
declare module 'scratch-blocks/dist/vertical.js';
declare module 'scratch-render';
declare module 'scratch-svg-renderer';
declare module 'scratch-l10n/editor/blocks/ro.json' {
  const messages: Record<string, string>;
  export default messages;
}

// jest-dom's /vitest entry wires its matchers to vitest's own `expect`
// (the default entry expects a global `expect`, which vitest does not
// provide with globals: false).
import "@testing-library/jest-dom/vitest";
import "@/i18n";

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import { TextDecoder, TextEncoder } from 'util';

// react-router v7 constructs a `new TextEncoder()` at module scope (its bundled
// server-runtime crypto helper), but the jsdom environment shipped with
// react-scripts 5 / jest 27 does not expose TextEncoder or TextDecoder as
// globals, so importing react-router in a test throws
// "ReferenceError: TextEncoder is not defined". Assign them from Node's `util`
// before any test module is loaded.
//
// Deliberately unconditional: a `if (!global.TextEncoder)` guard would add an
// uncovered branch and this project enforces a 100% branch-coverage threshold.
Object.assign(globalThis, { TextEncoder, TextDecoder });

import '@testing-library/jest-dom';
import './i18n';

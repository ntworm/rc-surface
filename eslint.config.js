import globals from "globals";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "static/phone-v3/vendor/**",
      "vendor/**",
      "*.ablx",
    ],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off", // TypeScript noUnusedLocals/noUnusedParameters own this
      "no-console": "off",
      "no-var": "warn",
      "prefer-const": "warn",
    },
  },
  {
    // Browser code, which is most of what ships. Linted with real rules
    // because an undefined identifier here is a runtime crash, and a crash in
    // one initialiser takes out every initialiser after it.
    files: ["static/**/*.js", "docs/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        // Names the pages' own script tags define for one another. Each is
        // assigned in a sibling file loaded before its users.
        QRCode: "readonly",
        AudioAnalysisControls: "readonly",
        AbletonRcModes: "readonly",
        RcSurfaceI18n: "readonly",
        RcSurfaceCatalog: "readonly",
        sendWS: "readonly",
        liveControls: "writable",
        selectedControl: "writable",
        updateMappingDetailLive: "readonly",
        renderMappingsTab: "readonly",
        openSlotEditor: "readonly",
        getControlDisplayName: "readonly",
        // Probed with `typeof` before use, from controls.js.
        lfoStates: "readonly",
        stutterStates: "readonly",
        sendLfoState: "readonly",
        sendStutterState: "readonly",
        // The UMD tail these files carry for their tests.
        module: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-unused-vars": "off", // app.js/controls.js define sibling globals on purpose
      "no-empty": "off",
      "no-console": "off",
    },
  },
  {
    // Encapsulated browser modules: a single window.* export, no sibling
    // globals by design. An unused local here is real dead code, so the
    // unused-vars guard stays on. `_`-prefixed parameters are the intentional
    // ignore convention (signature parity).
    files: [
      "static/phone-v3/modules/**/*.js",
      "static/phone-v3/calibration.js",
      "static/phone-v3/sensor-capabilities.js",
      "static/phone-v3/control-stream.js",
      "static/phone-v3/safe-input-layer.js",
      "static/phone-v3/mapping-input-contract.js",
      "static/phone-v3/phone-identity.js",
      "static/phone-v3/mode-engine.js",
      "static/phone-v3/vision-control-state.js",
      "static/phone-v3/audio-smoothing.js",
      "static/phone-v3/audio-analysis-controls.js",
      "static/phone-v3/audio-workspace.js",
      "static/phone-v3/audio-descriptors.js",
      "static/phone-v3/audio-detector-timing.js",
      "static/phone-v3/audio-spectral-descriptors.js",
      "static/phone-v3/audio-processor.js",
      "static/phone-v3/audio-input-selector.js",
      "static/phone-v3/audio-timeline.js",
      "static/phone-v3/camera-lifecycle.js",
      "static/phone-v3/vision-processor.js",
      "static/shared/*.js",
    ],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // This one is a real ES module, unlike its siblings.
    files: ["static/phone-v3/stage-mode-controller.js", "static/phone-v3/audio-descriptor-worklet.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    // Maintained Node tooling: scripts/ and build.ts. Node globals, module
    // syntax, and a real undefined-identifier guard — these run on the dev
    // machine, and an undefined name here is a build failure. Browser globals
    // never apply to these files.
    files: ["scripts/**/*.mjs", "build.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tsParser,
      globals: { ...globals.node, NodeJS: "readonly" },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];

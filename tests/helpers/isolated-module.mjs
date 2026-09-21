import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real module body with controlled IO dependencies. No sockets, SDK
// host or certificate store are involved; declarations/branches stay intact.
export function isolatedModule(file, dependencies) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const body = ts.factory.updateSourceFile(source, source.statements.filter((node) =>
    !ts.isImportDeclaration(node) && !(ts.isExportDeclaration(node) && node.moduleSpecifier)));
  const { outputText } = ts.transpileModule(ts.createPrinter().printFile(body), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = vm.createContext({ exports: {}, console: { log() {}, warn() {}, error() {} }, ...dependencies });
  vm.runInContext(outputText, context, { filename: file });
  return context.exports;
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

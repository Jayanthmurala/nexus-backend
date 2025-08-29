#!/usr/bin/env node
/*
  Programmatic TypeScript checker.
  Writes diagnostics to ts-diagnostics.txt and ts-diagnostics.json in the project root.
  Usage: node scripts/tscheck.cjs [-p tsconfig.json]
*/
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function serializeDiagnostic(d) {
  return {
    file: d.file?.fileName || null,
    start: d.start ?? null,
    length: d.length ?? null,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    category: ts.DiagnosticCategory[d.category],
    code: d.code,
  };
}

function run(projectDir, tsconfigRelPath) {
  const cwd = projectDir || process.cwd();
  const tsconfigPath = path.resolve(cwd, tsconfigRelPath || 'tsconfig.json');
  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (readResult.error) {
    const text = ts.formatDiagnosticsWithColorAndContext([readResult.error], {
      getCurrentDirectory: () => cwd,
      getCanonicalFileName: (f) => f,
      getNewLine: () => ts.sys.newLine,
    });
    console.error(text);
    process.exitCode = 2;
    return;
  }
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(tsconfigPath));
  parsed.options.noEmit = true;
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const formatHost = {
    getCurrentDirectory: () => cwd,
    getCanonicalFileName: (f) => f,
    getNewLine: () => ts.sys.newLine,
  };
  const text = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);

  const outTxt = path.join(cwd, 'ts-diagnostics.txt');
  const outJson = path.join(cwd, 'ts-diagnostics.json');
  try { fs.writeFileSync(outTxt, text, 'utf8'); } catch {}
  try { fs.writeFileSync(outJson, JSON.stringify(diagnostics.map(serializeDiagnostic), null, 2)); } catch {}

  console.log(`Diagnostics: ${diagnostics.length} issue(s). Written to ${outTxt}`);
  if (diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)) {
    process.exitCode = 2;
  }
}

const args = process.argv.slice(2);
let tsconfig = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '-p' || args[i] === '--project') && args[i + 1]) {
    tsconfig = args[i + 1];
    i++;
  }
}
run(process.cwd(), tsconfig);

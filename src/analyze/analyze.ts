import * as exec from '@actions/exec';
import { DartAnalyzeLogType, getLogKey } from './DartAnalyzeLogType';
import { AnalyzeResult } from './AnalyzeResult';
import { ParsedLine } from './ParsedLine';
import { ModifiedFiles } from '../utils/ModifiedFiles';

export async function analyze(workingDirectory: string): Promise<AnalyzeResult> {
  let outputs = '';
  let errOutputs = '';

  console.log('::group:: Analyze dart code')

  const options: exec.ExecOptions = {cwd: workingDirectory};

  options.listeners = {
    stdout: (data) => {
      outputs += data.toString();
    },
    stderr: (data) => {
      errOutputs += data.toString();
    }
  };
  
  const args = [workingDirectory];

  try {
    await exec.exec('dart analyze', args, options);
  } catch (_) {
    // dart analyze sometimes fails
  }

  const modifiedFiles = new ModifiedFiles();
  await modifiedFiles.isInit;

  console.log('modifiedFiles');
  console.dir(modifiedFiles, { depth: null });

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const lines = outputs.trim().split(/\r?\n/);
  const errLines = errOutputs.trim().split(/\r?\n/);
  const delimiter = '-';

  const parsedLines: ParsedLine[] = [];

  for (const line of [...lines, ...errLines]) {
    if (!line.includes(delimiter)) {
      continue;
    }
    try {
      const parsedLine = new ParsedLine({
        line,
        delimiter,
      });
      console.log('-------------------- new parsedLine --------------------');
      console.dir(parsedLine, { depth: null });
      if (!modifiedFiles.has(parsedLine.file)) {
        console.log('no modified file', parsedLine.file);
        // Don't lint anything if the file is not part of the changes
        continue
      }
      const modifiedFile = modifiedFiles.get(parsedLine.file)!;
      if (!modifiedFile.hasAdditionLine(parsedLine.line)) {
        console.log('no addition for file', parsedLine.file, 'and line', parsedLine.line);
        // Don't lint if the issue doesn't belong to the additions
        continue;
      }

      console.log('!! parsedLine is kept !!');


      parsedLines.push(parsedLine);
      const message = `file=${parsedLine.file},line=${parsedLine.line},col=${parsedLine.column}::${parsedLine.message}. See ${parsedLine.url}`;

      switch(parsedLine.type) {
        case DartAnalyzeLogType.Error:
          errorCount++;
          break;
        case DartAnalyzeLogType.Warning:
          warningCount++;
          break;
        default:
          infoCount++;
          break;
      }
      console.log(`::${getLogKey(parsedLine.type)} ${message}`); // Log the issue

    } catch (error) {
      console.log(`Error analyzing line ${line}:\n${error}`);
    }
  } 
  console.log('::endgroup::');

  return new AnalyzeResult({
    counts: {
      info: infoCount,
      warnings: warningCount,
      errors: errorCount,
    },
    lines: parsedLines,
  });
}
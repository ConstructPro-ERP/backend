import fs from 'node:fs';
import path from 'node:path';
import coverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const { createCoverageMap } = coverage;
const root = process.cwd();
const coverageDir = path.join(root, 'coverage');
const outputDir = path.join(coverageDir, 'combined');

// Load both test suites. Fail rather than reporting incomplete coverage.
function loadCoverage(directory) {
  const filename = path.join(coverageDir, directory, 'coverage-final.json');

  if (!fs.existsSync(filename)) {
    throw new Error(`Missing coverage results: ${filename}`);
  }

  return createCoverageMap(JSON.parse(fs.readFileSync(filename, 'utf8')));
}

// Identify production source files and their service directories.
function getDirectory(file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');

  if (
    relative.startsWith('../') ||
    path.isAbsolute(relative) ||
    !relative.endsWith('.ts') ||
    /\.(spec|test|e2e-spec)\.ts$/.test(relative)
  ) {
    return null;
  }

  const parts = relative.split('/');

  if (
    (parts[0] === 'apps' || parts[0] === 'libs') &&
    parts.length >= 4 &&
    parts[2] === 'src'
  ) {
    return `${parts[0]}/${parts[1]}`;
  }

  if (parts[0] === 'src') {
    return 'src';
  }

  return null;
}

const unit = loadCoverage('unit');
const e2e = loadCoverage('e2e');

// Merge execution counts for files covered by either test suite.
const merged = createCoverageMap({});
merged.merge(unit);
merged.merge(e2e);

// Exclude test files and other non-production files.
const combined = createCoverageMap({});
const directories = new Map();

for (const file of merged.files()) {
  const directory = getDirectory(file);
  if (!directory) continue;

  const fileCoverage = merged.fileCoverageFor(file);
  combined.addFileCoverage(fileCoverage);

  if (!directories.has(directory)) {
    directories.set(directory, createCoverageMap({}));
  }

  directories.get(directory).addFileCoverage(fileCoverage);
}

if (combined.files().length === 0) {
  throw new Error('No backend source files were found in coverage.');
}

// Generate overall HTML, JSON, LCOV, and terminal reports.
fs.mkdirSync(outputDir, { recursive: true });

const context = libReport.createContext({
  dir: outputDir,
  coverageMap: combined,
});

for (const format of ['text', 'html', 'json', 'json-summary', 'lcov']) {
  reports.create(format).execute(context);
}

// Convert Istanbul summaries into comparable percentages.
function summaryRow(name, map) {
  const summary = map.getCoverageSummary().toJSON();
  const percentage = (metric) =>
    summary[metric].total > 0 ? summary[metric].pct.toFixed(2) : 'N/A';

  return {
    Directory: name,
    Files: map.files().length,
    Statements: percentage('statements'),
    Branches: percentage('branches'),
    Functions: percentage('functions'),
    Lines: percentage('lines'),
  };
}

const rows = [summaryRow('OVERALL BACKEND', combined)];

// Automatically create a separate HTML report for each service.
for (const [name, map] of [...directories].sort((a, b) =>
  a[0].localeCompare(b[0]),
)) {
  rows.push(summaryRow(name, map));

  const serviceDir = path.join(outputDir, 'services', ...name.split('/'));

  const serviceContext = libReport.createContext({
    dir: serviceDir,
    coverageMap: map,
  });

  reports.create('html').execute(serviceContext);
}

// Export service coverage data for Excel and the academic report.
const columns = [
  'Directory',
  'Files',
  'Statements',
  'Branches',
  'Functions',
  'Lines',
];

const csv = [
  columns.join(','),
  ...rows.map((row) => columns.map((key) => row[key]).join(',')),
].join('\n');

fs.writeFileSync(path.join(outputDir, 'service-summary.csv'), `${csv}\n`);

console.log('\nBackend coverage by directory:\n');
console.table(rows);
console.log(`\nOverall HTML: ${path.join(outputDir, 'index.html')}`);
console.log(`Service reports: ${path.join(outputDir, 'services')}`);
console.log(`CSV summary: ${path.join(outputDir, 'service-summary.csv')}`);

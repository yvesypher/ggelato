const path = require('path');
const fs = require('fs');

// Read a JSON file from srcjs/config, falling back to a default when absent.
const readConfig = (name, fallback) => {
  const file = path.join(__dirname, 'srcjs', 'config', name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
};

const outputPath = readConfig('output_path.json', './inst/htmlwidgets');
const entryPoints = readConfig('entry_points.json', {});
const externals = readConfig('externals.json', {});
const misc = readConfig('misc.json', {});
const loaders = readConfig('loaders.json', []).map(loader => ({
  ...loader,
  test: RegExp(loader.test)
}));

module.exports = {
  entry: entryPoints,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, outputPath)
  },
  externals: externals,
  module: {
    rules: loaders
  },
  resolve: misc.resolve || {
    extensions: ['.tsx', '.ts', '.js']
  }
};

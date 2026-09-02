const path = require('path');

const configPath = path.resolve(__dirname, './tailwind.config.cjs');

module.exports = {
  plugins: {
    tailwindcss: { config: configPath },
    autoprefixer: {},
  },
};
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildLib } = require('./buildLib');

fs.rmSync(path.join(process.cwd(), 'build'), { recursive: true, force: true });
buildLib();

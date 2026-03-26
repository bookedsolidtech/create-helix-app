#!/usr/bin/env node

import { runCLI } from './cli.js';
import { HelixError } from './errors.js';

const isVerbose = process.argv.includes('--verbose');

runCLI().catch((error) => {
  if (error instanceof HelixError) {
    if (isVerbose) {
      console.error(error.formatVerbose());
    } else {
      console.error(`[${error.code}] ${error.message}`);
      console.error(`Suggestion: ${error.suggestion}`);
      console.error('Run with --verbose for full stack trace.');
    }
  } else {
    console.error(error);
  }
  process.exit(1);
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@vscode/test-cli';

// VS Code's IPC socket path must stay under 103 characters. Keeping the user
// data directory outside deep checkout paths avoids EINVAL on launch.
const userDataDir = mkdtempSync(join(tmpdir(), 'vsct-'));

export default defineConfig({
	files: 'out/test/**/*.test.js',
	launchArgs: ['--user-data-dir', userDataDir],
});

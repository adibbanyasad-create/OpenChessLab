import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/server/version';

describe('release version guard', () => {
  it('accepts the exact application version tag', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-release.mjs'], {
      env: { ...process.env, GITHUB_REF_NAME: `v${APP_VERSION}` },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`v${APP_VERSION}`);
  });
  it.each(['main', 'v0.0.0', ''])('rejects mismatched release reference %s', (ref) => {
    const result = spawnSync(process.execPath, ['scripts/verify-release.mjs'], {
      env: { ...process.env, GITHUB_REF_NAME: ref },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`expected v${APP_VERSION}`);
  });
});

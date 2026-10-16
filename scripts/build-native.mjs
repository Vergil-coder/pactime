import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
if (process.platform === 'darwin') {
  mkdirSync('dist-native', { recursive: true });
  execFileSync('/usr/bin/swiftc', ['-O', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx12.0`, 'native/process-helper.swift', '-o', 'dist-native/process-helper'], { stdio: 'inherit' });
  copyFileSync('assets/icon-mac.png', 'dist-native/icon-mac.png');
}

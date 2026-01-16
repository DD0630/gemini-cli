/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';

export interface GitIgnoreFilter {
  isIgnored(filePath: string): boolean;
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private patternCache: Map<string, string[]> = new Map();
  private igCache: Map<string, Ignore> = new Map();
  private globalPatterns: string[] | undefined;
  private processedExtraPatterns: string[] = [];

  constructor(
    projectRoot: string,
    private readonly extraPatterns?: string[],
  ) {
    this.projectRoot = path.resolve(projectRoot);
    if (this.extraPatterns) {
      // extraPatterns are assumed to be from project root (like .geminiignore)
      this.processedExtraPatterns = this.processPatterns(
        this.extraPatterns,
        '.',
      );
    }
  }

  private addPatternsToIg(ig: Ignore, dir: string): void {
    let patterns;
    if (this.patternCache.has(dir)) {
      patterns = this.patternCache.get(dir);
    } else {
      const gitignorePath = path.join(dir, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        patterns = this.loadPatternsForFile(gitignorePath);
        this.patternCache.set(dir, patterns);
      } else {
        this.patternCache.set(dir, []);
      }
    }
    if (patterns) {
      ig.add(patterns);
    }
  }

  private getOrCreateIg(dir: string): Ignore {
    if (this.igCache.has(dir)) {
      return this.igCache.get(dir)!;
    }

    // Base case: project root.
    if (dir === this.projectRoot) {
      const ig = ignore();
      ig.add('.git');

      if (this.globalPatterns === undefined) {
        const excludeFile = path.join(
          this.projectRoot,
          '.git',
          'info',
          'exclude',
        );
        this.globalPatterns = fs.existsSync(excludeFile)
          ? this.loadPatternsForFile(excludeFile)
          : [];
      }
      ig.add(this.globalPatterns);

      this.addPatternsToIg(ig, this.projectRoot);

      this.igCache.set(dir, ig);
      return ig;
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir || parentDir.length < this.projectRoot.length) {
      // We are outside the project root, so return the root's ignore object.
      const rootIg = this.getOrCreateIg(this.projectRoot);
      this.igCache.set(dir, rootIg);
      return rootIg;
    }

    // Recursive step: get parent's ignore object.
    const parentIg = this.getOrCreateIg(parentDir);

    const relativeDir = path
      .relative(this.projectRoot, dir)
      .replace(/\\/g, '/');

    const parentIgWithExtras = ignore()
      .add(parentIg)
      .add(this.processedExtraPatterns);

    if (relativeDir && parentIgWithExtras.ignores(relativeDir)) {
      // Directory is ignored, so we use the parent's ignore object.
      // No new rules from this directory can apply.
      this.igCache.set(dir, parentIg);
      return parentIg;
    }

    // Create a new ignore object for the current directory.
    const currentIg = ignore().add(parentIg);
    this.addPatternsToIg(currentIg, dir);

    this.igCache.set(dir, currentIg);
    return currentIg;
  }

  private loadPatternsForFile(patternsFilePath: string): string[] {
    let content: string;
    try {
      content = fs.readFileSync(patternsFilePath, 'utf-8');
    } catch (_error) {
      return [];
    }

    const isExcludeFile = patternsFilePath.endsWith(
      path.join('.git', 'info', 'exclude'),
    );

    const relativeBaseDir = isExcludeFile
      ? '.'
      : path
          .dirname(path.relative(this.projectRoot, patternsFilePath))
          .split(path.sep)
          .join(path.posix.sep);

    const rawPatterns = content.split('\n');
    return this.processPatterns(rawPatterns, relativeBaseDir);
  }

  private processPatterns(
    rawPatterns: string[],
    relativeBaseDir: string,
  ): string[] {
    return rawPatterns
      .map((p) => p.trimStart())
      .filter((p) => p !== '' && !p.startsWith('#'))
      .map((p) => {
        const isNegative = p.startsWith('!');
        if (isNegative) {
          p = p.substring(1);
        }

        const isAnchoredInFile = p.startsWith('/');
        if (isAnchoredInFile) {
          p = p.substring(1);
        }

        // An empty pattern can result from a negated pattern like `!`,
        // which we can ignore.
        if (p === '') {
          return '';
        }

        let newPattern = p;
        if (relativeBaseDir && relativeBaseDir !== '.') {
          // Only in nested .gitignore files, the patterns need to be modified according to:
          // - If `a/b/.gitignore` defines `/c` then it needs to be changed to `/a/b/c`
          // - If `a/b/.gitignore` defines `c` then it needs to be changed to `/a/b/**/c`
          // - If `a/b/.gitignore` defines `c/d` then it needs to be changed to `/a/b/c/d`

          if (!isAnchoredInFile && !p.includes('/')) {
            // If no slash and not anchored in file, it matches files in any
            // subdirectory.
            newPattern = path.posix.join('**', p);
          }

          // Prepend the .gitignore file's directory.
          newPattern = path.posix.join(relativeBaseDir, newPattern);

          // Anchor the pattern to a nested gitignore directory.
          if (!newPattern.startsWith('/')) {
            newPattern = '/' + newPattern;
          }
        }

        // Anchor the pattern if originally anchored
        if (isAnchoredInFile && !newPattern.startsWith('/')) {
          newPattern = '/' + newPattern;
        }

        if (isNegative) {
          newPattern = '!' + newPattern;
        }

        return newPattern;
      })
      .filter((p) => p !== '');
  }

  isIgnored(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    const absoluteFilePath = path.resolve(this.projectRoot, filePath);
    if (!absoluteFilePath.startsWith(this.projectRoot)) {
      return false;
    }

    try {
      const resolved = path.resolve(this.projectRoot, filePath);
      const relativePath = path.relative(this.projectRoot, resolved);

      if (relativePath === '' || relativePath.startsWith('..')) {
        return false;
      }

      // Even in windows, Ignore expects forward slashes.
      const normalizedPath = relativePath.replace(/\\/g, '/');

      if (normalizedPath.startsWith('/') || normalizedPath === '') {
        return false;
      }

      const fileDir = path.dirname(resolved);
      const ig = this.getOrCreateIg(fileDir);

      const igWithExtras = ignore()
        .add(ig)
        .add(this.processedExtraPatterns);

      return igWithExtras.ignores(normalizedPath);
    } catch (_error) {
      return false;
    }
  }
}

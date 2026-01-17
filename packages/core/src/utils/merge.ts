/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function isObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deep merges two objects.
 * Arrays are replaced, not merged.
 * Objects are merged recursively.
 * Other types are overwritten.
 */
export function deepMerge(
  target: Record<string, unknown> | undefined,
  source: Record<string, unknown> | undefined,
): Record<string, unknown> {
  // Start with an empty object
  const result: Record<string, unknown> = {};

  // Helper to merge an object into the result
  const mergeIntoResult = (obj: Record<string, unknown> | undefined) => {
    if (!obj) return;

    Object.keys(obj).forEach((key) => {
      const resultValue = result[key];
      const objValue = obj[key];

      if (isObject(resultValue) && isObject(objValue)) {
        result[key] = deepMerge(resultValue, objValue);
      } else {
        result[key] = objValue;
      }
    });
  };

  mergeIntoResult(target);
  mergeIntoResult(source);

  return result;
}

/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

/**
 * What xslint's `settingsOf` answers, spelled out for one run: a bare run's
 * options with the given keys laid over them.
 * @param {object} said - The keys that differ from a bare run
 * @return {object} - The settings
 */
const settings = function(said) {
  return {
    suppress: [], overrides: {}, only: [], preset: 'recommended',
    excluded: () => false, problems: [], ...said,
  }
}

module.exports = {
  settings,
}

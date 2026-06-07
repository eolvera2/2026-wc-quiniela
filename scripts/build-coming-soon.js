#!/usr/bin/env node
/**
 * Builds the public Coming Soon landing page into dist/.
 */

import { rmSync } from 'node:fs';
import { buildComingSoonSite } from '../src/publish/staticSite.js';

const outputDir = process.env.OUTPUT_DIR || 'dist';
const siteBaseUrl = process.env.SITE_BASE_URL || 'https://predictagol.com';

rmSync(outputDir, { recursive: true, force: true });

buildComingSoonSite({ siteBaseUrl, outputDir });

console.log(`✓ Coming Soon site built for ${siteBaseUrl} in ${outputDir}`);

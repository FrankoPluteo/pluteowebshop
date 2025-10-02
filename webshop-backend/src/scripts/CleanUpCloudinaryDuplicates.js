// src/scripts/cleanupCloudinaryDuplicates.js
/**
 * Dry-run by default. Use --run to actually delete, and --update-db to sync DB image fields.
 *
 * Usage:
 *   node src/scripts/cleanupCloudinaryDuplicates.js           # dry run, writes a report JSON
 *   node src/scripts/cleanupCloudinaryDuplicates.js --run    # actually perform deletions
 *   node src/scripts/cleanupCloudinaryDuplicates.js --run --update-db  # also update DB image fields (Prisma)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const slugify = require('slugify');

// Optional DB
let prisma;
const doUpdateDb = process.argv.includes('--update-db');
const doRun = process.argv.includes('--run');

if (doUpdateDb) {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  } catch (err) {
    console.error('ERROR: --update-db requested but @prisma/client not found. Install @prisma/client or omit --update-db.');
    process.exit(1);
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const FOLDER = 'products'; // change if different
const MAX_RESULTS = 500;   // Cloudinary page size

function normalizeName(name) {
  if (!name) return '';
  // Use the same normalization style you used when uploading
  return slugify(name, { lower: false, remove: /[*+~.()'"!:@]/g });
}

async function listAllResources() {
  let resources = [];
  let next_cursor = null;
  do {
    const opts = {
      type: 'upload',
      resource_type: 'image',
      prefix: FOLDER,
      max_results: MAX_RESULTS,
      next_cursor
    };
    const res = await cloudinary.api.resources(opts);
    resources = resources.concat(res.resources || []);
    next_cursor = res.next_cursor;
  } while (next_cursor);
  return resources;
}

(async function main() {
  console.log(`Starting cleanup tool (FOLDER="${FOLDER}"). dry-run=${!doRun} update-db=${doUpdateDb}`);

  try {
    const resources = await listAllResources();
    console.log(`Fetched ${resources.length} image resources from Cloudinary.`);

    // Group resources by normalized original filename (fallback to basename if needed)
    const groups = new Map(); // normalizedName -> [resource,...]
    for (const r of resources) {
      // original_filename typically contains the upload's filename without extension
      const original = r.original_filename || path.basename(r.public_id);
      const normalized = normalizeName(original);

      if (!groups.has(normalized)) groups.set(normalized, []);
      groups.get(normalized).push(r);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      totalResources: resources.length,
      totalGroups: groups.size,
      groups: []
    };

    // Decide keeper per group and deletions
    for (const [key, arr] of groups.entries()) {
      if (!arr || arr.length === 0) continue;
      // If only one resource, nothing to delete
      if (arr.length === 1) {
        report.groups.push({
          key,
          keep: arr[0],
          deleteCandidates: []
        });
        continue;
      }

      // Prefer resource whose public_id exactly equals `${FOLDER}/${key}`
      const exactId = `${FOLDER}/${key}`;
      let keeper = arr.find(r => r.public_id === exactId);

      if (!keeper) {
        // else choose newest by created_at
        keeper = arr.reduce((best, cur) => {
          const bestTime = best && best.created_at ? new Date(best.created_at).getTime() : 0;
          const curTime = cur && cur.created_at ? new Date(cur.created_at).getTime() : 0;
          return curTime > bestTime ? cur : best;
        }, arr[0]);
      }

      const toDelete = arr.filter(r => r.public_id !== keeper.public_id);

      report.groups.push({
        key,
        keep: {
          public_id: keeper.public_id,
          secure_url: keeper.secure_url,
          bytes: keeper.bytes,
          created_at: keeper.created_at,
        },
        deleteCandidates: toDelete.map(r => ({
          public_id: r.public_id,
          secure_url: r.secure_url,
          bytes: r.bytes,
          created_at: r.created_at,
        }))
      });
    }

    // write report
    const outPath = path.join(process.cwd(), `cloudinary-duplicates-report-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report written: ${outPath}`);
    console.log(`Groups with >1 resource: ${report.groups.filter(g => g.deleteCandidates && g.deleteCandidates.length>0).length}`);

    if (!doRun) {
      console.log('Dry-run mode — nothing deleted. Inspect the report, then re-run with --run to apply deletions.');
      process.exit(0);
    }

    // Build delete list
    const allDeleteIds = [];
    for (const g of report.groups) {
      if (g.deleteCandidates && g.deleteCandidates.length > 0) {
        for (const d of g.deleteCandidates) allDeleteIds.push(d.public_id);
      }
    }

    console.log(`About to delete ${allDeleteIds.length} resources from Cloudinary.`);

    // safety: confirm if running interactively
    if (allDeleteIds.length === 0) {
      console.log('Nothing to delete.');
    } else {
      // batch deletion (Cloudinary allows many at once; safe to split into reasonably sized batches)
      const BATCH = 100;
      for (let i = 0; i < allDeleteIds.length; i += BATCH) {
        const chunk = allDeleteIds.slice(i, i + BATCH);
        console.log(`Deleting batch ${i/BATCH + 1} (${chunk.length} items)...`);
        const res = await cloudinary.api.delete_resources(chunk);
        // res usually shows deleted: { public_id: 'deleted' ... } etc
        // write partial result to disk
        fs.appendFileSync(outPath + '.log', JSON.stringify({ batch: i/BATCH + 1, input: chunk, result: res }, null, 2) + '\n');
      }
      console.log('Deletion passes complete. See report and log.');
    }

    if (doUpdateDb) {
      console.log('Updating DB image fields for kept resources (this will match by product name using the group key).');
      // connect prisma if not connected
      await prisma.$connect();

      for (const g of report.groups) {
        const productName = g.key; // NOTE: productName must match your DB product.name used earlier
        const keeper = g.keep;
        if (!keeper || !keeper.secure_url) continue;

        // Here we attempt to update DB rows where name equals productName (non-normalized).
        // If your DB name is not normalized, you might need to adjust matching strategy.
        try {
          const updated = await prisma.products.updateMany({
            where: { name: productName }, // <-- adjust if your DB names differ
            data: { image: keeper.secure_url },
          });
          if (updated.count > 0) {
            console.log(`DB: updated ${updated.count} row(s) for product "${productName}".`);
          } else {
            console.warn(`DB: no rows matched name="${productName}". You may need a different matching key.`);
          }
        } catch (err) {
          console.error(`DB update failed for "${productName}":`, err.message || err);
        }
      }

      await prisma.$disconnect();
    }

    console.log('All done.');
    process.exit(0);

  } catch (err) {
    console.error('Fatal error:', err);
    if (prisma) await prisma.$disconnect();
    process.exit(1);
  }
})();

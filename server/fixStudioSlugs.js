import mssql from './mssql.cjs';

const { queryRows, query } = mssql;

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const studios = await queryRows('SELECT id, name FROM studios WHERE public_slug IS NULL');
  for (const studio of studios) {
    const slug = slugify(studio.name);
    await query('UPDATE studios SET public_slug = $1 WHERE id = $2', [slug, studio.id]);
    console.log(`Updated studio ${studio.name} with slug: ${slug}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
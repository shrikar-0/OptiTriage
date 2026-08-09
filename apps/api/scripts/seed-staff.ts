/**
 * scripts/seed-staff.ts
 *
 * One-time script to:
 *  1. List all Supabase Auth users (shows UUIDs + emails + roles from user_metadata)
 *  2. Insert Staff rows for any user who doesn't yet have one
 *
 * Uses the Supabase REST API + supabase-js directly — no PrismaClient needed.
 *
 * Run from apps/api:
 *   npx tsx scripts/seed-staff.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Admin client — uses service role key, can read Auth users and write any table
const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('\n=== Listing Supabase Auth Users ===\n');

  const { data: usersData, error: listError } = await sb.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list Auth users:', listError.message);
    process.exit(1);
  }

  const users = usersData.users;
  if (!users.length) {
    console.log('No Supabase Auth users found.');
    return;
  }

  for (const user of users) {
    const meta = user.user_metadata ?? {};
    console.log(`  UUID:  ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  role (user_metadata): ${meta['role'] ?? '(not set)'}`);
    console.log(`  name (user_metadata): ${meta['name'] ?? '(not set)'}`);
    console.log('');
  }

  console.log('=== Inserting Missing Staff Rows (via Supabase REST) ===\n');

  for (const user of users) {
    const meta = user.user_metadata ?? {};
    const rawRole = (meta['role'] as string | undefined)?.toUpperCase();
    const name = (meta['name'] as string | undefined) ?? user.email?.split('@')[0] ?? 'Unknown';

    if (rawRole !== 'DOCTOR' && rawRole !== 'RECEPTIONIST') {
      console.warn(`  SKIP ${user.email} — role "${rawRole}" is not DOCTOR or RECEPTIONIST.`);
      console.warn(`       To fix, manually call: npx tsx scripts/seed-staff.ts --override`);
      continue;
    }

    // Check if Staff row already exists
    const { data: existing } = await sb
      .from('Staff')
      .select('id, role')
      .eq('supabaseUserId', user.id)
      .maybeSingle();

    if (existing) {
      console.log(`  OK   ${user.email} — Staff row already exists (role: ${existing.role})`);
      continue;
    }

    // Insert the Staff row, providing our own UUID for the id field
    const { data: created, error: insertError } = await sb
      .from('Staff')
      .insert({ id: randomUUID(), supabaseUserId: user.id, name, role: rawRole, createdAt: new Date().toISOString() })
      .select()
      .single();

    if (insertError) {
      console.error(`  ERROR inserting ${user.email}: ${insertError.message}`);
    } else {
      console.log(`  CREATED Staff row for ${user.email} — id: ${created.id}, role: ${created.role}`);
    }
  }

  console.log('\n=== Final Staff Table ===\n');
  const { data: allStaff, error: fetchError } = await sb.from('Staff').select('*');
  if (fetchError) {
    console.error('Failed to fetch Staff table:', fetchError.message);
    return;
  }

  if (!allStaff?.length) {
    console.log('  (Staff table is empty)');
  } else {
    for (const s of allStaff) {
      console.log(`  ${String(s.role).padEnd(12)} | ${String(s.name).padEnd(20)} | supabaseUserId: ${s.supabaseUserId}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

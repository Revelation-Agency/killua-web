#!/usr/bin/env node
/**
 * Make one DASH_USERS entry.
 *
 *   node scripts/dash-user.mjs taj@example.com "Taj Pamma" owner
 *
 * Prompts for a password (not shown while typing), then prints one JSON object.
 * Put all entries together in a JSON array in the DASH_USERS environment
 * variable in Vercel. Roles: admin (Blaine), owner (Taj), team (Robin).
 * Passwords must be at least 12 characters.
 */
import { createInterface } from 'node:readline';
import { hashPassword, ROLES } from '../api/_lib/auth.js';

const [email, name, role] = process.argv.slice(2);
if (!email || !name || !ROLES.includes(role)) {
  console.error(`Usage: node scripts/dash-user.mjs <email> <name> <${ROLES.join('|')}>`);
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: Boolean(process.stdin.isTTY) });
    if (process.stdin.isTTY) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) process.stderr.write(s);
        else if (s.includes('\n') || s.includes('\r')) process.stderr.write('\n');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const pw = await ask('Password (min 12 characters): ');
if (pw.length < 12) {
  console.error('That password is too short. Use at least 12 characters.');
  process.exit(1);
}
const again = process.stdin.isTTY ? await ask('Type it again: ') : pw;
if (again !== pw) {
  console.error('The two passwords did not match.');
  process.exit(1);
}
const { salt, hash } = await hashPassword(pw);
console.log(JSON.stringify({ email: email.trim().toLowerCase(), name, role, salt, hash }));

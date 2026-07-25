import type { Pool } from 'pg';
import type { Profile } from '../types/domain.js';
import type { ProfileStore } from './store.js';

type Row = Record<string, unknown>;

const mapRow = (r: Row): Profile => ({
  householdId: r['household_id'] as string,
  name: r['name'] as string,
  email: (r['email'] as string) ?? '',
  phone: (r['phone'] as string) ?? '',
  avatarColor: r['avatar_color'] as string,
  greetingStyle: r['greeting_style'] as Profile['greetingStyle'],
  updatedAt: (r['updated_at'] as Date).toISOString(),
});

export const createPostgresProfileStore = (opts: { pool: Pool }): ProfileStore => {
  const { pool } = opts;
  return {
    async get(householdId) {
      const res = await pool.query<Row>(
        `SELECT household_id, name, email, phone, avatar_color, greeting_style, updated_at
           FROM profiles WHERE household_id = $1`,
        [householdId],
      );
      if (res.rowCount === 0) return null;
      return mapRow(res.rows[0]!);
    },
    async upsert(householdId, input) {
      const res = await pool.query<Row>(
        `INSERT INTO profiles (household_id, name, email, phone, avatar_color, greeting_style)
              VALUES ($1, COALESCE($2, 'Usuário'), COALESCE($3, ''), COALESCE($4, ''), COALESCE($5, '#0E8C5A'), COALESCE($6, 'auto'))
         ON CONFLICT (household_id) DO UPDATE
            SET name           = COALESCE(EXCLUDED.name, profiles.name),
                email          = COALESCE(EXCLUDED.email, profiles.email),
                phone          = COALESCE(EXCLUDED.phone, profiles.phone),
                avatar_color   = COALESCE(EXCLUDED.avatar_color, profiles.avatar_color),
                greeting_style = COALESCE(EXCLUDED.greeting_style, profiles.greeting_style),
                updated_at     = NOW()
         RETURNING household_id, name, email, phone, avatar_color, greeting_style, updated_at`,
        [
          householdId,
          input.name ?? null,
          input.email ?? null,
          input.phone ?? null,
          input.avatarColor ?? null,
          input.greetingStyle ?? null,
        ],
      );
      return mapRow(res.rows[0]!);
    },
  };
};

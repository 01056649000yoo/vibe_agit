const { test, expect } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables for the test
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

test.describe('Security & RLS Tests', () => {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

    test('Anonymous API Request should be blocked by RLS', async ({ request }) => {
        // Attempting to delete a student record without a valid user token
        const response = await request.delete(`${SUPABASE_URL}/rest/v1/students?id=eq.123e4567-e89b-12d3-a456-426614174000`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                // Missing Authorization header (Bearer token)
            }
        });

        // We expect the request to fail due to RLS policies
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('Anonymous Request accessing private table should return empty or fail', async ({ request }) => {
        const response = await request.get(`${SUPABASE_URL}/rest/v1/students`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
            }
        });

        // If RLS is enabled, accessing without auth should either be a 401/403 or return an empty array (200, length 0)
        if (response.status() === 200) {
            const contentType = response.headers()['content-type'];
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                expect(data.length).toBe(0);
            } else {
                // If it's not JSON but 200, it's unexpected for Supabase REST, but we check if it's at least not leaking data
                const text = await response.text();
                expect(text).not.toContain('student');
            }
        } else {
            expect(response.status()).toBeGreaterThanOrEqual(400);
        }
    });
});

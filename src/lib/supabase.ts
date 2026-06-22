/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zqgtkrqfyhcvgagjhbnv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_eY-iBKIqUVxMf_OAEa0CKg_DTxfCzpp';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zqgtkrqfyhcvgagjhbnv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxZ3RrcnFmeWhjdmdhZ2poYm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjE3NzAsImV4cCI6MjA5NzM5Nzc3MH0.cewfK1Go1hBJbITQ37QyeUCdzjL2z4v2MCFGDJdEJ64';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

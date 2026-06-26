import { supabaseUrl, supabaseAnonKey, supabase } from './supabase';

const EDGE_FUNCTION_PATH = '/functions/v1/verify-cssp';

export interface CSSPVerifyResponse {
  status: 'auto_verified' | 'unverified' | 'pending';
  message: string;
  data?: {
    found: boolean;
    name?: string;
    profession?: string;
    board?: string;
    name_match?: boolean;
    profession_match?: boolean;
  };
  mismatches?: string[];
  error?: string;
}

export async function verifyCSSP(
  nurseId: string,
  csspRegistration: string,
  nurseName?: string,
  nurseLevel?: string
): Promise<CSSPVerifyResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || supabaseAnonKey;

    const response = await fetch(`${supabaseUrl}${EDGE_FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        nurse_id: nurseId,
        cssp_registration: csspRegistration,
        nurse_name: nurseName,
        nurse_level: nurseLevel,
      }),
    });

    if (!response.ok) {
      throw new Error(`CSSP verify error: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return {
      status: 'pending',
      message: 'No se pudo verificar automáticamente',
      error: message,
    };
  }
}

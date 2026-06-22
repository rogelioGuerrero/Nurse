import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CSSP_SEARCH_URL = "https://cssp.gob.sv/profesionales/faces/consulta/buscar.xhtml";

interface VerifyRequest {
  nurse_id: string;
  cssp_registration: string;
}

interface CSSPResult {
  found: boolean;
  name?: string;
  profession?: string;
  board?: string;
  error?: string;
}

/**
 * Verifica un número de registro CSSP haciendo scraping del portal oficial.
 * Usa fetch con POST y parsea el HTML de respuesta (JSF form submission).
 * Si el sitio cambia o falla, retorna error y el sistema marca como 'pending'
 * para revisión manual, sin bloquear a la enfermera.
 */
async function verifyCSSPRegistration(registration: string): Promise<CSSPResult> {
  try {
    // Paso 1: GET para obtener el ViewState de JSF
    const getResponse = await fetch(CSSP_SEARCH_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!getResponse.ok) {
      return { found: false, error: "No se pudo acceder al portal CSSP" };
    }

    const html = await getResponse.text();
    const cookies = getResponse.headers.get("set-cookie") || "";

    // Extraer javax.faces.ViewState del HTML
    const viewStateMatch = html.match(/name="javax\.faces\.ViewState"\s+value="([^"]+)"/i);
    const viewState = viewStateMatch ? viewStateMatch[1] : "";

    if (!viewState) {
      return { found: false, error: "No se pudo obtener el token de sesión del CSSP" };
    }

    // Extraer el form ID (típicamente "form" o "formularioBusqueda")
    const formIdMatch = html.match(/<form[^>]+id="([^"]+)"/i);
    const formId = formIdMatch ? formIdMatch[1] : "form";

    // Paso 2: POST con el número de registro
    const formData = new URLSearchParams();
    formData.append(`${formId}:buscarProfesional`, `${formId}:buscarProfesional`);
    formData.append(`${formId}:numeroJunta`, registration);
    formData.append("javax.faces.ViewState", viewState);

    const postResponse = await fetch(CSSP_SEARCH_URL, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
        "Accept": "text/html,application/xhtml+xml",
      },
      body: formData.toString(),
    });

    if (!postResponse.ok) {
      return { found: false, error: "Error al consultar el portal CSSP" };
    }

    const resultHtml = await postResponse.text();

    // Verificar si hay resultados
    if (resultHtml.includes("No se encontraron registros") || resultHtml.includes("No se encontraron resultados")) {
      return { found: false };
    }

    // Extraer datos del profesional si se encontró
    const nameMatch = resultHtml.match(/<td[^>]*>([^<]+)<\/td>/i);
    const professionMatch = resultHtml.match(/Profesi[^<]*<[^>]*>([^<]+)/i);
    const boardMatch = resultHtml.match(/Junta[^<]*<[^>]*>([^<]+)/i);

    // Si hay tabla de resultados, considerar encontrado
    const hasResults = resultHtml.includes("Resultados") && !resultHtml.includes("No se encontraron");

    if (hasResults || nameMatch) {
      return {
        found: true,
        name: nameMatch ? nameMatch[1].trim() : undefined,
        profession: professionMatch ? professionMatch[1].trim() : undefined,
        board: boardMatch ? boardMatch[1].trim() : undefined,
      };
    }

    // Si no encontramos indicadores claros, retornar como no encontrado
    return { found: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { found: false, error: `Error de conexión con CSSP: ${message}` };
  }
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { nurse_id, cssp_registration }: VerifyRequest = await req.json();

    if (!nurse_id || !cssp_registration) {
      return new Response(
        JSON.stringify({ error: "nurse_id y cssp_registration son requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Inicializar cliente Supabase con service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Ejecutar verificación
    const result = await verifyCSSPRegistration(cssp_registration);

    const now = new Date().toISOString();

    if (result.error) {
      // El sitio falló o cambió — marcar como pending para revisión manual
      await supabase
        .from("nurses")
        .update({
          cssp_verification_status: "pending",
          cssp_verified: false,
          cssp_verification_date: now,
          cssp_verification_notes: `Verificación automática falló: ${result.error}. Requiere revisión manual.`,
        })
        .eq("id", nurse_id);

      return new Response(
        JSON.stringify({
          status: "pending",
          message: "No se pudo verificar automáticamente. Se requiere revisión manual.",
          error: result.error,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (result.found) {
      // Verificación automática exitosa
      await supabase
        .from("nurses")
        .update({
          cssp_verification_status: "auto_verified",
          cssp_verified: true,
          cssp_verification_date: now,
          cssp_verification_notes: `Verificado automáticamente. Nombre: ${result.name || "N/A"}`,
        })
        .eq("id", nurse_id);

      return new Response(
        JSON.stringify({
          status: "auto_verified",
          message: "Registro CSSP verificado automáticamente",
          data: result,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // No se encontró el número — marcar como unverified, NO bloquear
    await supabase
      .from("nurses")
      .update({
        cssp_verification_status: "unverified",
        cssp_verified: false,
        cssp_verification_date: now,
        cssp_verification_notes: "Número no encontrado en portal CSSP. Requiere revisión manual.",
      })
      .eq("id", nurse_id);

    return new Response(
      JSON.stringify({
        status: "unverified",
        message: "No se encontró el número en el portal CSSP. Se sugiere verificación manual.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: `Error interno: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

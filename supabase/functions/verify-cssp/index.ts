import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CSSP_SEARCH_URL = "https://cssp.gob.sv/profesionales/faces/consulta/buscar.xhtml";

interface VerifyRequest {
  nurse_id: string;
  cssp_registration: string;
  nurse_name?: string;
  nurse_level?: string;
}

interface CSSPResult {
  found: boolean;
  name?: string;
  profession?: string;
  board?: string;
  error?: string;
  name_match?: boolean;
  profession_match?: boolean;
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
    
    // Extraer cookies — Deno puede no exponer set-cookie correctamente
    const setCookie = getResponse.headers.get("set-cookie") || "";
    // Fallback: extraer JSESSIONID del HTML (JSF lo embebe en las URLs)
    const jsessionMatch = html.match(/jsessionid=([a-zA-Z0-9]+)/);
    const jsessionId = jsessionMatch ? jsessionMatch[1] : "";
    const cookies = setCookie || (jsessionId ? `JSESSIONID=${jsessionId}` : "");

    // Extraer javax.faces.ViewState del HTML
    // El HTML real tiene: name="javax.faces.ViewState" id="..." value="..."
    const viewStateMatch = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i);
    const viewState = viewStateMatch ? viewStateMatch[1] : "";

    if (!viewState) {
      return { found: false, error: "No se pudo obtener el token de sesión del CSSP" };
    }

    // Extraer el form ID — buscar frm1 específicamente (hay múltiples forms en la página)
    const formIdMatch = html.match(/<form[^>]+id="(frm1)"/i);
    const formId = formIdMatch ? formIdMatch[1] : "frm1";

    // Extraer el ID del botón de búsqueda desde el onclick (PrimeFaces AJAX)
    const btnMatch = html.match(/s:&quot;(frm1:j_idt\d+)&quot;/);
    const btnId = btnMatch ? btnMatch[1] : "frm1:j_idt45";

    const formData = new URLSearchParams();
    formData.append(btnId, btnId);
    formData.append(`${formId}`, `${formId}`);
    formData.append(`${formId}:nombre`, "");
    formData.append(`${formId}:apellidos`, "");
    formData.append(`${formId}:junta_focus`, "");
    formData.append(`${formId}:junta_input`, "");
    formData.append(`${formId}:profesion_focus`, "");
    formData.append(`${formId}:profesion_input`, "");
    formData.append(`${formId}:idProfesional`, registration);
    formData.append(`${formId}:profesionales_rppDD`, "5");
    formData.append(`${formId}:profesionales_scrollState`, "0,0");
    formData.append(`${formId}:j_idt59`, "grid");
    formData.append("javax.faces.ViewState", viewState);
    formData.append("javax.faces.partial.ajax", "true");
    formData.append("javax.faces.source", btnId);
    formData.append("javax.faces.partial.execute", "@all");
    formData.append("javax.faces.partial.render", `${formId}:profesionales ${formId}:panelDatos`);

    // Usar URL con jsessionid para mantener la sesión JSF
    const postUrl = jsessionId 
      ? `${CSSP_SEARCH_URL};jsessionid=${jsessionId}`
      : CSSP_SEARCH_URL;

    const postResponse = await fetch(postUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookies,
        "Accept": "application/xml, text/xml, */*; q=0.01",
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData.toString(),
    });

    if (!postResponse.ok) {
      return { found: false, error: "Error al consultar el portal CSSP" };
    }

    const resultHtml = await postResponse.text();

    // PrimeFaces AJAX returns XML partial responses
    // Check for "No se encontraron" in the XML
    if (resultHtml.includes("No se encontraron registros") || resultHtml.includes("No se encontraron resultados")) {
      return { found: false };
    }

    // Extraer datos del profesional del XML partial response
    // PrimeFaces DataTable: <td role="gridcell">VALUE</td> after header span
    const cells = resultHtml.match(/role="gridcell"[^>]*>([^<]*)<\/td>/gi) || [];
    // cells[0] = Nombres value, [1] = Apellidos, [2] = N° Junta, [3] = Junta Vigilancia, [4] = Carrera
    const cellValues = cells.map(c => c.replace(/role="gridcell"[^>]*>/i, "").replace(/<\/td>/i, "").trim()).filter(v => v.length > 0);
    const name = cellValues[0] || undefined;
    const lastName = cellValues[1] || undefined;
    const board = cellValues[2] || undefined;
    const profession = cellValues[4] || undefined;

    // Si hay resultados con datos del profesional
    const hasResults = resultHtml.includes("Pagina 1 (1-") || 
                       (resultHtml.includes("Profesionales") && !resultHtml.includes("No se encontraron") && !resultHtml.includes("de 0 Profesionales"));

    if (hasResults || name) {
      const fullName = [name, lastName].filter(Boolean).join(" ");
      return {
        found: true,
        name: fullName || undefined,
        profession: profession,
        board: board,
      };
    }

    return { found: false, error: `Debug: len=${resultHtml.length} full=${resultHtml.replace(/\n/g, " ")}` };
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
    const { nurse_id, cssp_registration, nurse_name, nurse_level }: VerifyRequest = await req.json();

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
      const mismatches: string[] = [];

      if (nurse_name && result.name) {
        const normalize = (s: string) => s.toUpperCase().trim()
          .replace(/[ÁÀ]/g, "A").replace(/[ÉÈ]/g, "E").replace(/[ÍÌ]/g, "I")
          .replace(/[ÓÒ]/g, "O").replace(/[ÚÙ]/g, "U")
          .replace(/\s+(DE|DEL|LA|LAS|LOS|Y)\s+/g, " ")
          .replace(/\s+/g, " ").trim();
        const csspName = normalize(result.name);
        const givenName = normalize(nurse_name);
        const csspParts = csspName.split(" ").filter(p => p.length > 2);
        const givenParts = givenName.split(" ").filter(p => p.length > 2);
        const matchedParts = givenParts.filter(p => csspParts.includes(p));
        result.name_match = matchedParts.length >= Math.ceil(givenParts.length * 0.5);
        if (!result.name_match) {
          mismatches.push(`Nombre no coincide (registrado: "${nurse_name}", CSSP: "${result.name}")`);
        }
      }

      if (nurse_level && result.profession) {
        const profMap: Record<string, string[]> = {
          "Licenciada": ["LIC. EN ENFERMERIA", "LICENCIADA"],
          "Tecnóloga": ["TECNOLOGO", "TECNOLOGA"],
          "Técnica": ["TECNICO", "TECNICA"],
          "Auxiliar": ["AUXILIAR"],
        };
        const expected = profMap[nurse_level] || [];
        const csspProfUpper = result.profession.toUpperCase();
        result.profession_match = expected.some(e => csspProfUpper.includes(e));
        if (!result.profession_match) {
          mismatches.push(`Profesión no coincide (registrada como: "${nurse_level}", CSSP: "${result.profession}")`);
        }
      }

      if (mismatches.length > 0) {
        const notes = `Verificación CSSP con discrepancias: ${mismatches.join("; ")}`;
        await supabase
          .from("nurses")
          .update({
            cssp_verification_status: "pending",
            cssp_verified: false,
            cssp_verification_date: now,
            cssp_verification_notes: notes,
          })
          .eq("id", nurse_id);

        return new Response(
          JSON.stringify({
            status: "pending",
            message: "Registro encontrado pero con discrepancias. Requiere revisión manual.",
            data: result,
            mismatches,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("nurses")
        .update({
          cssp_verification_status: "auto_verified",
          cssp_verified: true,
          cssp_verification_date: now,
          cssp_verification_notes: `Verificado automáticamente. Nombre: ${result.name || "N/A"}, Profesión: ${result.profession || "N/A"}`,
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
